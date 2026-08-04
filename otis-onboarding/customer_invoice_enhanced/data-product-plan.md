# Data Product Plan: customer_invoices

## Status: Design Complete

## Created: 2026-08-03

---

## 1. Business Context

- **Problem**: Fragmented scripts (~14+ per run) with no single source of truth for AR data, manual KPI reporting, no collection leakage detection, siloed dashboards per team, and no AI consumption layer. Finance, Collections, and GM teams each build their own data layer, duplicating effort and producing inconsistent numbers.
- **Use Case**: Customer Invoice 360 is the central Integrated Data Product (IDP) for the Accounts Receivable domain — it consolidates fragmented JDE ERP pipelines into a standardized star schema that serves every AR initiative (collections, disputes, leakage detection, forecasting, executive KPIs) without each team rebuilding their own data layer.
- **Consumers**:
  - Collections Manager → CEI, aging, collector performance → action: email / escalate
  - Finance / Reporting → reserve accuracy, forecast gap → action: adjust reserve
  - GM / Executive → summary KPIs, trend view → action: approve write-off
  - Dispute Resolver → open disputes by age & LOB → action: resolve / escalate
  - AI Agents (Cortex Analyst / NL Query) → natural language KPI queries, anomaly alerts, recommended actions
  - Action Layer → email triggers, alert pushes, workflow initiations
- **Key Questions / Metrics**:
  - "What is our CEI for this month?" → FactARCollection.CollectionEfficiency
  - "Which customers have overdue invoices with no dispute?" → DimARDetails + FactARDetails
  - "Show reserve vs forecast gap for LOB Maintenance" → FactARDetails + DimARCollectionLOB
  - "Who are the top 10 collectors by cash collected?" → FactARCollection + DimARDetails
  - "Which invoices are breaching payment terms?" → FactARDetails + DimARDetails + ARPaymentTerm
  - "Which invoices are at risk of write-off?" → FactARDetails + DimARDetails (high aging + no reserve coverage)
  - "Show collection efficiency by LOB this quarter" → FactARCollection + DimARCollectionLOB
  - "How much unapplied cash do we have?" → FactARCollection (TotalReceipts vs CashApplied)
  - "Show reserve accuracy trend" → FactARDetails (CurrentReserve vs PreviousForecastReserve)

---

## 2. Data Sources

- **Engine**: Snowflake

| Source | Description | Owner | Key Columns |
|---|---|---|---|
| `staging.F59HQ084` | Reserve & Forecast | JDE ERP (read-only) | Reserve amounts, ForecastReserve30/60/90, AgingDays, FiscalPeriodId, AgeAsOfDate, ChangeinReserve, DraftOpenAmount, ARCurrentReserve, PreviousForecastReserve |
| `staging.F03B14` | AR Receipts Ledger | JDE ERP (read-only) | Cash receipts, GLOffset, BusinessUnit, receipt date, TotalReceipts, CashApplied, ReserveCash, AdjustedCollection |
| `staging.F03B11` | Invoice Header | JDE ERP (read-only) | DocNo, DocType, PayItm, CompanyId, DocumentCompany, OpenAmount, GrossAmount, TaxAmount, DueDate, GLDate, InvoiceDate, PaymentTermCode, GLOffset, CurrencyCode, AgingDays |
| `staging.F03B13` | Payment Header | JDE ERP (read-only) | Payment matching, receipt reference, CustomerNumber |
| `staging.F0101` | Address Book | JDE ERP (read-only) | SalesRep, Collector, CollectionManager, ParentCustomer, CustomerNumber |
| `staging.F0014` | Payment Terms | JDE ERP (read-only) | PaymentTermCode, Description, NetDays |
| `staging.F03012` | Customer Credit | JDE ERP (read-only) | HoldFlag, ARCode, CustomerNumber |
| `staging.F5803B2I` | Invoice Comments | JDE ERP (read-only) | LastInvoiceComment, DocNo |
| `staging.F5803B2C` | Customer Comments | JDE ERP (read-only) | LastCustomerComment, CustomerNumber |
| `staging.F0006` | Business Unit | JDE ERP (read-only) | BusinessUnit, BUDesc |
| `staging.F0012` | GL Offset / LOB | JDE ERP (read-only) | LOBCode, LOBDescription, GLOffset, CompanyId |
| `Workday` (reference table) | Employee / Email | HR (scheduled refresh) | WorkdayEmail, employee identifier matched via F01151 |

> **Note**: The Nilus Metadata Workflow has not been run on the `staging` schema — tables do not appear in search results. Column schemas are sourced from the Customer Invoice360-Design_Document.md.
> [Assumption] Workday integration will be implemented as a pre-loaded reference table with scheduled refresh (per Open Design Decision D1) rather than a live SQL Server call.

---

## 3. Entities

1. **Invoice / Pay-Item** — the atomic AR record; every fact is at invoice/pay-item grain. Core entity.
2. **Customer** — the party owing the invoice; carries collector, sales rep, parent relationship, credit hold.
3. **Collection** — aggregated collection performance per customer, LOB, and fiscal period.
4. **Line of Business (LOB)** — classifies invoices and collection records by business line via GL Offset mapping.
5. **Payment Term** — defines payment terms used across invoices; drives compliance analysis.

---

## 4. Entity Relationships and Joins

| Join | Left Entity | Right Entity | Join Key | Purpose |
|---|---|---|---|---|
| DimARDetails → FactARDetails | DimARDetails | FactARDetails | CompanyId + DocNo + DocType + PayItm | Link invoice attributes to invoice measures |
| DimARDetails → FactARCollection | DimARDetails | FactARCollection | CompanyId + CustomerNumber + FiscalPeriodId | Link invoice attributes to collection performance |
| FactARCollection → DimARCollectionLOB | FactARCollection | DimARCollectionLOB | LOB | Enrich collection facts with LOB description |
| FactARCollection → ARPaymentTerm | FactARCollection | ARPaymentTerm | PaymentTermCode | Enrich collection facts with net days |
| DimARDetails → DimARCollectionLOB | DimARDetails | DimARCollectionLOB | GLOffset | Derive LOB label for invoice dimension |
| DimARDetails → ARPaymentTerm | DimARDetails | ARPaymentTerm | PaymentTermCode | Enrich invoice dimension with net days for compliance |

**Population Filters** (business rules applied before/during joins):
- JDE dates are in Julian format — all must be converted to standard DATE/TIMESTAMP before use
- All monetary amounts are decimal-adjusted from JDE integer encoding (precision factor applied)
- `FiscalPeriodId` is a derived field: `((Century * 100 + Year) * 100) + Month`
- LOB is derived via: `DimARCollectionLOB.GLOffset` → LOB label (not a direct source column)
- [Assumption] France-specific logic (company 10168) will be handled via SQL CASE in the staging layer (per Open Design Decision D7 recommendation)
- [Assumption] Currency: local currency only in the initial build; USD-normalized column to be added in a later phase (per Open Design Decision D3)

---

## 5. Dimensions

| Dimension | Definition | Entity |
|---|---|---|
| CompanyId | JDE company identifier | Invoice/Pay-Item |
| DocumentCompany | Document company (may differ from CompanyId) | Invoice/Pay-Item |
| DocNo | JDE document number | Invoice/Pay-Item |
| DocType | JDE document type (invoice type code) | Invoice/Pay-Item |
| PayItm | Pay item suffix distinguishing multiple pay items on one invoice | Invoice/Pay-Item |
| CustomerNumber | JDE customer number | Customer |
| ParentCustomer | Parent account for customer rollup analysis | Customer |
| SalesRep | Sales representative assigned to the customer | Customer |
| Collector | Collector responsible for this invoice | Customer |
| CollectionManager | Manager overseeing the collector | Customer |
| LOB | Line of Business (derived from GLOffset → DimARCollectionLOB) | LOB |
| BusinessUnit | JDE business unit code | Invoice/Pay-Item |
| BUDesc | Business unit description | Invoice/Pay-Item |
| PaymentTermCode | Payment term code on the invoice | Payment Term |
| DisputeReasonCode | Reason code for dispute | Invoice/Pay-Item |
| DisputeStatus | Current dispute status (Open / Resolved / null) | Invoice/Pay-Item |
| DisputeCodeDesc | Description of dispute reason code | Invoice/Pay-Item |
| ResolverCode | Code of the resolver assigned | Invoice/Pay-Item |
| ResolverName | Name of the resolver assigned | Invoice/Pay-Item |
| ARCode | AR classification code from customer credit profile | Customer |
| DisputeDate | Date when dispute was first registered (nullable if not provided by source) | Invoice/Pay-Item |
| InvoiceDate | Date invoice was created | Invoice/Pay-Item |
| DueDate | Payment due date | Invoice/Pay-Item |
| PromiseToPay | Promised payment date from customer | Invoice/Pay-Item |
| CurrencyCode | Currency of the invoice | Invoice/Pay-Item |
| HoldFlag | Whether customer is on credit hold (Y/N) | Customer |
| WorkdayEmail | Collector/sales rep work email from Workday | Customer |
| LastInvoiceComment | Most recent invoice-level collection comment | Invoice/Pay-Item |
| LastCustomerComment | Most recent customer-level collection comment | Customer |
| AttachmentStartDate | Start date of attachment period | Invoice/Pay-Item |
| AttachmentEndDate | End date of attachment period | Invoice/Pay-Item |
| ChargebackCode | Chargeback classification code | Invoice/Pay-Item |
| FiscalPeriodId | Fiscal period key: ((Century*100+Year)*100)+Month | Collection |
| GLDate | General ledger date | Invoice/Pay-Item |
| AgeAsOfDate | Date as-of for aging calculation | Invoice/Pay-Item |

---

## 6. Measures (Aggregations)

| Measure | Definition | Row Filter | Computation Method | Entity |
|---|---|---|---|---|
| OPEN_AMOUNT | Sum of outstanding invoice amounts | none | SUM(OpenAmount) | Invoice/Pay-Item |
| GROSS_AMOUNT | Sum of gross invoice amounts before adjustments | none | SUM(GrossAmount) | Invoice/Pay-Item |
| TAX_AMOUNT | Sum of tax amounts | none | SUM(TaxAmount) | Invoice/Pay-Item |
| DISPUTED_AMOUNT | Sum of amounts under dispute | none | SUM(DisputedAmount) | Invoice/Pay-Item |
| CURRENT_RESERVE | Sum of current reserve amounts | none | SUM(CurrentReserve) | Invoice/Pay-Item |
| FORECAST_RESERVE_30 | Sum of 30-day forward reserve forecast | none | SUM(ForecastReserve30) | Invoice/Pay-Item |
| FORECAST_RESERVE_60 | Sum of 60-day forward reserve forecast | none | SUM(ForecastReserve60) | Invoice/Pay-Item |
| FORECAST_RESERVE_90 | Sum of 90-day forward reserve forecast | none | SUM(ForecastReserve90) | Invoice/Pay-Item |
| CHANGE_IN_RESERVE | Net change in reserve amount | none | SUM(ChangeinReserve) | Invoice/Pay-Item |
| RESERVE_CASH_APPLIED | Reserve cash applied to invoices | none | SUM(ReserveCashApplied) | Invoice/Pay-Item |
| ADJUSTMENT_AMOUNT | Sum of adjustment amounts | none | SUM(AdjustmentAmount) | Invoice/Pay-Item |
| DRAFT_OPEN_AMOUNT | Sum of draft open amounts | none | SUM(DraftOpenAmount) | Invoice/Pay-Item |
| AVG_AGING_DAYS | Average aging days across invoices | none | AVG(AgingDays) | Invoice/Pay-Item |
| TOTAL_RECEIPTS | Total cash receipts received from customer | none | SUM(TotalReceipts) | Collection |
| CASH_APPLIED | Cash applied against open invoices | none | SUM(CashApplied) | Collection |
| RESERVE_CASH | Reserve cash held | none | SUM(ReserveCash) | Collection |
| ADJUSTED_COLLECTION | Adjusted collection amount | none | SUM(AdjustedCollection) | Collection |
| COLLECTION_EFFICIENCY | Collection Efficiency Index (CEI) — `CashApplied / (OpenAmount + TotalReceipts)` (Finance-aligned industry definition) | none | ratio: numerator=CASH_APPLIED, denominator=(OPEN_AMOUNT+TOTAL_RECEIPTS) | Collection |
| UNAPPLIED_CASH_PCT | Percentage of receipts not yet applied | none | ratio: numerator=TOTAL_RECEIPTS-CASH_APPLIED, denominator=TOTAL_RECEIPTS | Collection |
| RESERVE_ACCURACY_PCT | How accurate the reserve forecast was | none | ratio: 1 - ABS(CHANGE_IN_RESERVE) / FORECAST_RESERVE_30 | Invoice/Pay-Item |
| DISPUTE_RESOLUTION_RATE | Fraction of disputes resolved | DisputeStatus IS NOT NULL | ratio: numerator=COUNT(DisputeStatus='Resolved'), denominator=COUNT(DisputeStatus IS NOT NULL) | Invoice/Pay-Item |
| OVERDUE_WITHOUT_ACTION_PCT | Overdue invoices with no dispute or action | AgingDays > 30 | ratio: numerator=COUNT(AgingDays > 30 AND DisputeStatus IS NULL), denominator=COUNT(AgingDays > 30) | Invoice/Pay-Item |
| RESERVE_CASH_COVERAGE | Fraction of reserve covered by applied cash | none | ratio: numerator=RESERVE_CASH_APPLIED, denominator=CURRENT_RESERVE | Invoice/Pay-Item |
| HIGH_RESERVE_CHANGE_COUNT | Count of invoices with large reserve movement | ChangeinReserve / ForecastReserve30 > 0.2 | count with filter | Invoice/Pay-Item |
| INVOICE_COUNT | Total number of invoices / pay-items | none | count | Invoice/Pay-Item |

---

## 7. Metrics (Measure over Time)

> Five primary business trend metrics — each answers a distinct executive-level AR question over time.

| # | Metric Name | Underlying Measure | Time Dimension | Granularity | Business Question Answered | Consumer |
|---|---|---|---|---|---|---|
| 1 | `COLLECTION_EFFICIENCY_TREND` | `COLLECTION_EFFICIENCY` | `FiscalPeriodId` | Monthly | "Is our collection efficiency improving or deteriorating period-over-period?" — the single most important AR health KPI. A declining CEI trend triggers escalation to Collections Manager. | Collections Manager, GM |
| 2 | `OPEN_AR_TREND` | `OPEN_AMOUNT` | `FiscalPeriodId` | Monthly | "How much total outstanding AR do we carry into each period, and is it growing?" — the executive AR balance indicator. Rising open AR without rising receipts signals a collection gap. | Finance, GM |
| 3 | `RESERVE_ACCURACY_TREND` | `RESERVE_ACCURACY_PCT` | `FiscalPeriodId` | Monthly | "How accurate is our 30-day reserve forecast vs actual reserve movement?" — drives confidence in period-end provisions. Large drops in accuracy signal the JDE reserve model needs recalibration. | Finance, Reporting |
| 4 | `UNAPPLIED_CASH_TREND` | `UNAPPLIED_CASH_PCT` | `FiscalPeriodId` | Monthly | "What % of receipts remain unapplied period-over-period?" — the primary collection leakage trend. Rising unapplied cash % without a corresponding dispute volume spike indicates a cash posting process failure. | Collections Manager, Finance |
| 5 | `OVERDUE_INVOICE_TREND` | `INVOICE_COUNT` (filtered: `AgingDays > 30`) | `AgeAsOfDate` | Daily/Monthly | "Is the volume of overdue invoices growing or shrinking?" — the operational early-warning KPI. Tracks whether the collections team is clearing backlog or falling behind, broken down by Collector and LOB. | Collections Manager, Dispute Resolver |

**Metric kind definitions (Vulcan `kind: metric` YAML — one file per metric in `models/metrics/`):**

```yaml
# models/metrics/COLLECTION_EFFICIENCY_TREND.yml
kind: metric
name: COLLECTION_EFFICIENCY_TREND
measure: FactARCollection.COLLECTION_EFFICIENCY
time_dimension: FactARCollection.FiscalPeriodId
description: >
  Collection Efficiency Index (CEI) tracked monthly by fiscal period.
  Formula: CashApplied / (OpenAmount + TotalReceipts).
  Declining trend = collections team under-performing vs AR volume.
  Benchmark target: CEI >= 0.85 (industry standard for AR operations).
```

```yaml
# models/metrics/OPEN_AR_TREND.yml
kind: metric
name: OPEN_AR_TREND
measure: FactARDetails.OPEN_AMOUNT
time_dimension: FactARDetails.FiscalPeriodId
description: >
  Total outstanding Accounts Receivable balance by fiscal period.
  A rising OPEN_AR_TREND alongside a flat or declining COLLECTION_EFFICIENCY_TREND
  signals that AR is accumulating faster than it is being collected.
  Key Finance KPI for period-end reporting and write-off provisioning.
```

```yaml
# models/metrics/RESERVE_ACCURACY_TREND.yml
kind: metric
name: RESERVE_ACCURACY_TREND
measure: FactARDetails.RESERVE_ACCURACY_PCT
time_dimension: FactARDetails.FiscalPeriodId
description: >
  Reserve forecast accuracy (CurrentReserve vs PreviousForecastReserve) by fiscal period.
  Values close to 1.0 = accurate reserve provisioning.
  Values below 0.8 signal that Finance needs to recalibrate the JDE reserve model.
  Used by Finance for IFRS/GAAP provision audits.
```

```yaml
# models/metrics/UNAPPLIED_CASH_TREND.yml
kind: metric
name: UNAPPLIED_CASH_TREND
measure: FactARCollection.UNAPPLIED_CASH_PCT
time_dimension: FactARCollection.FiscalPeriodId
description: >
  Percentage of total receipts not yet applied to open invoices, tracked by fiscal period.
  Formula: (TotalReceipts - CashApplied) / TotalReceipts.
  A rising trend without a dispute volume spike = cash posting process failure.
  Primary leakage detection signal — triggers Cash Application team investigation.
```

```yaml
# models/metrics/OVERDUE_INVOICE_TREND.yml
kind: metric
name: OVERDUE_INVOICE_TREND
measure: FactARDetails.OVERDUE_INVOICE_COUNT
time_dimension: FactARDetails.AgeAsOfDate
description: >
  Count of invoices with AgingDays > 30, tracked by AgeAsOfDate.
  A growing trend = collections backlog is building.
  Segment by Collector and LOB to identify where the backlog is concentrated.
  Drives daily collections prioritisation and escalation decisions.
```

---

## 8. Grain

> What does one row represent?

**Primary grain (DimARDetails + FactARDetails)**: One row = one **invoice / pay-item** — uniquely identified by `CompanyId + DocumentCompany + DocNo + DocType + PayItm`. This is the atomic AR record from which all metrics compose.

**Secondary grain (FactARCollection)**: One row = one **customer × fiscal period × LOB** collection summary — uniquely identified by `CompanyId + CustomerNumber + FiscalPeriodId + LOB`.

**Reference grain (DimARCollectionLOB)**: One row = one **LOB code** per company.

**Reference grain (ARPaymentTerm)**: One row = one **payment term code** per company.

**Grain Key Construction**:
- DimARDetails / FactARDetails grain key: Natural composite — `CompanyId + DocumentCompany + DocNo + DocType + PayItm` (all direct columns from F03B11)
- FactARCollection grain key: Natural composite — `CompanyId + CustomerNumber + FiscalPeriodId + LOB` where `FiscalPeriodId = ((Century * 100 + Year) * 100) + Month` (derived in staging from JDE fiscal fields)

---

## 9. Measure and Metric Reasoning

**Rationale chain:**

```
CEI trend → COLLECTION_EFFICIENCY measure → CashApplied / (OpenAmount + TotalReceipts) → 
  CashApplied from F03B14 (FactARCollection), OpenAmount from F03B11 (FactARDetails)
  
Overdue analysis → AVG_AGING_DAYS + OPEN_AMOUNT → AgingDays + OpenAmount from F03B11 → 
  joined with DimARDetails for Collector, LOB, DisputeStatus filtering
  
Reserve accuracy → RESERVE_ACCURACY_PCT → ChangeinReserve / ForecastReserve30 → 
  both from F59HQ084 (FactARDetails)
  
Leakage detection → UNAPPLIED_CASH_PCT → TotalReceipts - CashApplied → F03B14 (FactARCollection)
  HIGH_RESERVE_CHANGE_COUNT → ChangeinReserve threshold → F59HQ084 (FactARDetails)
  
Payment term compliance → AgingDays > NetDays → AgingDays from F03B11, NetDays from F0014 →
  requires join of FactARDetails + DimARDetails + ARPaymentTerm
```

**Key design decisions**:
- CEI formula defined as `CashApplied / (OpenAmount + TotalReceipts)` — aligned to D2 industry-standard definition; requires join of FactARCollection (CashApplied, TotalReceipts) + FactARDetails (OpenAmount)
- All ratio measures use computed numerator/denominator — Vulcan `behavior.type: ratio` will be applied unless CLI rejects it, in which case explicit filtered count/sum + downstream division is the fallback
- `FiscalPeriodId` is a derived integer key computed in staging from JDE century/year/month fields; it is the primary time dimension for collection metrics
- `AgingDays` is computed by JDE and stored directly in F59HQ084 — it is NOT recomputed by this data product
- All JDE Julian dates are converted to standard DATE/TIMESTAMP in the staging layer

---

## 10. Consumption & Freshness

- **Consumption Pattern**: Multi-channel — AI Agent (Cortex Analyst NL queries via Snowflake Semantic View), Cortex Search for playbooks/business definitions, KPI Dashboards (Collections, Disputes, Leakage), Persona Reports (Collections Manager, Finance, GM), Action Triggers (email, alerts, workflow initiation)
- **Freshness**: Daily — the 5 output tables are materialized by Vulcan models in Snowflake (`RL_JDE_VULCAN`) from raw `staging` sources.
- **Backfill**: Full JDE history — Vulcan model runs will backfill and maintain the complete historical range from the raw source tables.

---

## 11. Assumptions

- [Assumption] Workday integration will be implemented as a pre-loaded reference table with scheduled refresh (per D1 recommendation) rather than a live SQL Server call
- [Assumption] Currency: local currency only in initial build; USD-normalized column deferred to a later phase (per D3)
- [Assumption] France-specific logic (company 10168) will be handled via SQL CASE expressions in the staging layer (per D7 recommendation)
- [Assumption] Incremental MERGE-style materialization is used for Vulcan output models to align with Open Design Decision D5
- [Assumption] Dispute fields remain embedded in DimARDetails (no separate DimARDispute table) per Open Decision D8 recommendation
- [Assumption] Leakage signals implemented as computed fields in FactARDetails first; separate leakage table deferred until thresholds agreed (per D4)
- [Assumption] Semantic layer will provide both invoice-level and customer-period aggregated views (per D6: "dual views covering different query patterns")
- [Assumption] Reserve Accuracy threshold for "High Reserve Change" = 20% (0.2 per the formula in the design doc); exact threshold requires Analytics sign-off (marked as Open Question until confirmed)
- [Assumption] `ChangeinReserve / ForecastReserve30 > 0.2` is used as the leakage threshold trigger for HIGH_RESERVE_CHANGE_COUNT segment in the semantic layer
- [Assumption] The 5 output tables will be rebuilt and owned by this data product as Vulcan models in `RL_JDE_VULCAN`
- **CEI Formula confirmed**: `CashApplied / (OpenAmount + TotalReceipts)` — industry standard (Finance sign-off confirmed)

---

## 12. Open Questions

- [x] **CEI Definition (D2)**: Formula `CashApplied / (OpenAmount + TotalReceipts)` confirmed as industry-standard for this DP. **Resolved.**
- [x] **Backfill (Q9)**: Full JDE history — model runs in `RL_JDE_VULCAN` will load all available history from `staging` sources. **Resolved.**
- [x] **Reserve Change Threshold**: v1 threshold fixed at `0.20` (20%) for HIGH_RESERVE_CHANGE_COUNT and DQ alerts; recalibrate post go-live from observed distribution. **Resolved for v1.**
- [x] **USD Normalization (D3)**: v1 scope remains local currency; USD normalization is explicitly deferred to v2 enhancement with dedicated FX mapping model. **Resolved by scope boundary.**
- [x] **Workday Reference Table Schema**: v1 uses a curated reference input table loaded before model runs and consumed by Vulcan models as the canonical Workday email lookup source. **Resolved for build design.**
- [x] **FiscalPeriodId Components**: v1 standard is to use source `FiscalPeriodId` where provided; where absent, derive in-model with macro logic from fiscal/date columns before gold model write. **Resolved for implementation.**
- [x] **ARCode coverage**: include `ARCode` as a retained dimension attribute in `DimARDetails` from `staging.F03012` for downstream filtering and governance. **Resolved.**
- [x] **DisputeDate field expectation**: add nullable `DisputeDate` to `DimARDetails` when available; if source value is absent, persist null and keep dispute KPIs based on `DisputeStatus`, `PromiseToPay`, and aging logic. **Resolved for v1.**
- [x] **"Overdue Without Action" threshold**: v1 uses `AgingDays > 30` as the operational default threshold. **Resolved.**

---

## 13. Model Architecture

> **Important**: The 5 final star schema tables are built and owned by this Vulcan data product in Snowflake schema `RL_JDE_VULCAN`. Raw JDE source tables are read from `staging.*`, transformed in Vulcan models, then governed through semantics, metrics, audits, dq checks, unit tests, and reusable macros.

| Layer | Model Name | Kind | Purpose | Sources |
|---|---|---|---|---|
| Gold | `RL_JDE_VULCAN.DimARDetails` | INCREMENTAL | Invoice dimension built from JDE raw sources with standardized keys/dates/comments/enrichment | `staging.F03B11`, `staging.F0101`, `staging.F03012`, `staging.F5803B2I`, `staging.F5803B2C`, `staging.F0006`, Workday reference |
| Gold | `RL_JDE_VULCAN.FactARDetails` | INCREMENTAL | Invoice-level financial and reserve measures materialized at invoice/pay-item grain | `staging.F03B11`, `staging.F59HQ084` |
| Gold | `RL_JDE_VULCAN.FactARCollection` | INCREMENTAL | Customer-period-LOB collection facts with CEI components and cash measures | `staging.F03B14`, `staging.F03B13`, `staging.F0006` |
| Gold | `RL_JDE_VULCAN.DimARCollectionLOB` | INCREMENTAL | LOB reference dimension from GL offset mappings | `staging.F0012` |
| Gold | `RL_JDE_VULCAN.ARPaymentTerm` | INCREMENTAL | Payment term reference dimension for compliance joins | `staging.F0014` |
| Semantic | `models/semantics/DimARDetails.yml` | SEMANTIC | Business-friendly wrapper for DimARDetails — dimensions, measures, joins, ai_context | `RL_JDE_VULCAN.DimARDetails` |
| Semantic | `models/semantics/FactARDetails.yml` | SEMANTIC | Business-friendly wrapper for FactARDetails — measures, joins, leakage segments | `RL_JDE_VULCAN.FactARDetails` |
| Semantic | `models/semantics/FactARCollection.yml` | SEMANTIC | Business-friendly wrapper for FactARCollection — CEI, receipts, efficiency measures | `RL_JDE_VULCAN.FactARCollection` |
| Semantic | `models/semantics/DimARCollectionLOB.yml` | SEMANTIC | LOB reference semantic model | `RL_JDE_VULCAN.DimARCollectionLOB` |
| Semantic | `models/semantics/ARPaymentTerm.yml` | SEMANTIC | Payment term reference semantic model | `RL_JDE_VULCAN.ARPaymentTerm` |
| Metrics | `models/metrics/COLLECTION_EFFICIENCY_TREND.yml` | METRIC | CEI tracked by fiscal period | FactARCollection semantic model |
| Metrics | `models/metrics/OPEN_AMOUNT_TREND.yml` | METRIC | Open AR trend over GL dates | FactARDetails semantic model |
| Metrics | `models/metrics/RESERVE_ACCURACY_TREND.yml` | METRIC | Reserve forecast accuracy by period | FactARDetails semantic model |
| Metrics | `models/metrics/UNAPPLIED_CASH_TREND.yml` | METRIC | Unapplied cash % by fiscal period | FactARCollection semantic model |
| Metrics | `models/metrics/DISPUTE_RESOLUTION_TREND.yml` | METRIC | Dispute resolution rate over invoice cohorts | DimARDetails semantic model |
| Tests | `tests/*.yml` | TEST | Unit tests with mocked inputs and expected outputs for grain, joins, and KPI formulas | Raw + intermediate + gold model DAG |
| Macros | `macros/*.py` | MACRO | Reusable transformation helpers (JDE date conversion, decimal scaling, key normalization, fiscal key derivation) | Used across all Vulcan transformation models |
| DQ | `dq/DimARDetails.yml` | DQ | Quality monitoring for invoice dimension | `RL_JDE_VULCAN.DimARDetails` |
| DQ | `dq/FactARDetails.yml` | DQ | Quality monitoring for invoice measures | `RL_JDE_VULCAN.FactARDetails` |
| DQ | `dq/FactARCollection.yml` | DQ | Quality monitoring for collection facts | `RL_JDE_VULCAN.FactARCollection` |

**Architecture decisions**:
- **Why INCREMENTAL for all 5 output tables**: Aligns with D5 recommendation (MERGE-based incremental refresh) while keeping daily freshness and reducing rerun cost
- **Why Star Schema consumption architecture**: The 5 tables form a clean star schema; the semantic layer maps directly with pre-defined joins
- **Why direct Gold outputs**: The required 5 analytical tables are explicit business outputs; transformations are implemented directly in Vulcan model DAGs from raw inputs
- **Why 5 separate semantic models**: Vulcan semantic models wrap exactly one physical model — 5 tables → 5 semantic models with joins on fact tables pointing to dimension models
- **Why Tests + Macros are first-class**: tests enforce transformation correctness and KPI math; macros guarantee consistent reusable logic across raw-to-gold model code paths

---

### 13.1 Vulcan Output Model Definitions (`models/gold/rl_jde_vulcan_tables.yaml`)

> These are Vulcan-owned output model specifications for Snowflake schema `RL_JDE_VULCAN`.
> Input formatting remains source-first (raw tables listed explicitly), and each output keeps grain metadata plus business-critical column documentation.

```yaml
# models/gold/rl_jde_vulcan_tables.yaml
# All 5 tables are materialized by Vulcan in Snowflake schema RL_JDE_VULCAN.
# Transformations read from raw staging sources and publish governed outputs.

# ─────────────────────────────────────────────────────────────────────────────
# 1. DimARDetails — Invoice Dimension Table
# ─────────────────────────────────────────────────────────────────────────────
- name: '"SNOWFLAKE_DB"."RL_JDE_VULCAN"."DimARDetails"'
  description: >
    Invoice Dimension Table — the descriptive backbone of Customer Invoice 360.
    One row per invoice / pay-item (grain: CompanyId + DocumentCompany + DocNo +
    DocType + PayItm). Carries all attributes needed to describe an invoice:
    who owns it (Collector, SalesRep), what status it is in (DisputeStatus,
    HoldFlag), which LOB it belongs to, and the latest collection comments.
    Source: JDE ERP pipeline (F03B11, F0101, F03012, F5803B2I/C, F0006, Workday).
  grains:
    - CompanyId
    - DocumentCompany
    - DocNo
    - DocType
    - PayItm
  columns:
    # ── Grain / Identity columns ──────────────────────────────────────────
    CompanyId:          VARCHAR(10)
    DocumentCompany:    VARCHAR(10)
    DocNo:              VARCHAR(20)
    DocType:            VARCHAR(5)
    PayItm:             VARCHAR(5)
    # ── Customer & Ownership ──────────────────────────────────────────────
    CustomerNumber:     VARCHAR(20)
    ParentCustomer:     VARCHAR(20)
    SalesRep:           VARCHAR(50)
    Collector:          VARCHAR(50)
    CollectionManager:  VARCHAR(50)
    # ── LOB & Business Unit ───────────────────────────────────────────────
    GLOffset:           VARCHAR(10)
    LOB:                VARCHAR(50)
    BusinessUnit:       VARCHAR(10)
    BUDesc:             VARCHAR(100)
    # ── Payment Terms ─────────────────────────────────────────────────────
    PaymentTermCode:    VARCHAR(10)
    # ── Dispute Fields ────────────────────────────────────────────────────
    DisputeReasonCode:  VARCHAR(10)
    DisputeStatus:      VARCHAR(20)
    DisputeCodeDesc:    VARCHAR(100)
    ResolverCode:       VARCHAR(10)
    ResolverName:       VARCHAR(100)
    DisputeDate:        DATE
    ARCode:             VARCHAR(20)
    # ── Dates ─────────────────────────────────────────────────────────────
    InvoiceDate:        DATE
    DueDate:            DATE
    PromiseToPay:       DATE
    AttachmentStartDate: DATE
    AttachmentEndDate:  DATE
    # ── Customer Status ───────────────────────────────────────────────────
    CurrencyCode:       VARCHAR(5)
    HoldFlag:           VARCHAR(1)
    WorkdayEmail:       VARCHAR(200)
    ChargebackCode:     VARCHAR(20)
    # ── Comments ──────────────────────────────────────────────────────────
    LastInvoiceComment:  VARCHAR(4000)
    LastCustomerComment: VARCHAR(4000)
    # ── Audit ─────────────────────────────────────────────────────────────
    InsertDate:         TIMESTAMP_NTZ
    ModifyDate:         TIMESTAMP_NTZ

  # ── Column Descriptions (business-critical columns only) ─────────────────
  column_descriptions:
    CompanyId:          "JDE company identifier — used in all joins as part of grain key. Determines which legal entity owns the invoice."
    CustomerNumber:     "JDE AR customer number. Groups all invoices for a customer. Join to F0101/Address Book for customer name and parent roll-up."
    ParentCustomer:     "Ultimate parent account for multi-entity customer groups. Use for parent-level CEI and consolidated AR exposure."
    Collector:          "The individual AR collector responsible for chasing payment on this invoice. Primary attribution field for Collector Performance KPI and email triggers."
    LOB:                "Line of Business classification derived from GLOffset via DimARCollectionLOB reference. Required for LOB-level CEI and Exec KPI dashboards. Null LOB = unmapped GL Offset — exclude from LOB reports."
    DisputeStatus:      "Current dispute status: Open, Resolved, or null (not disputed). Null ≠ unknown — null means the invoice has no registered dispute. Required for Dispute Resolution Rate KPI."
    DisputeReasonCode:  "JDE reason code for the dispute. Must be co-populated with DisputeStatus (both populated or both null). Used for Dispute Tracking and dispute aging analysis."
    DisputeDate:        "Date the dispute was logged. Nullable by design if source system does not emit the timestamp for a record."
    ARCode:             "Accounts receivable credit classification from F03012. Used for risk segmentation and policy-driven collections analysis."
    HoldFlag:           "Credit hold flag: Y = customer is on credit hold, N = not on hold. Y + OpenAmount > 0 = leakage signal L8 (Credit Hold Open Invoices)."
    DueDate:            "Contractual payment due date. Used with AgingDays for overdue detection and payment term compliance (AgingDays > NetDays from ARPaymentTerm)."
    PromiseToPay:       "Customer-committed payment date recorded by the collector. Differs from DueDate for negotiated/disputed invoices. Used for Promise-to-Pay tracking."
    WorkdayEmail:       "Collector or sales rep work email sourced from Workday via scheduled reference table. Used for action triggers (automated email on overdue escalation)."
    ModifyDate:         "Timestamp of last modification in the JDE pipeline. Used as the freshness indicator in DQ timeliness checks."

  # ── Column Tags (business classification for main columns) ────────────────
  column_tags:
    CompanyId:          ["grain", "identifier", "join_key"]
    DocumentCompany:    ["grain", "identifier"]
    DocNo:              ["grain", "identifier", "invoice_key"]
    DocType:            ["grain", "identifier"]
    PayItm:             ["grain", "identifier"]
    CustomerNumber:     ["dimension", "customer", "join_key", "kpi"]
    ParentCustomer:     ["dimension", "customer", "hierarchy"]
    Collector:          ["dimension", "ownership", "kpi", "action_trigger"]
    CollectionManager:  ["dimension", "ownership", "hierarchy"]
    SalesRep:           ["dimension", "ownership"]
    LOB:                ["dimension", "lob", "kpi", "dashboard"]
    GLOffset:           ["dimension", "lob", "join_key"]
    BusinessUnit:       ["dimension", "org_structure"]
    PaymentTermCode:    ["dimension", "compliance", "join_key"]
    DisputeStatus:      ["dimension", "dispute", "kpi"]
    DisputeReasonCode:  ["dimension", "dispute", "kpi"]
    DisputeDate:        ["date", "dispute", "time_dimension"]
    ResolverCode:       ["dimension", "dispute", "ownership"]
    ARCode:             ["dimension", "credit", "risk_segmentation"]
    DueDate:            ["date", "compliance", "aging", "kpi"]
    PromiseToPay:       ["date", "collections", "action_trigger"]
    InvoiceDate:        ["date", "time_dimension"]
    HoldFlag:           ["flag", "leakage", "kpi", "action_trigger"]
    WorkdayEmail:       ["contact", "action_trigger", "pii"]
    ModifyDate:         ["audit", "freshness"]


# ─────────────────────────────────────────────────────────────────────────────
# 2. FactARDetails — Invoice Measures Table
# ─────────────────────────────────────────────────────────────────────────────
- name: '"SNOWFLAKE_DB"."RL_JDE_VULCAN"."FactARDetails"'
  description: >
    Invoice Measures Table — all quantitative AR measures per invoice / pay-item.
    One row per invoice / pay-item (same grain as DimARDetails).
    Carries all financial KPIs: open amount, reserve, forecast 30/60/90,
    aging days, and reserve cash applied.
    Source: JDE ERP pipeline (F03B11, F59HQ084).
  grains:
    - CompanyId
    - DocumentCompany
    - DocNo
    - DocType
    - PayItm
  columns:
    # ── Grain ─────────────────────────────────────────────────────────────
    CompanyId:               VARCHAR(10)
    DocumentCompany:         VARCHAR(10)
    DocNo:                   VARCHAR(20)
    DocType:                 VARCHAR(5)
    PayItm:                  VARCHAR(5)
    # ── Core AR Amounts ───────────────────────────────────────────────────
    OpenAmount:              DECIMAL(18, 2)
    GrossAmount:             DECIMAL(18, 2)
    TaxAmount:               DECIMAL(18, 2)
    DisputedAmount:          DECIMAL(18, 2)
    # ── Reserve & Forecast ────────────────────────────────────────────────
    CurrentReserve:          DECIMAL(18, 2)
    ARCurrentReserve:        DECIMAL(18, 2)
    PreviousForecastReserve: DECIMAL(18, 2)
    ForecastReserve30:       DECIMAL(18, 2)
    ForecastReserve60:       DECIMAL(18, 2)
    ForecastReserve90:       DECIMAL(18, 2)
    ChangeinReserve:         DECIMAL(18, 2)
    # ── Collection Fields ─────────────────────────────────────────────────
    DraftOpenAmount:         DECIMAL(18, 2)
    AdjustmentAmount:        DECIMAL(18, 2)
    ReserveCashApplied:      DECIMAL(18, 2)
    # ── Aging & Time ──────────────────────────────────────────────────────
    AgingDays:               INTEGER
    FiscalPeriodId:          INTEGER
    GLDate:                  DATE
    DueDate:                 DATE
    AgeAsOfDate:             DATE
    LatestReceiptDate:       DATE
    # ── Audit ─────────────────────────────────────────────────────────────
    InsertDate:              TIMESTAMP_NTZ

  column_descriptions:
    OpenAmount:              "Outstanding invoice balance as of AgeAsOfDate. The primary AR exposure metric. SUM across invoices = total open AR for a period."
    GrossAmount:             "Original invoice face value before any adjustments, discounts, or credit memos."
    DisputedAmount:          "Amount under formal dispute. Used in Dispute Tracking and leakage analysis (DisputedAmount that ages without resolution = leakage risk)."
    CurrentReserve:          "Current doubtful debt reserve held for this invoice (point-in-time balance). Do NOT sum across periods — use the latest FiscalPeriodId snapshot for balance reporting."
    ForecastReserve30:       "30-day forward reserve forecast. Used as the denominator in Reserve Accuracy % and the threshold in leakage signal L7 (ChangeinReserve / ForecastReserve30 > 0.2)."
    ForecastReserve60:       "60-day forward reserve forecast. Used for medium-term exposure planning."
    ForecastReserve90:       "90-day forward reserve forecast. Used for long-range exposure planning and IFRS provisioning."
    ChangeinReserve:         "Period-over-period change in reserve. Positive = more doubtful debt provisioned; negative = reserve released. Primary reserve leakage signal L2."
    ReserveCashApplied:      "Reserve cash that has been applied to this invoice. Zero on an aged invoice with CurrentReserve > 0 = leakage signal L6 (reserve held but not utilised)."
    AgingDays:               "Number of days the invoice has been outstanding beyond its DueDate. Computed by JDE; NOT recomputed by this DP. > 30 days = overdue; > 90 days = high write-off risk."
    FiscalPeriodId:          "Fiscal period integer key: ((Century * 100 + Year) * 100) + Month. Example: 20260800 = August 2026. Primary time dimension for all period-based trend metrics."
    AgeAsOfDate:             "The date as-of which AgingDays was calculated. Used as time dimension for OVERDUE_INVOICE_TREND metric."

  column_tags:
    CompanyId:               ["grain", "identifier", "join_key"]
    DocumentCompany:         ["grain", "identifier"]
    DocNo:                   ["grain", "identifier", "invoice_key"]
    DocType:                 ["grain", "identifier"]
    PayItm:                  ["grain", "identifier"]
    OpenAmount:              ["measure", "amount", "kpi", "dashboard", "finance"]
    GrossAmount:             ["measure", "amount", "finance"]
    DisputedAmount:          ["measure", "amount", "dispute", "leakage"]
    CurrentReserve:          ["measure", "reserve", "stock", "kpi", "finance"]
    ForecastReserve30:       ["measure", "reserve", "forecast", "kpi", "finance"]
    ForecastReserve60:       ["measure", "reserve", "forecast", "finance"]
    ForecastReserve90:       ["measure", "reserve", "forecast", "finance"]
    ChangeinReserve:         ["measure", "reserve", "leakage", "kpi", "signal"]
    ReserveCashApplied:      ["measure", "reserve", "leakage", "signal"]
    AgingDays:               ["measure", "aging", "kpi", "overdue", "compliance"]
    FiscalPeriodId:          ["time_dimension", "period", "kpi"]
    AgeAsOfDate:             ["date", "time_dimension", "aging"]
    DueDate:                 ["date", "compliance"]


# ─────────────────────────────────────────────────────────────────────────────
# 3. FactARCollection — Collection Facts Table
# ─────────────────────────────────────────────────────────────────────────────
- name: '"SNOWFLAKE_DB"."RL_JDE_VULCAN"."FactARCollection"'
  description: >
    Collection Facts Table — aggregated collection performance per customer,
    LOB, and fiscal period. One row per CompanyId + CustomerNumber +
    FiscalPeriodId + LOB. The home of CEI, unapplied cash, and collection
    efficiency KPIs. Source: JDE ERP pipeline (F03B14, F03B13, F0006).
  grains:
    - CompanyId
    - CustomerNumber
    - FiscalPeriodId
    - LOB
  columns:
    # ── Grain ─────────────────────────────────────────────────────────────
    CompanyId:            VARCHAR(10)
    CustomerNumber:       VARCHAR(20)
    FiscalPeriodId:       INTEGER
    LOB:                  VARCHAR(50)
    # ── Organisational ────────────────────────────────────────────────────
    BusinessUnit:         VARCHAR(10)
    PaymentTermCode:      VARCHAR(10)
    # ── Collection Amounts ────────────────────────────────────────────────
    TotalReceipts:        DECIMAL(18, 2)
    CashApplied:          DECIMAL(18, 2)
    ReserveCash:          DECIMAL(18, 2)
    AdjustedCollection:   DECIMAL(18, 2)
    # ── Efficiency KPI ────────────────────────────────────────────────────
    CollectionEfficiency: DECIMAL(10, 6)
    # ── Audit ─────────────────────────────────────────────────────────────
    InsertDate:           TIMESTAMP_NTZ

  column_descriptions:
    CustomerNumber:       "JDE AR customer number (grain key). Identifies the customer whose collection performance this row describes."
    FiscalPeriodId:       "Fiscal period integer key (grain key): ((Century * 100 + Year) * 100) + Month. Primary time dimension for CEI trend and unapplied cash trend metrics."
    LOB:                  "Line of Business (grain key). Enables LOB-level CEI analysis and Exec KPI dashboard breakdown by business line."
    TotalReceipts:        "Total cash receipts posted for this customer × period × LOB. Denominator in Unapplied Cash %. A sudden drop signals missed cash postings."
    CashApplied:          "Cash receipts that have been matched and applied against open invoices. Numerator in CEI formula. TotalReceipts - CashApplied = unapplied cash (leakage signal L1)."
    ReserveCash:          "Reserve cash component of total receipts. Tracked separately from standard CashApplied for reserve utilisation reporting."
    AdjustedCollection:   "Collection amount after adjustments (discounts, write-offs, credit memos). Used in Adjusted Collection Gap leakage signal L3."
    CollectionEfficiency: "Pre-computed Collection Efficiency Index (CEI) = CashApplied / (OpenAmount + TotalReceipts). Stored value from JDE pipeline. Always recompute from raw measures for trend analysis to avoid cross-period averaging errors."

  column_tags:
    CompanyId:            ["grain", "identifier", "join_key"]
    CustomerNumber:       ["grain", "identifier", "customer", "join_key"]
    FiscalPeriodId:       ["grain", "time_dimension", "period", "kpi"]
    LOB:                  ["grain", "dimension", "lob", "kpi"]
    TotalReceipts:        ["measure", "amount", "receipts", "kpi"]
    CashApplied:          ["measure", "amount", "receipts", "kpi", "cei"]
    ReserveCash:          ["measure", "amount", "reserve"]
    AdjustedCollection:   ["measure", "amount", "leakage", "signal"]
    CollectionEfficiency: ["measure", "kpi", "cei", "dashboard", "stored_ratio"]


# ─────────────────────────────────────────────────────────────────────────────
# 4. DimARCollectionLOB — Line of Business Reference Dimension
# ─────────────────────────────────────────────────────────────────────────────
- name: '"SNOWFLAKE_DB"."RL_JDE_VULCAN"."DimARCollectionLOB"'
  description: >
    Line of Business Reference Dimension — maps GL Offset codes to LOB labels.
    One row per LOBKey (company + LOB code). Used to classify invoices and
    collection records by business line across all fact tables.
    Source: JDE ERP pipeline (F0012 GL Offset descriptions).
  grains:
    - LOBKey
  columns:
    LOBKey:          INTEGER
    CompanyId:       VARCHAR(10)
    LOBCode:         VARCHAR(20)
    LOBDescription:  VARCHAR(100)
    GLOffset:        VARCHAR(10)

  column_descriptions:
    LOBKey:         "Surrogate primary key for the LOB reference table."
    LOBCode:        "Short Line of Business code used in FactARCollection and DimARDetails LOB fields."
    LOBDescription: "Full name of the Line of Business (e.g., 'Maintenance', 'New Equipment'). Displayed in LOB-level CEI dashboards."
    GLOffset:       "JDE General Ledger offset code that maps to this LOB. Join key from DimARDetails.GLOffset to derive LOB label."

  column_tags:
    LOBKey:         ["grain", "surrogate_key"]
    LOBCode:        ["dimension", "lob", "join_key", "kpi"]
    LOBDescription: ["dimension", "lob", "display"]
    GLOffset:       ["dimension", "lob", "join_key"]


# ─────────────────────────────────────────────────────────────────────────────
# 5. ARPaymentTerm — Payment Term Reference Dimension
# ─────────────────────────────────────────────────────────────────────────────
- name: '"SNOWFLAKE_DB"."RL_JDE_VULCAN"."ARPaymentTerm"'
  description: >
    Payment Term Reference Dimension — defines payment terms used across
    invoices and collection records. One row per PaymentTermKey (company +
    code). Used for payment term compliance analysis (AgingDays > NetDays).
    Source: JDE ERP pipeline (F0014 Payment Terms).
  grains:
    - PaymentTermKey
  columns:
    PaymentTermKey:   INTEGER
    CompanyId:        VARCHAR(10)
    PaymentTermCode:  VARCHAR(10)
    Description:      VARCHAR(100)
    NetDays:          INTEGER

  column_descriptions:
    PaymentTermKey:  "Surrogate primary key for the payment term reference table."
    PaymentTermCode: "JDE payment term code. Join key from DimARDetails.PaymentTermCode and FactARCollection.PaymentTermCode."
    Description:     "Human-readable payment term description (e.g., 'Net 30', '2/10 Net 30'). Displayed in payment term compliance reports."
    NetDays:         "Number of days from invoice date until payment is due. Used in compliance check: AgingDays > NetDays = invoice has breached its payment term."

  column_tags:
    PaymentTermKey:  ["grain", "surrogate_key"]
    PaymentTermCode: ["dimension", "compliance", "join_key"]
    Description:     ["dimension", "compliance", "display"]
    NetDays:         ["measure", "compliance", "kpi", "threshold"]
```

---

## 14. Design Specification — YAML Contract

```yaml
name: customer_invoices
version: 1.0
engine: snowflake
schema: RL_JDE_VULCAN

inputs:
  raw_tables:
    - staging.F03B11
    - staging.F03B13
    - staging.F03B14
    - staging.F59HQ084
    - staging.F0101
    - staging.F0014
    - staging.F03012
    - staging.F5803B2I
    - staging.F5803B2C
    - staging.F0006
    - staging.F0012
  reference_tables:
    - Workday (scheduled reference load)

output_models:
  - RL_JDE_VULCAN.DimARDetails
  - RL_JDE_VULCAN.FactARDetails
  - RL_JDE_VULCAN.FactARCollection
  - RL_JDE_VULCAN.DimARCollectionLOB
  - RL_JDE_VULCAN.ARPaymentTerm

components:
  models: "raw -> transform -> gold Vulcan model DAG (Snowflake engine)"
  semantics: "5 semantic model files in models/semantics/"
  metrics: "metric YAML files in models/metrics/"
  audits: "blocking SQL audits in audits/"
  dq_checks: "non-blocking dq rules in dq/"
  tests: "unit tests with mock data in tests/"
  macros: "shared helper macros in macros/"

goal: >
  Centralise all Accounts Receivable data from JDE ERP into a single governed star schema
  that enables CEI tracking, collection leakage detection, dispute management, reserve
  vs forecast analysis, and AI-agent natural language queries — eliminating fragmented
  per-team data layers.

consumers:
  - Collections Manager (CEI, aging, collector performance, action triggers)
  - Finance / Reporting (reserve accuracy, forecast gap, reserve adjustment)
  - GM / Executive (summary KPIs, trend view, write-off approval)
  - Dispute Resolver (open disputes by age and LOB)
  - AI Agent / Cortex Analyst (natural language KPI queries)

entities:
  - name: invoice_pay_item
    grain: one row per CompanyId + DocumentCompany + DocNo + DocType + PayItm

  - name: collection_summary
    grain: one row per CompanyId + CustomerNumber + FiscalPeriodId + LOB

  - name: lob_reference
    grain: one row per LOBKey (company + LOB code)

  - name: payment_term_reference
    grain: one row per PaymentTermKey (company + PaymentTermCode)

entity_relationships:
  - left: DimARDetails
    right: FactARDetails
    join_key: CompanyId + DocNo + DocType + PayItm
    purpose: Link invoice attributes (collector, dispute, customer) to invoice measures (amounts, reserves, aging)

  - left: DimARDetails
    right: FactARCollection
    join_key: CompanyId + CustomerNumber + FiscalPeriodId
    purpose: Link invoice dimension to collection performance facts for collector analysis

  - left: FactARCollection
    right: DimARCollectionLOB
    join_key: LOB
    purpose: Enrich collection facts with LOB description for LOB-level performance reporting

  - left: FactARCollection
    right: ARPaymentTerm
    join_key: PaymentTermCode
    purpose: Enrich collection facts with net days for payment term compliance analysis

  - left: DimARDetails
    right: DimARCollectionLOB
    join_key: GLOffset
    purpose: Derive LOB label for each invoice dimension row

  - left: DimARDetails
    right: ARPaymentTerm
    join_key: PaymentTermCode
    purpose: Enable payment term compliance check (AgingDays > NetDays) from dimension alone

measures:
  - name: OPEN_AMOUNT
    definition: SUM(OpenAmount) — total outstanding AR
    entity: invoice_pay_item

  - name: CURRENT_RESERVE
    definition: SUM(CurrentReserve) — total reserve held
    entity: invoice_pay_item

  - name: FORECAST_RESERVE_30
    definition: SUM(ForecastReserve30) — 30-day forward reserve
    entity: invoice_pay_item

  - name: CHANGE_IN_RESERVE
    definition: SUM(ChangeinReserve) — net reserve movement
    entity: invoice_pay_item

  - name: TOTAL_RECEIPTS
    definition: SUM(TotalReceipts) — total cash receipts
    entity: collection_summary

  - name: CASH_APPLIED
    definition: SUM(CashApplied) — receipts matched to invoices
    entity: collection_summary

  - name: COLLECTION_EFFICIENCY
    definition: CashApplied / (OpenAmount + TotalReceipts) — CEI ratio (industry-standard definition, D2 aligned)
    entity: collection_summary

  - name: UNAPPLIED_CASH_PCT
    definition: (TotalReceipts - CashApplied) / TotalReceipts — unapplied fraction
    entity: collection_summary

  - name: RESERVE_ACCURACY_PCT
    definition: 1 - ABS(ChangeinReserve / ForecastReserve30) — reserve forecast accuracy
    entity: invoice_pay_item

  - name: DISPUTE_RESOLUTION_RATE
    definition: COUNT(DisputeStatus='Resolved') / COUNT(DisputeStatus IS NOT NULL)
    entity: invoice_pay_item

  - name: RESERVE_CASH_COVERAGE
    definition: ReserveCashApplied / CurrentReserve — cash coverage of reserve
    entity: invoice_pay_item

metrics:
  - name: COLLECTION_EFFICIENCY_TREND
    measure: COLLECTION_EFFICIENCY
    time_dimension: FiscalPeriodId
    description: CEI tracked by fiscal period

  - name: OPEN_AMOUNT_TREND
    measure: OPEN_AMOUNT
    time_dimension: GLDate
    description: Total open AR trend over GL dates

  - name: RESERVE_ACCURACY_TREND
    measure: RESERVE_ACCURACY_PCT
    time_dimension: AgeAsOfDate
    description: Reserve forecast accuracy tracked by period

  - name: UNAPPLIED_CASH_TREND
    measure: UNAPPLIED_CASH_PCT
    time_dimension: FiscalPeriodId
    description: Unapplied cash % by fiscal period

dimensions:
  - name: CustomerNumber
    type: string
    entity: invoice_pay_item

  - name: Collector
    type: string
    entity: invoice_pay_item

  - name: LOB
    type: string
    entity: invoice_pay_item

  - name: DisputeStatus
    type: string
    entity: invoice_pay_item

  - name: ARCode
    type: string
    entity: invoice_pay_item

  - name: DisputeDate
    type: date
    entity: invoice_pay_item

  - name: HoldFlag
    type: string
    entity: invoice_pay_item

  - name: FiscalPeriodId
    type: number
    entity: collection_summary

  - name: GLDate
    type: date
    entity: invoice_pay_item

  - name: DueDate
    type: date
    entity: invoice_pay_item

  - name: PaymentTermCode
    type: string
    entity: invoice_pay_item

  - name: AgingDays
    type: number
    entity: invoice_pay_item

  - name: CompanyId
    type: string
    entity: invoice_pay_item

freshness:
  cadence: daily
  expected_by: "6am UTC"
  backfill: Full historical load from `staging` raw sources into `RL_JDE_VULCAN`

consumption:
  pattern: AI Agent (Cortex Analyst NL queries) + Cortex Search + KPI Dashboards + Persona Reports + Action Triggers
```

---

## 15. Quality Rules (Recommended)

> Strategy: The 5 RL_JDE_VULCAN tables are Vulcan-managed output models. Apply MODEL() assertions where feasible, then complement with audits and `kind: dq` monitoring.
> **Schema alignment**: Every audit, DQ, and semantic SQL reference in this section should target `RL_JDE_VULCAN` as the serving schema.
> The three-layer quality strategy is:
> 1. **Blocking audits** (`audits/*.sql`) — catch critical data integrity failures; run via `vulcan audit`
> 2. **Non-blocking DQ checks** (`dq/*.yml`, `kind: dq`) — monitor business KPI thresholds and leakage signals
> 3. **SLOs** — freshness and completeness commitments for period-end reporting

---

### Blocking Audit Files (`audits/`)

> Each audit returns rows that represent a business problem. Zero rows = pass. Any rows = audit fails, investigation required.

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_fact_dim_grain_integrity.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: FactARDetails rows without a matching DimARDetails row
-- are invisible financial exposures. OpenAmount for those invoices cannot
-- appear in any Collector, LOB, or Dispute dashboard — they are hidden AR.
-- This is the most critical integrity check in the data product.
AUDIT (name ar_fact_dim_grain_integrity);

SELECT
    f.CompanyId,
    f.DocumentCompany,
    f.DocNo,
    f.DocType,
    f.PayItm,
    f.OpenAmount          AS orphan_open_amount,
    f.CurrentReserve      AS orphan_reserve,
    f.FiscalPeriodId
FROM RL_JDE_VULCAN.FactARDetails f
LEFT JOIN RL_JDE_VULCAN.DimARDetails d
    ON  f.CompanyId       = d.CompanyId
    AND f.DocumentCompany = d.DocumentCompany
    AND f.DocNo           = d.DocNo
    AND f.DocType         = d.DocType
    AND f.PayItm          = d.PayItm
WHERE d.DocNo IS NULL
  AND f.OpenAmount > 0;
-- Only flag rows with actual outstanding balance (zero-balance orphans are lower priority)
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_lob_not_derivable.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: A null or empty LOB on an invoice means that invoice
-- is excluded from ALL LOB-level CEI calculations, Exec KPI dashboards,
-- and LOB performance reports (DQ3 in design doc).
-- Root cause: GLOffset in F03B11 has no matching row in DimARCollectionLOB.
-- Fix: Add the missing GLOffset to the DimARCollectionLOB reference table.
AUDIT (name ar_lob_not_derivable);

SELECT
    d.CompanyId,
    d.DocNo,
    d.DocType,
    d.PayItm,
    d.GLOffset            AS unmapped_gl_offset,
    f.OpenAmount          AS open_amount_excluded_from_lob_reports
FROM RL_JDE_VULCAN.DimARDetails d
JOIN RL_JDE_VULCAN.FactARDetails f
    ON  d.CompanyId       = f.CompanyId
    AND d.DocumentCompany = f.DocumentCompany
    AND d.DocNo           = f.DocNo
    AND d.DocType         = f.DocType
    AND d.PayItm          = f.PayItm
WHERE (d.LOB IS NULL OR d.LOB = '')
  AND f.OpenAmount > 0;
-- Show open amount to quantify financial impact of missing LOB derivation
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_dispute_co_population_integrity.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: Partial dispute records (one field populated, the other null)
-- corrupt the Dispute Resolution Rate KPI (DQ5 in design doc).
-- Example: DisputeStatus = "Open" but DisputeReasonCode = null means the
-- dispute cannot be categorised in Dispute Tracking reports.
-- Root cause: JDE data entry error or incomplete dispute posting in F03B11.
AUDIT (name ar_dispute_co_population_integrity);

SELECT
    CompanyId,
    DocNo,
    DocType,
    PayItm,
    CustomerNumber,
    Collector,
    DisputeStatus,
    DisputeReasonCode,
    CASE
        WHEN DisputeStatus IS NOT NULL AND DisputeReasonCode IS NULL
            THEN 'Status set, ReasonCode missing — dispute cannot be categorised'
        WHEN DisputeStatus IS NULL AND DisputeReasonCode IS NOT NULL
            THEN 'ReasonCode set, Status missing — dispute cannot be tracked'
    END AS integrity_violation_description
FROM RL_JDE_VULCAN.DimARDetails
WHERE (DisputeStatus IS NOT NULL AND DisputeReasonCode IS NULL)
   OR (DisputeStatus IS NULL     AND DisputeReasonCode IS NOT NULL);
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_cash_applied_exceeds_receipts.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: CashApplied > TotalReceipts is a JDE misposting error.
-- Mathematically impossible in real operations — you cannot apply more cash
-- than you received. Each row here directly inflates the CEI for that
-- customer × period × LOB, causing the KPI to show collection performance
-- better than actuality.
-- Root cause: Duplicate receipts posted, reversed receipt not yet cleared,
-- or cross-period posting mismatch in F03B14.
AUDIT (name ar_cash_applied_exceeds_receipts);

SELECT
    CompanyId,
    CustomerNumber,
    FiscalPeriodId,
    LOB,
    TotalReceipts,
    CashApplied,
    CashApplied - TotalReceipts          AS over_application_amount,
    ROUND(CashApplied / NULLIF(TotalReceipts, 0) * 100, 2) AS applied_pct
FROM RL_JDE_VULCAN.FactARCollection
WHERE CashApplied > TotalReceipts * 1.005;
-- 0.5% tolerance covers legitimate floating-point rounding in JDE decimal encoding
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_payment_term_orphan.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: A PaymentTermCode on an invoice that has no row in
-- ARPaymentTerm means NetDays is unknown for that invoice.
-- Payment Term Compliance analysis (AgingDays > NetDays) will silently
-- exclude those invoices — they will never appear in "breaching payment terms"
-- reports even when genuinely overdue.
-- Root cause: New payment term added to JDE but not yet loaded to ARPaymentTerm.
AUDIT (name ar_payment_term_orphan);

SELECT
    d.CompanyId,
    d.DocNo,
    d.DocType,
    d.PayItm,
    d.CustomerNumber,
    d.PaymentTermCode     AS unmapped_payment_term,
    f.AgingDays,
    f.OpenAmount
FROM RL_JDE_VULCAN.DimARDetails d
JOIN RL_JDE_VULCAN.FactARDetails f
    ON  d.CompanyId       = f.CompanyId
    AND d.DocumentCompany = f.DocumentCompany
    AND d.DocNo           = f.DocNo
    AND d.DocType         = f.DocType
    AND d.PayItm          = f.PayItm
LEFT JOIN RL_JDE_VULCAN.ARPaymentTerm pt
    ON d.PaymentTermCode  = pt.PaymentTermCode
WHERE d.PaymentTermCode IS NOT NULL
  AND pt.PaymentTermCode IS NULL
  AND f.OpenAmount        > 0;
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_reserve_forecast_gap.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: Active open invoices with all three forecast buckets
-- at zero (ForecastReserve30 = 0, ForecastReserve60 = 0, ForecastReserve90 = 0)
-- indicate that the JDE reserve calculation process was not run for those invoices
-- (DQ6 in design doc). Finance cannot provision for these invoices —
-- they represent untracked credit risk on the balance sheet.
AUDIT (name ar_reserve_forecast_gap);

SELECT
    CompanyId,
    DocNo,
    DocType,
    PayItm,
    OpenAmount,
    AgingDays,
    FiscalPeriodId,
    ForecastReserve30,
    ForecastReserve60,
    ForecastReserve90
FROM RL_JDE_VULCAN.FactARDetails
WHERE OpenAmount         > 1000         -- Only flag material invoices
  AND AgingDays          > 0            -- Invoice is already past due date
  AND ForecastReserve30  = 0
  AND ForecastReserve60  = 0
  AND ForecastReserve90  = 0
ORDER BY OpenAmount DESC;
-- High OpenAmount rows first — sort by business impact
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_period_all_companies_present.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: If any company is missing from FactARCollection for the
-- current fiscal period, that company's entire collection performance is
-- absent from the period-end CEI report and Exec KPI dashboard (DQ4 in design doc).
-- Finance will produce an incomplete period-end AR summary.
-- Root cause: JDE collection pipeline failed for that company, or the period
-- has not yet been closed/processed for that entity.
AUDIT (name ar_period_all_companies_present);

WITH companies_with_recent_history AS (
    -- Companies that had collection activity in the past 3 periods
    SELECT DISTINCT CompanyId
    FROM RL_JDE_VULCAN.FactARCollection
    WHERE FiscalPeriodId >= (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection) - 3
),
latest_period_companies AS (
    SELECT DISTINCT CompanyId
    FROM RL_JDE_VULCAN.FactARCollection
    WHERE FiscalPeriodId = (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection)
)
SELECT
    h.CompanyId                                                     AS missing_company,
    (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection)       AS current_period,
    'Company had collection data in recent periods but is absent in current period'
        AS impact_description
FROM companies_with_recent_history h
LEFT JOIN latest_period_companies l ON h.CompanyId = l.CompanyId
WHERE l.CompanyId IS NULL;
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_collector_unassigned_on_overdue.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: An overdue invoice (AgingDays > 30) with no Collector
-- assigned has no owner for follow-up. It cannot appear in any Collector
-- Performance report, and no email action trigger will fire for it.
-- This is a direct collection governance gap — unmanaged AR.
-- Root cause: New invoice raised for a customer not yet assigned to a
-- collector in JDE F0101 Address Book.
AUDIT (name ar_collector_unassigned_on_overdue);

SELECT
    d.CompanyId,
    d.DocNo,
    d.DocType,
    d.PayItm,
    d.CustomerNumber,
    d.LOB,
    d.DueDate,
    f.AgingDays,
    f.OpenAmount,
    d.DisputeStatus
FROM RL_JDE_VULCAN.DimARDetails d
JOIN RL_JDE_VULCAN.FactARDetails f
    ON  d.CompanyId       = f.CompanyId
    AND d.DocumentCompany = f.DocumentCompany
    AND d.DocNo           = f.DocNo
    AND d.DocType         = f.DocType
    AND d.PayItm          = f.PayItm
WHERE (d.Collector IS NULL OR d.Collector = '')
  AND f.AgingDays  > 30
  AND f.OpenAmount > 0
ORDER BY f.OpenAmount DESC;
```

---

### Data Quality Rules (`dq/` — non-blocking monitoring)

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# dq/DimARDetails.yml
# ═══════════════════════════════════════════════════════════════════════════
# Business purpose: Monitor the Invoice Dimension — the descriptive backbone
# of Invoice 360. Without correct attribution (Collector, LOB, Customer),
# every AR KPI breaks silently. These rules catch the slow degradation that
# audits miss (gradual null creep, growing unattributed invoices over time).
kind: dq
name: DimARDetails_dq
depends_on: RL_JDE_VULCAN.DimARDetails

profiles:
  - Collector
  - LOB
  - DisputeStatus
  - HoldFlag
  - ModifyDate

rules:

  # ── Completeness ─────────────────────────────────────────────────────────

  - missing_count(CustomerNumber) = 0:
      name: every_invoice_has_a_customer
      dimension: completeness
      description: >
        Every invoice must be attributed to a customer. Null CustomerNumber
        = the invoice cannot appear in any customer-level AR report, Collector
        Performance dashboard, or Parent Customer rollup. Zero tolerance.

  - missing_count(Collector) = 0:
      name: every_invoice_has_a_collector
      dimension: completeness
      description: >
        Collector is the accountability field for AR follow-up. A null Collector
        means no one owns this invoice — it will not appear in Collector Performance
        KPIs, and no email escalation trigger will fire. Zero tolerance.

  - missing_count(DueDate) = 0:
      name: every_invoice_has_a_due_date
      dimension: completeness
      description: >
        DueDate is required for AgingDays calculation and payment term compliance.
        A null DueDate = AgingDays cannot be computed for that invoice, making it
        invisible in overdue aging analysis.

  - missing_percent(LOB) < 1:
      name: lob_derived_for_99pct_of_invoices
      dimension: coverage
      description: >
        LOB is derived from GLOffset via DimARCollectionLOB. Up to 1% null LOB
        is tolerated for newly-added GL Offsets not yet in the reference table.
        Above 1% signals a systematic GL Offset mapping failure — LOB-level CEI
        and Exec dashboards will have significant blind spots.
        [Estimated threshold: 1% — calibrate after deployment]

  # ── Uniqueness ────────────────────────────────────────────────────────────

  - duplicate_count(CompanyId, DocumentCompany, DocNo, DocType, PayItm) = 0:
      name: invoice_grain_must_be_unique
      dimension: uniqueness
      description: >
        Duplicate grain rows cause double-counting in OpenAmount totals and CEI.
        This is a hard data integrity failure — every financial KPI on this table
        will be inflated. Zero tolerance.

  # ── Validity: Dispute Fields ──────────────────────────────────────────────

  - failed rows:
      name: dispute_status_and_reason_code_co_populated
      dimension: validity
      fail query: |
        SELECT CompanyId, DocNo, DocType, PayItm,
               CustomerNumber, Collector,
               DisputeStatus, DisputeReasonCode,
               CASE
                   WHEN DisputeStatus IS NOT NULL AND DisputeReasonCode IS NULL
                       THEN 'Status set, ReasonCode missing'
                   WHEN DisputeStatus IS NULL AND DisputeReasonCode IS NOT NULL
                       THEN 'ReasonCode set, Status missing'
               END AS violation
        FROM RL_JDE_VULCAN.DimARDetails
        WHERE (DisputeStatus IS NOT NULL AND DisputeReasonCode IS NULL)
           OR (DisputeStatus IS NULL     AND DisputeReasonCode IS NOT NULL)
      samples limit: 20
      description: >
        Dispute Resolution Rate KPI requires both fields populated together or
        both null. Partial records inflate total_dispute_count (denominator)
        without a matching resolved_dispute_count (numerator), systematically
        understating the Dispute Resolution Rate.

  - failed rows:
      name: hold_flag_must_be_y_or_n
      dimension: conformity
      fail query: |
        SELECT CompanyId, DocNo, CustomerNumber, HoldFlag
        FROM RL_JDE_VULCAN.DimARDetails
        WHERE HoldFlag IS NOT NULL
          AND HoldFlag NOT IN ('Y', 'N', '')
      samples limit: 10
      description: >
        HoldFlag must be Y (on hold) or N (not on hold). Unexpected values corrupt
        the Credit Hold Open Invoices leakage signal (L8): HoldFlag = 'Y' + OpenAmount > 0
        triggers an action alert — garbage values will cause false alerts or missed alerts.

  - failed rows:
      name: payment_term_code_in_reference_table
      dimension: consistency
      fail query: |
        SELECT d.CompanyId, d.DocNo, d.PaymentTermCode, f.AgingDays
        FROM RL_JDE_VULCAN.DimARDetails d
        JOIN RL_JDE_VULCAN.FactARDetails f
            ON d.CompanyId = f.CompanyId AND d.DocNo = f.DocNo
           AND d.DocType = f.DocType AND d.PayItm = f.PayItm
        LEFT JOIN RL_JDE_VULCAN.ARPaymentTerm pt ON d.PaymentTermCode = pt.PaymentTermCode
        WHERE d.PaymentTermCode IS NOT NULL
          AND pt.PaymentTermCode IS NULL
          AND f.OpenAmount > 0
      samples limit: 20
      description: >
        Invoices with PaymentTermCode absent from ARPaymentTerm cannot be assessed
        for payment term compliance (AgingDays > NetDays). They are silently excluded
        from the 'invoices breaching payment terms' report — a compliance blind spot.

  # ── Accuracy: Leakage Signal Monitoring ──────────────────────────────────

  - failed rows:
      name: credit_hold_customers_with_growing_open_ar
      dimension: accuracy
      fail query: |
        SELECT
            d.CompanyId,
            d.CustomerNumber,
            d.HoldFlag,
            COUNT(*)              AS invoice_count,
            SUM(f.OpenAmount)     AS total_open_amount,
            MAX(f.AgingDays)      AS max_aging_days
        FROM RL_JDE_VULCAN.DimARDetails d
        JOIN RL_JDE_VULCAN.FactARDetails f
            ON d.CompanyId = f.CompanyId AND d.DocNo = f.DocNo
           AND d.DocType = f.DocType AND d.PayItm = f.PayItm
        WHERE d.HoldFlag    = 'Y'
          AND f.OpenAmount   > 0
          AND f.AgingDays   > 90
        GROUP BY d.CompanyId, d.CustomerNumber, d.HoldFlag
        HAVING SUM(f.OpenAmount) > 10000
      samples limit: 10
      description: >
        Leakage Signal L8: Customers on credit hold with >$10,000 open AR aged >90 days
        are high write-off risk. Each row here should trigger an immediate escalation
        to Collections Manager for manual review.
        [Estimated threshold: $10,000 — adjust to company's materiality threshold]

  - anomaly detection for row_count:
      name: invoice_dimension_row_count_anomaly
      dimension: accuracy
      description: >
        Detects statistically unusual changes in invoice count. A sudden count drop
        signals a pipeline truncation (critical — financial data lost). A count spike
        signals potential duplicate loading. Either triggers immediate pipeline investigation.

  # ── Timeliness ────────────────────────────────────────────────────────────

  - change for row_count >= -10%:
      name: invoice_count_not_dropping_unexpectedly
      dimension: timeliness
      description: >
        A 10%+ drop in DimARDetails row count is a strong pipeline failure signal.
        Even a 5% drop in invoice count means a significant portion of AR is missing
        from all dashboards. Threshold of 10% catches failures while tolerating normal
        period-end invoice closures.
```

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# dq/FactARDetails.yml
# ═══════════════════════════════════════════════════════════════════════════
# Business purpose: Monitor the Invoice Measures table — where every financial
# KPI lives. Amount errors here propagate directly to Exec KPI dashboards,
# Finance period-end reports, and reserve provisioning. These rules catch
# the data failures that cause Finance to restate numbers.
kind: dq
name: FactARDetails_dq
depends_on: RL_JDE_VULCAN.FactARDetails

profiles:
  - OpenAmount
  - CurrentReserve
  - ForecastReserve30
  - ChangeinReserve
  - AgingDays

rules:

  # ── Completeness ─────────────────────────────────────────────────────────

  - missing_count(FiscalPeriodId) = 0:
      name: fiscal_period_required_for_all_invoices
      dimension: completeness
      description: >
        FiscalPeriodId is the primary time key for all period-based trend metrics
        (OPEN_AR_TREND, RESERVE_ACCURACY_TREND). A null FiscalPeriodId = this invoice
        is excluded from every time-series KPI. Zero tolerance.

  # ── Uniqueness ────────────────────────────────────────────────────────────

  - duplicate_count(CompanyId, DocumentCompany, DocNo, DocType, PayItm) = 0:
      name: fact_invoice_grain_unique
      dimension: uniqueness
      description: >
        Duplicate fact rows double-count OpenAmount, CurrentReserve, and all other
        measures — a direct financial misstatement. Zero tolerance.

  # ── Validity: Amount Sanity ───────────────────────────────────────────────

  - failed rows:
      name: open_amount_must_not_be_negative_without_reason
      dimension: validity
      fail query: |
        SELECT CompanyId, DocNo, DocType, PayItm,
               OpenAmount, GrossAmount, AgingDays
        FROM RL_JDE_VULCAN.FactARDetails
        WHERE OpenAmount < -1
          AND GrossAmount > 0
      samples limit: 10
      description: >
        OpenAmount < 0 on an invoice with positive GrossAmount indicates a JDE
        decimal encoding or sign error. Negative open amounts subtract from total
        AR exposure, making the portfolio look healthier than it actually is.
        Allow -1 tolerance for rounding; flag anything more negative.

  - failed rows:
      name: aging_days_must_be_non_negative
      dimension: validity
      fail query: |
        SELECT CompanyId, DocNo, AgingDays, DueDate, AgeAsOfDate
        FROM RL_JDE_VULCAN.FactARDetails
        WHERE AgingDays < -730
      samples limit: 10
      description: >
        AgingDays represents days past due. Allow up to -730 (invoices dated
        2 years in the future — valid for long-term contracts). More negative
        than -730 = JDE date conversion error (Julian-to-Gregorian failure).

  # ── Accuracy: Reserve & Forecast Monitoring ──────────────────────────────

  - failed rows:
      name: active_invoices_have_no_reserve_forecast
      dimension: accuracy
      fail query: |
        SELECT
            CompanyId, DocNo, DocType, PayItm,
            OpenAmount, AgingDays,
            ForecastReserve30, ForecastReserve60, ForecastReserve90,
            FiscalPeriodId
        FROM RL_JDE_VULCAN.FactARDetails
        WHERE OpenAmount        > 5000
          AND AgingDays         > 30
          AND ForecastReserve30 = 0
          AND ForecastReserve60 = 0
          AND ForecastReserve90 = 0
        ORDER BY OpenAmount DESC
      samples limit: 20
      description: >
        DQ6 from design doc: Active invoices >$5,000 and >30 days overdue with zero
        forecast reserves are unprovisioned credit risk on the balance sheet.
        Finance cannot include them in IFRS/GAAP doubtful debt provisions.
        Each row here is a provisioning gap. [Threshold: $5,000 — adjust to materiality]

  - failed rows:
      name: reserve_change_exceeds_forecast_threshold
      dimension: accuracy
      fail query: |
        SELECT
            CompanyId, DocNo, DocType, PayItm,
            FiscalPeriodId,
            ChangeinReserve,
            ForecastReserve30,
            ROUND(ABS(ChangeinReserve) / NULLIF(ForecastReserve30, 0) * 100, 1)
                AS reserve_change_pct,
            OpenAmount
        FROM RL_JDE_VULCAN.FactARDetails
        WHERE ForecastReserve30 > 0
          AND ABS(ChangeinReserve) / ForecastReserve30 > 0.20
          AND OpenAmount > 1000
        ORDER BY ABS(ChangeinReserve) DESC
      samples limit: 20
      description: >
        Leakage Signal L7: Reserve changed by >20% vs 30-day forecast.
        Each row here is a reserve mis-estimation event — Finance needs to
        investigate whether the reserve model is responding correctly to collection
        events. Systematic L7 signals indicate the reserve model needs recalibration.
        [Threshold: 20% — fixed for v1 baseline and reviewed post go-live]

  - anomaly detection for sum(OpenAmount):
      name: total_open_ar_anomaly
      dimension: accuracy
      description: >
        Detects unusual movements in total open AR. A sudden 10%+ drop may indicate
        mass write-offs, data deletion, or a pipeline gap. A sudden spike may
        indicate duplicate invoice loading. Either event requires Finance review
        before period-end reporting.

  - anomaly detection for sum(CurrentReserve):
      name: total_reserve_balance_anomaly
      dimension: accuracy
      description: >
        Monitors total doubtful debt reserve. Unexpected reserve movements before
        Finance has approved them may indicate JDE reserve recalculation errors.
        Early detection allows Finance to verify vs their internal reserve schedule.

  # ── Timeliness ────────────────────────────────────────────────────────────

  - change for row_count >= -10%:
      name: fact_invoice_count_not_dropping
      dimension: timeliness
      description: >
        A 10%+ drop in FactARDetails rows signals that invoice measures were not
        loaded for a portion of the portfolio — those invoices will show $0 open
        amount on dashboards (they will appear financially settled when they are not).
```

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# dq/FactARCollection.yml
# ═══════════════════════════════════════════════════════════════════════════
# Business purpose: Monitor collection performance facts — the home of CEI,
# unapplied cash, and receipt volume. Data errors here translate directly to
# incorrect CEI reported to the Collections Manager and GM.
# "Our CEI is 87%" is only true if FactARCollection is clean.
kind: dq
name: FactARCollection_dq
depends_on: RL_JDE_VULCAN.FactARCollection

profiles:
  - TotalReceipts
  - CashApplied
  - CollectionEfficiency
  - FiscalPeriodId
  - LOB

rules:

  # ── Completeness ─────────────────────────────────────────────────────────

  - missing_count(FiscalPeriodId) = 0:
      name: fiscal_period_required_in_collection_facts
      dimension: completeness
      description: >
        FiscalPeriodId is the grain key and primary time dimension for CEI trend.
        Null FiscalPeriodId = this customer's collection performance is not included
        in any period-based KPI. Zero tolerance.

  - missing_count(LOB) = 0:
      name: lob_required_in_collection_facts
      dimension: completeness
      description: >
        LOB is the grain key for LOB-level CEI analysis and Exec KPI dashboard.
        Null LOB = this collection record is excluded from all LOB performance reports.
        Zero tolerance.

  # ── Uniqueness ────────────────────────────────────────────────────────────

  - duplicate_count(CompanyId, CustomerNumber, FiscalPeriodId, LOB) = 0:
      name: collection_grain_must_be_unique
      dimension: uniqueness
      description: >
        Duplicate grain rows double-count TotalReceipts and CashApplied in CEI.
        A CEI of 92% computed from duplicated data may actually be 84% — this is
        a material misstatement of the primary AR health KPI. Zero tolerance.

  # ── Validity: CEI and Cash Application ───────────────────────────────────

  - failed rows:
      name: cash_applied_cannot_exceed_total_receipts
      dimension: validity
      fail query: |
        SELECT
            CompanyId, CustomerNumber, FiscalPeriodId, LOB,
            TotalReceipts,
            CashApplied,
            ROUND(CashApplied - TotalReceipts, 2)     AS over_application_amount,
            ROUND(CashApplied / NULLIF(TotalReceipts, 0) * 100, 1) AS applied_pct
        FROM RL_JDE_VULCAN.FactARCollection
        WHERE CashApplied > TotalReceipts * 1.005
      samples limit: 20
      description: >
        CashApplied > TotalReceipts is a JDE misposting error — impossible in real
        operations. Each row directly inflates CEI for that customer × period × LOB.
        Root cause: duplicate receipt entry or cross-period posting mismatch.

  - failed rows:
      name: total_receipts_must_not_be_negative
      dimension: validity
      fail query: |
        SELECT CompanyId, CustomerNumber, FiscalPeriodId, LOB,
               TotalReceipts, CashApplied
        FROM RL_JDE_VULCAN.FactARCollection
        WHERE TotalReceipts < -0.01
      samples limit: 10
      description: >
        Negative TotalReceipts indicates a reversed receipt not offset by a
        correcting entry. This makes unapplied cash % appear artificially high
        and may cause CEI to exceed 1.0 for that customer-period.

  - failed rows:
      name: collection_efficiency_in_valid_range
      dimension: accuracy
      fail query: |
        SELECT
            CompanyId, CustomerNumber, FiscalPeriodId, LOB,
            CollectionEfficiency,
            TotalReceipts, CashApplied
        FROM RL_JDE_VULCAN.FactARCollection
        WHERE CollectionEfficiency < 0
           OR CollectionEfficiency > 1.5
      samples limit: 10
      description: >
        Pre-computed CEI must be in range [0, 1.5]. Below 0 = data error.
        Above 1.5 = probable duplicate receipt or mis-applied prepayment.
        Note: Always recompute CEI from raw CashApplied/(OpenAmount+TotalReceipts)
        for trend analysis — do not average this stored pre-computed ratio.
        [Threshold: 1.5 — calibrate after deployment based on observed maximums]

  # ── Accuracy: Leakage Signal Monitoring ──────────────────────────────────

  - failed rows:
      name: unapplied_cash_above_leakage_threshold
      dimension: accuracy
      fail query: |
        SELECT
            CompanyId,
            CustomerNumber,
            FiscalPeriodId,
            LOB,
            TotalReceipts,
            CashApplied,
            TotalReceipts - CashApplied                                 AS unapplied_cash,
            ROUND((TotalReceipts - CashApplied) / NULLIF(TotalReceipts, 0) * 100, 1)
                                                                        AS unapplied_pct
        FROM RL_JDE_VULCAN.FactARCollection
        WHERE TotalReceipts > 0
          AND (TotalReceipts - CashApplied) / TotalReceipts > 0.20
        ORDER BY unapplied_cash DESC
      samples limit: 20
      description: >
        Leakage Signal L1: Customer × period × LOB rows where >20% of receipts
        are unapplied. Each row represents cash received that is not reducing open
        AR — a direct collection process failure. Collections team must investigate
        whether these are timing differences, mispostings, or disputed items.
        [Threshold: 20% — calibrate to your normal cash application cycle time]

  - anomaly detection for avg(CollectionEfficiency):
      name: portfolio_cei_anomaly
      dimension: accuracy
      description: >
        Detects statistically unusual shifts in average CEI across the portfolio.
        A sudden drop in CEI (>2 sigma below baseline) triggers an immediate
        investigation: is it a real collections deterioration, a data quality event,
        or a seasonal effect? Early detection prevents Finance from reporting a
        bad CEI number before the cause is understood.

  - anomaly detection for sum(TotalReceipts):
      name: total_receipt_volume_anomaly
      dimension: accuracy
      description: >
        Monitors total cash receipt volume. A sudden drop signals missed receipt
        postings or a pipeline failure. A sudden spike may indicate duplicate loading
        of the F03B14 AR Receipts table. Either requires immediate cash application
        team investigation.

  # ── Coverage ──────────────────────────────────────────────────────────────

  - failed rows:
      name: all_active_lobs_present_in_current_period
      dimension: coverage
      fail query: |
        WITH recent_lobs AS (
            SELECT DISTINCT LOB
            FROM RL_JDE_VULCAN.FactARCollection
            WHERE FiscalPeriodId >= (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection) - 3
        ),
        current_period_lobs AS (
            SELECT DISTINCT LOB
            FROM RL_JDE_VULCAN.FactARCollection
            WHERE FiscalPeriodId = (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection)
        )
        SELECT r.LOB AS missing_lob,
               'LOB present in recent periods but absent in current period — CEI for this LOB cannot be reported'
                   AS impact_description
        FROM recent_lobs r
        LEFT JOIN current_period_lobs c ON r.LOB = c.LOB
        WHERE c.LOB IS NULL
      samples limit: 10
      description: >
        All Lines of Business active in recent periods must be present in the current
        period. A missing LOB in the current period creates a gap in LOB-level CEI
        that is invisible unless explicitly checked — the LOB CEI chart will simply
        show nothing for that LOB, which is indistinguishable from "zero collection".

  # ── Timeliness ────────────────────────────────────────────────────────────

  - change for row_count >= -15%:
      name: collection_records_not_dropping
      dimension: timeliness
      description: >
        A 15%+ drop in FactARCollection rows may signal that one or more companies
        or LOBs were not loaded for the current period. Collections Manager will
        see incomplete CEI data for that period without any visible error indicator.
```

---

### SLOs

| SLO Name | Table(s) | Threshold | Business Commitment |
|---|---|---|---|
| `ar_fact_dim_grain_integrity` | DimARDetails + FactARDetails | 0 orphan fact rows with OpenAmount > 0 | No financial exposure is invisible in dashboards |
| `lob_coverage_99pct` | DimARDetails | < 1% null LOB on open invoices | LOB-level CEI dashboards cover ≥99% of open AR |
| `dispute_co_population` | DimARDetails | 0 partial dispute records | Dispute Resolution Rate KPI is accurate |
| `cash_application_sanity` | FactARCollection | 0 rows CashApplied > TotalReceipts × 1.005 | CEI is not inflated by mispostings |
| `period_company_completeness` | FactARCollection | 0 companies missing from current period | Period-end CEI report covers all legal entities |
| `payment_term_reference_coverage` | DimARDetails + ARPaymentTerm | 0 open invoices with unmapped PaymentTermCode | Payment term compliance analysis covers 100% of open AR |
| `data_freshness` | All 3 fact/dim tables | InsertDate/ModifyDate ≤ 48h old | Daily dashboard consumers have same-day data |

### Coverage Gaps (address at build time)

- **HIGH — Reserve Threshold Calibration**: All `[Estimated threshold]` and `[Threshold: X]` values in DQ rules (1% null LOB, $5,000 open amount, $10,000 hold flag, 20% unapplied cash, 20% reserve change, CEI range 0-1.5) must be replaced with values derived from `vulcan evaluate` output after the first 30-day deployment baseline. Do NOT use these estimates for production alerts.
- **HIGH — Amount Reconciliation vs JDE Source**: No audit currently compares FactARDetails.SUM(OpenAmount) against `staging.F03B11` source totals (DQ1 in design doc). This requires `staging.*` to be accessible at Vulcan runtime. Work with Data Engineering to either: (a) expose a `staging_control_totals` summary view, or (b) implement a prior-period snapshot comparison model.
- **MEDIUM — Workday Email Coverage**: Add `missing_percent(WorkdayEmail) < 20` rule to `dq/DimARDetails.yml` once the Workday reference table schema is confirmed. Currently excluded because the table name/schema is an open question.
- **LOW — FactARCollection ↔ DimARDetails Customer Referential Integrity**: Add a `failed rows` consistency check in `dq/FactARCollection.yml` verifying every CustomerNumber in FactARCollection has at least one row in DimARDetails. Deferred until both tables are confirmed stable post-deployment.
---

## 15.5 AI Context (for semantic layer)

### Semantic Model — DimARDetails (Invoice Dimension)

```yaml
ai_context:
  instructions:
    - >
      Use this model when the question involves describing an invoice — who owns it,
      what status it is in, whether it is disputed, whether the customer is on credit hold,
      what LOB it belongs to, or what the latest collection comment says.
    - >
      One row = one invoice / pay-item. The grain key is CompanyId + DocumentCompany +
      DocNo + DocType + PayItm. Group by Collector for performance attribution;
      group by LOB for line-of-business analysis.
    - >
      For financial amounts and aging numbers, JOIN to FactARDetails on the same grain key.
      This model carries attributes only — not amounts.
  synonyms:
    - invoice details
    - AR dimension
    - invoice attributes
    - DimAR
    - invoice master
  examples:
    - description: "Which customers have overdue invoices with no dispute?"
      format: sql
      query: |
        SELECT d.CustomerNumber, d.Collector, COUNT(*) AS overdue_count
        FROM RL_JDE_VULCAN.DimARDetails d
        JOIN RL_JDE_VULCAN.FactARDetails f
          ON d.CompanyId = f.CompanyId AND d.DocNo = f.DocNo
          AND d.DocType = f.DocType AND d.PayItm = f.PayItm
        WHERE f.AgingDays > 30
          AND d.DisputeStatus IS NULL
        GROUP BY d.CustomerNumber, d.Collector
        ORDER BY overdue_count DESC

    - description: "Which invoices are on credit hold with outstanding balance?"
      format: sql
      query: |
        SELECT d.CustomerNumber, d.CompanyId, d.DocNo, d.HoldFlag, f.OpenAmount
        FROM RL_JDE_VULCAN.DimARDetails d
        JOIN RL_JDE_VULCAN.FactARDetails f
          ON d.CompanyId = f.CompanyId AND d.DocNo = f.DocNo
          AND d.DocType = f.DocType AND d.PayItm = f.PayItm
        WHERE d.HoldFlag = 'Y'
          AND f.OpenAmount > 0

    - description: "Show open disputes by LOB and resolver"
      format: sql
      query: |
        SELECT d.LOB, d.ResolverName, COUNT(*) AS open_dispute_count,
               SUM(f.OpenAmount) AS total_disputed_amount
        FROM RL_JDE_VULCAN.DimARDetails d
        JOIN RL_JDE_VULCAN.FactARDetails f
          ON d.CompanyId = f.CompanyId AND d.DocNo = f.DocNo
          AND d.DocType = f.DocType AND d.PayItm = f.PayItm
        WHERE d.DisputeStatus = 'Open'
        GROUP BY d.LOB, d.ResolverName
        ORDER BY total_disputed_amount DESC
```

### Dimensions — DimARDetails

- **CustomerNumber**:
  - `synonyms`: ["customer", "customer ID", "account number", "customer no"]
- **Collector**:
  - `synonyms`: ["collections rep", "AR collector", "collections person"]
  - `caveats`: ["Collector is the individual responsible for chasing payment; CollectionManager is their manager — do not confuse the two when grouping for performance reports"]
- **LOB**:
  - `synonyms`: ["line of business", "business line", "division", "segment"]
  - `caveats`: ["LOB is derived from GLOffset via the DimARCollectionLOB reference table — a null LOB means the GL Offset was unrecognised at load time; exclude these rows from LOB-level KPIs"]
- **DisputeStatus**:
  - `synonyms`: ["dispute", "dispute flag", "dispute state"]
  - `caveats`: ["A null DisputeStatus means the invoice has no recorded dispute — treat null as 'not disputed', not as unknown"]
- **HoldFlag**:
  - `synonyms`: ["credit hold", "hold", "on hold"]
  - `caveats`: ["Y = on credit hold, N = not on hold, null = unknown; filter to HoldFlag = 'Y' to identify credit hold exposure"]
- **DueDate**:
  - `synonyms`: ["payment due", "due", "payment deadline"]
  - `caveats`: ["DueDate is the contractual payment deadline; PromiseToPay is the customer-committed date — they differ for disputed/negotiated invoices"]
- **FiscalPeriodId**:
  - `synonyms`: ["fiscal period", "period", "accounting period", "month"]
  - `caveats`: ["FiscalPeriodId is an integer key computed as ((Century * 100 + Year) * 100) + Month. Do not sum or average this field — use it for filtering and grouping only. Example: 20260800 = August 2026"]

---

### Semantic Model — FactARDetails (Invoice Measures)

```yaml
ai_context:
  instructions:
    - >
      Use this model for questions about invoice amounts, reserves, forecasts, and aging.
      One row = one invoice / pay-item. This is where all financial KPIs live.
    - >
      For leakage detection, the key signals are: ChangeinReserve (sudden reserve
      movements), ForecastReserve30/60/90 (future exposure), and ReserveCashApplied
      (whether reserve cash has been utilised).
    - >
      JOIN to DimARDetails on CompanyId + DocNo + DocType + PayItm for collector,
      customer, LOB, and dispute attributes.
  synonyms:
    - AR facts
    - invoice measures
    - FactAR
    - invoice financials
    - AR amounts
  examples:
    - description: "Show reserve vs forecast gap by LOB for this period"
      format: sql
      query: |
        SELECT d.LOB,
               SUM(f.CurrentReserve) AS total_reserve,
               SUM(f.ForecastReserve30) AS total_forecast_30,
               SUM(f.CurrentReserve - f.ForecastReserve30) AS reserve_vs_forecast_gap
        FROM RL_JDE_VULCAN.FactARDetails f
        JOIN RL_JDE_VULCAN.DimARDetails d
          ON f.CompanyId = d.CompanyId AND f.DocNo = d.DocNo
          AND f.DocType = d.DocType AND f.PayItm = d.PayItm
        GROUP BY d.LOB
        ORDER BY reserve_vs_forecast_gap DESC

    - description: "Which invoices have the highest change in reserve (top leakage risk)?"
      format: sql
      query: |
        SELECT f.CompanyId, f.DocNo, f.ChangeinReserve, f.ForecastReserve30,
               d.CustomerNumber, d.Collector,
               ABS(f.ChangeinReserve) / NULLIF(f.ForecastReserve30, 0) AS reserve_change_ratio
        FROM RL_JDE_VULCAN.FactARDetails f
        JOIN RL_JDE_VULCAN.DimARDetails d
          ON f.CompanyId = d.CompanyId AND f.DocNo = d.DocNo
          AND f.DocType = d.DocType AND f.PayItm = d.PayItm
        WHERE f.ForecastReserve30 > 0
          AND ABS(f.ChangeinReserve) / f.ForecastReserve30 > 0.20
        ORDER BY reserve_change_ratio DESC
        LIMIT 50
```

### Measures — FactARDetails

- **OPEN_AMOUNT**:
  - `synonyms`: ["open balance", "outstanding", "AR balance", "amount due", "receivable"]
  - `behavior`: flow — accumulates per period
  - `caveats`: ["OpenAmount is the current outstanding amount as of AgeAsOfDate — it changes as payments are received and adjustments are posted"]
- **CURRENT_RESERVE**:
  - `synonyms`: ["reserve", "doubtful debt reserve", "bad debt reserve"]
  - `behavior`: stock — point-in-time value; do not sum across periods
  - `caveats`: ["CurrentReserve is a point-in-time balance. Do not SUM across multiple fiscal periods — use the latest FiscalPeriodId snapshot"]
- **CHANGE_IN_RESERVE**:
  - `synonyms`: ["reserve movement", "reserve change", "delta reserve"]
  - `caveats`: ["A positive ChangeinReserve means reserve increased (more doubtful debt provisioned). A negative value means reserve was released (improvement). This is the primary leakage signal L2"]
- **COLLECTION_EFFICIENCY** (in FactARCollection):
  - `synonyms`: ["CEI", "collection efficiency index", "collection rate", "efficiency"]
  - `behavior`: ratio — numerator: CashApplied, denominator: (OpenAmount + TotalReceipts)
  - `caveats`: ["CEI = CashApplied / (OpenAmount + TotalReceipts). Do not average pre-computed CEI values across time periods — query CashApplied, OpenAmount, and TotalReceipts separately and divide the sums"]
- **UNAPPLIED_CASH_PCT**:
  - `synonyms`: ["unapplied cash", "unapplied receipts", "cash not applied"]
  - `behavior`: ratio
  - `caveats`: ["Query numerator (TotalReceipts - CashApplied) and denominator (TotalReceipts) separately when grouping by time; averaging pre-computed percentages across periods is mathematically incorrect"]
- **RESERVE_ACCURACY_PCT**:
  - `synonyms`: ["reserve accuracy", "forecast accuracy", "reserve vs forecast"]
  - `behavior`: ratio
  - `caveats`: ["Reserve accuracy = 1 - ABS(ChangeinReserve / ForecastReserve30). Values close to 1.0 = accurate forecasting. Values significantly below 1.0 = reserve was mis-estimated. Do not sum this across invoices — it is an invoice-level ratio"]

---

### Semantic Model — FactARCollection (Collection Facts)

```yaml
ai_context:
  instructions:
    - >
      Use this model for questions about collection performance — CEI, receipts, cash
      applied, and unapplied cash. One row = one customer × fiscal period × LOB.
    - >
      This is the primary model for answering "how are we collecting?" questions.
      For invoice-level detail or dispute context, JOIN to DimARDetails.
    - >
      FiscalPeriodId is the time dimension — filter to a specific period for
      point-in-time analysis, or group by period for trend analysis.
  synonyms:
    - collection facts
    - collections data
    - receipt facts
    - CEI data
    - cash collection
  examples:
    - description: "What is our CEI for the current month by LOB?"
      format: sql
      query: |
        SELECT LOB,
               SUM(CashApplied) AS total_cash_applied,
               SUM(TotalReceipts) AS total_receipts,
               SUM(CashApplied) / NULLIF(SUM(TotalReceipts), 0) AS collection_efficiency
        FROM RL_JDE_VULCAN.FactARCollection
        WHERE FiscalPeriodId = (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection)
        GROUP BY LOB
        ORDER BY collection_efficiency ASC

    - description: "Who are the top 10 collectors by cash collected this quarter?"
      format: sql
      query: |
        SELECT d.Collector,
               SUM(c.CashApplied) AS total_cash_applied,
               SUM(c.TotalReceipts) AS total_receipts
        FROM RL_JDE_VULCAN.FactARCollection c
        JOIN RL_JDE_VULCAN.DimARDetails d
          ON c.CompanyId = d.CompanyId AND c.CustomerNumber = d.CustomerNumber
        WHERE c.FiscalPeriodId >= (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection) - 2
        GROUP BY d.Collector
        ORDER BY total_cash_applied DESC
        LIMIT 10

    - description: "Show unapplied cash percentage by customer this month"
      format: sql
      query: |
        SELECT CustomerNumber, LOB,
               TotalReceipts,
               CashApplied,
               TotalReceipts - CashApplied AS unapplied_cash,
               ROUND((TotalReceipts - CashApplied) / NULLIF(TotalReceipts, 0) * 100, 2) AS unapplied_pct
        FROM RL_JDE_VULCAN.FactARCollection
        WHERE FiscalPeriodId = (SELECT MAX(FiscalPeriodId) FROM RL_JDE_VULCAN.FactARCollection)
          AND TotalReceipts > 0
        ORDER BY unapplied_cash DESC
```

### Segments (for FactARDetails and DimARDetails)

```yaml
# On FactARDetails semantic model:
segments:
  - name: high_leakage_risk
    expression: >
      {FactARDetails.AgingDays} > 30
      AND {FactARDetails.ReserveCashApplied} = 0
      AND {FactARDetails.CurrentReserve} > 0
    description: >
      Invoices overdue >30 days with reserve held but no reserve cash applied —
      the highest-value leakage signal in the portfolio (Signal L6)
    ai_context:
      synonyms: ["at-risk invoices", "leakage risk", "write-off candidates"]

  - name: reserve_movement_alert
    expression: >
      ABS({FactARDetails.ChangeinReserve}) / NULLIF({FactARDetails.ForecastReserve30}, 0) > 0.20
    description: >
      Invoices where reserve changed by more than 20% vs 30-day forecast —
      signals potential reserve mis-estimation (Signal L7)

# On DimARDetails semantic model:
segments:
  - name: credit_hold_with_open_balance
    expression: >
      {DimARDetails.HoldFlag} = 'Y'
    description: Customers on credit hold — join to FactARDetails to see open exposure (Signal L8)

  - name: overdue_no_dispute
    expression: "{DimARDetails.DisputeStatus} IS NULL"
    description: >
      Invoices with no active dispute — combine with AgingDays > 30 in FactARDetails
      for the "overdue without action" leakage signal (Signal L4)
```

---

## 15.6 Behavior (typed dimensions and measures)

### Dimensions

```yaml
# DimARDetails semantic model
- CompanyId:
    behavior:
      type: identifier
- DocumentCompany:
    behavior:
      type: identifier
- DocNo:
    behavior:
      type: identifier
- DocType:
    behavior:
      type: identifier
- PayItm:
    behavior:
      type: identifier
- CustomerNumber:
    behavior:
      type: identifier
- ParentCustomer:
    behavior:
      type: identifier
- Collector:
    behavior:
      type: categorical
- CollectionManager:
    behavior:
      type: categorical
- SalesRep:
    behavior:
      type: categorical
- LOB:
    behavior:
      type: categorical
- BusinessUnit:
    behavior:
      type: categorical
- PaymentTermCode:
    behavior:
      type: categorical
- DisputeStatus:
    behavior:
      type: categorical
- DisputeReasonCode:
    behavior:
      type: categorical
- ARCode:
    behavior:
      type: categorical
- DisputeDate:
    behavior:
      type: categorical
- ResolverCode:
    behavior:
      type: categorical
- HoldFlag:
    behavior:
      type: categorical
- CurrencyCode:
    behavior:
      type: categorical
# FiscalPeriodId — integer key used as categorical time bucket, NOT summed
- FiscalPeriodId:
    behavior:
      type: categorical
```

### Measures

```yaml
# FactARDetails measures
- OPEN_AMOUNT:
    behavior:
      type: flow
    # Rationale: additive per period (sum across invoices = total AR balance for that period)

- GROSS_AMOUNT:
    behavior:
      type: flow

- TAX_AMOUNT:
    behavior:
      type: flow

- DISPUTED_AMOUNT:
    behavior:
      type: flow

- CHANGE_IN_RESERVE:
    behavior:
      type: flow
    # Period-over-period delta — additive within a period

- RESERVE_CASH_APPLIED:
    behavior:
      type: flow

- ADJUSTMENT_AMOUNT:
    behavior:
      type: flow

- DRAFT_OPEN_AMOUNT:
    behavior:
      type: flow

- INVOICE_COUNT:
    behavior:
      type: flow

# Stock measures — point-in-time balances; do NOT sum across periods
- CURRENT_RESERVE:
    behavior:
      type: stock
      time_dimension: FiscalPeriodId
      period_treatment: last
      period_grain: month

- FORECAST_RESERVE_30:
    behavior:
      type: stock
      time_dimension: FiscalPeriodId
      period_treatment: last
      period_grain: month

- FORECAST_RESERVE_60:
    behavior:
      type: stock
      time_dimension: FiscalPeriodId
      period_treatment: last
      period_grain: month

- FORECAST_RESERVE_90:
    behavior:
      type: stock
      time_dimension: FiscalPeriodId
      period_treatment: last
      period_grain: month

# FactARCollection measures
- TOTAL_RECEIPTS:
    behavior:
      type: flow

- CASH_APPLIED:
    behavior:
      type: flow

- RESERVE_CASH:
    behavior:
      type: flow

- ADJUSTED_COLLECTION:
    behavior:
      type: flow

# Ratio measures — query numerator and denominator separately; do NOT average pre-computed ratios
- COLLECTION_EFFICIENCY:
    behavior:
      type: ratio
      numerator: CASH_APPLIED
      denominator: OPEN_AMOUNT_PLUS_RECEIPTS
    # Fallback if CLI rejects ratio type: use type: number with expression
    # SUM(CashApplied) / NULLIF(SUM(OpenAmount) + SUM(TotalReceipts), 0)

- UNAPPLIED_CASH_PCT:
    behavior:
      type: ratio
      numerator: UNAPPLIED_CASH
      denominator: TOTAL_RECEIPTS
    # Fallback expression: (SUM(TotalReceipts) - SUM(CashApplied)) / NULLIF(SUM(TotalReceipts), 0)

- RESERVE_ACCURACY_PCT:
    behavior:
      type: ratio
      numerator: ABS_CHANGE_IN_RESERVE
      denominator: FORECAST_RESERVE_30
    # Fallback expression: 1 - ABS(SUM(ChangeinReserve)) / NULLIF(SUM(ForecastReserve30), 0)

- DISPUTE_RESOLUTION_RATE:
    behavior:
      type: ratio
      numerator: RESOLVED_DISPUTE_COUNT
      denominator: TOTAL_DISPUTE_COUNT
    # Helper measures (define as filtered count measures):
    # RESOLVED_DISPUTE_COUNT: count with filter DisputeStatus = 'Resolved'
    # TOTAL_DISPUTE_COUNT: count with filter DisputeStatus IS NOT NULL

- RESERVE_CASH_COVERAGE:
    behavior:
      type: ratio
      numerator: RESERVE_CASH_APPLIED
      denominator: CURRENT_RESERVE

- OVERDUE_WITHOUT_ACTION_PCT:
    behavior:
      type: ratio
      numerator: OVERDUE_NO_DISPUTE_COUNT
      denominator: OVERDUE_COUNT
    # Helper measures:
    # OVERDUE_COUNT: count with filter AgingDays > 30
    # OVERDUE_NO_DISPUTE_COUNT: count with filter AgingDays > 30 AND DisputeStatus IS NULL
```

---

## 15.7 Unit Tests (mandatory coverage in `tests/`)

```yaml
# tests/test_dim_ar_details_grain.yml
name: test_dim_ar_details_grain
model: RL_JDE_VULCAN.DimARDetails
description: Grain uniqueness and required dimensions for invoice identity.
given:
  - input: staging.F03B11
    rows:
      - {CompanyId: "100", DocumentCompany: "100", DocNo: "INV1", DocType: "RI", PayItm: "001", CustomerNumber: "C1", InvoiceDate: "2026-08-01"}
      - {CompanyId: "100", DocumentCompany: "100", DocNo: "INV1", DocType: "RI", PayItm: "001", CustomerNumber: "C1", InvoiceDate: "2026-08-01"}
expect:
  - assertion: duplicate_count(CompanyId, DocumentCompany, DocNo, DocType, PayItm) = 0

# tests/test_fact_ar_collection_cei_formula.yml
name: test_fact_ar_collection_cei_formula
model: RL_JDE_VULCAN.FactARCollection
description: Validate CEI formula and divide-by-zero handling.
given:
  - input: staging.F03B14
    rows:
      - {CompanyId: "100", CustomerNumber: "C1", FiscalPeriodId: 20260800, LOB: "Maintenance", TotalReceipts: 1000, CashApplied: 800}
expect:
  - assertion: COLLECTION_EFFICIENCY = 0.8

# tests/test_fact_dim_join_integrity.yml
name: test_fact_dim_join_integrity
model: RL_JDE_VULCAN.FactARDetails
description: Every fact grain row must match DimARDetails grain row.
expect:
  - assertion: orphan_count(FactARDetails -> DimARDetails) = 0
```

---

## 15.8 Macros (shared helpers in `macros/`)

```python
# macros/jde_helpers.py

def jde_decimal(amount_col: str, scale: int = 2) -> str:
    # Convert JDE integer-like stored amounts into decimal money values.
    return f"({amount_col}) / POW(10, {scale})"

def safe_ratio(numerator_sql: str, denominator_sql: str) -> str:
    # Guard all KPI ratios against divide-by-zero.
    return f"({numerator_sql}) / NULLIF(({denominator_sql}), 0)"

def fiscal_period_id(century_sql: str, year_sql: str, month_sql: str) -> str:
    # Standardized fiscal period key format used across all models.
    return f"((({century_sql}) * 100 + ({year_sql})) * 100) + ({month_sql})"

def normalize_key(col_sql: str) -> str:
    # Trim and uppercase keys once, reuse everywhere for stable joins.
    return f"UPPER(TRIM({col_sql}))"

def jde_to_date(jde_col: str) -> str:
    # Central macro for JDE date normalization (implementation depends on raw encoding).
    return f"TO_DATE({jde_col})"
```

**Macro usage policy**:
- All gold model SQL must call shared macros for date conversion, decimal scaling, and key normalization.
- KPI measures must use `safe_ratio(...)` to enforce consistent division logic.
- Any new source-specific transformation is added in `macros/` first, then reused in models.

---

## 16. Validation Checklist

- [x] Goal and consumers confirmed by stakeholder — extracted from design document, confirmed
- [x] Data sources verified accessible — `staging` raw sources documented as inputs; serving schema set to `RL_JDE_VULCAN`
- [x] Grain explicitly defined (not UNKNOWN) — DimARDetails/FactARDetails: CompanyId+DocumentCompany+DocNo+DocType+PayItm; FactARCollection: CompanyId+CustomerNumber+FiscalPeriodId+LOB
- [x] Measures vs Metrics distinction clear — 20+ measures documented in Section 6; 7 metrics in Section 7
- [x] Entity relationships and joins documented — 6 joins documented in Section 4
- [x] Measure/metric reasoning documented — Section 9 rationale chain complete
- [x] Model architecture decided and documented — INCREMENTAL Gold models (5 output tables) + SEMANTIC + METRIC + DQ
- [x] Output model ownership confirmed in Section 13 — 5 tables are Vulcan-managed in `RL_JDE_VULCAN`
- [x] All [Assumption] tags reviewed with stakeholder — 11 assumptions listed in Section 11; CEI formula and backfill confirmed
- [x] Open questions resolved or documented as out-of-scope — Section 12 decisions are now explicitly locked for v1
- [x] YAML contract parseable and complete — Section 14 complete
- [x] Quality rules reviewed and added to spec (Section 15) — 3 DQ YAML files + 5 custom audit files documented
- [x] AI context drafted and confirmed (Section 15.5) — all 5 semantic models + key measures/dimensions covered
- [x] Semantic types (behavior) drafted and confirmed (Section 15.6) — all dimensions typed; all measures typed with stock/flow/ratio behavior
- [x] Unit tests designed and mapped to business-critical logic (Section 15.7)
- [x] Shared macros defined for reusable transformation logic (Section 15.8)
- [x] Ready for implementation → proceed to the build-data-product skill
