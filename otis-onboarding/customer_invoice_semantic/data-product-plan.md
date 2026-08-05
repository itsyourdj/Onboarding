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
  - "What is our CEI for this month?" → FACTARCOLLECTION.COLLECTIONEFFICIENCY
  - "Which customers have overdue invoices with no dispute?" → DIMARDETAILS + FACTARDETAILS
  - "Show reserve vs forecast gap for LOB Maintenance" → FACTARDETAILS + DIMARCOLLECTIONLOB
  - "Who are the top 10 collectors by cash collected?" → FACTARCOLLECTION + DIMARDETAILS
  - "Which invoices are breaching payment terms?" → FACTARDETAILS + DIMARDETAILS + ARPAYMENTTERM
  - "Which invoices are at risk of write-off?" → FACTARDETAILS + DIMARDETAILS (high aging + no reserve coverage)
  - "Show collection efficiency by LOB this quarter" → FACTARCOLLECTION + DIMARCOLLECTIONLOB
  - "How much unapplied cash do we have?" → FACTARCOLLECTION (TOTALRECEIPTS vs CASHAPPLIED)
  - "Show reserve accuracy trend" → FACTARDETAILS (CURRENTRESERVE vs PREVIOUSFORECASTRESERVE)
  - "What is our Days Sales Outstanding (DSO)?" → FACTDSO.DSO (native gold-layer KPI)
  - "How does DSO compare to contractual payment terms?" → FACTDSO.DSOVARIANCEFROMTERMS vs FACTDSO.AVGCONTRACTUALNETDAYS
  - "How much disputed amount is accumulating?" → FACTDSO.DISPUTEDAMOUNTROLLING30/60/90/180 trends
  - "What proportion of resolved disputes was recovered?" → FACTDSO.DISPUTERECOVERYRATIO
  - "Is collection prioritization working?" → Compare FACTDSO.DSO / CEI by COLLECTIONPRIORITY (H/M/L/NONE)
  - "What is our unified CEI?" → FACTDSO.CEI

### Is it a right fit for me?

**Good for**

- Collection Efficiency Index (CEI) tracking and trend analysis by fiscal period, LOB, and collector
- Overdue invoice monitoring, dispute tracking, and resolution-rate analysis
- Collection leakage detection (unapplied cash, overdue without action, credit hold exposure)
- Reserve vs forecast accuracy analysis for Finance period-end provisioning
- Executive AR KPI dashboards (open AR, CEI, reserve accuracy, overdue aging)
- Natural-language AR analytics via semantic models and Cortex Analyst
- Native DSO, DSO-vs-terms, dispute rolling averages, dispute recovery, and unified CEI from FACTDSO gold layer

**Not good for**

- Real-time or near-real-time alerting — product refreshes daily from the JDE pipeline
- Rebuilding or owning the underlying `RL_JDE` star schema tables (external JDE pipeline)
- Sub-invoice-line detail — grain is invoice / pay-item level
- Sales-order-based DSO (F4211) — current DSO uses invoiced gross (`TOTALGROSSINVOICED` / RPAAP), acceptable for Otis service/maintenance AR
- Multi-currency USD normalization — local currency only in this version

> Stakeholder-facing wording for Studio "Is it a right fit for me?" will be finalized in `usage.yml` once Collections/Finance copy is approved.

---

## 2. Data Sources

- **Engine**: Snowflake

| Source | Description | Owner | Key Columns |
|---|---|---|---|
| `pl_jde.F59HQ084` | Reserve & Forecast | JDE ERP (read-only) | Reserve amounts, FORECASTRESERVE30/60/90, AGINGDAYS, FISCALPERIODID, AGEASOFDATE, CHANGEINRESERVE, DRAFTOPENAMOUNT, ARCURRENTRESERVE, PREVIOUSFORECASTRESERVE |
| `pl_jde.F03B14` | AR Receipts Ledger | JDE ERP (read-only) | Cash receipts, GLOFFSET, BUSINESSUNIT, receipt date, TOTALRECEIPTS, CASHAPPLIED, RESERVECASH, ADJUSTEDCOLLECTION |
| `pl_jde.F03B11` | Invoice Header | JDE ERP (read-only) | DOCNO, DOCTYPE, PAYITM, COMPANYID, DOCUMENTCOMPANY, OPENAMOUNT, GROSSAMOUNT, TAXAMOUNT, DUEDATE, GLDATE, INVOICEDATE, PAYMENTTERMCODE, GLOFFSET, CURRENCYCODE, AGINGDAYS |
| `pl_jde.F03B13` | Payment Header | JDE ERP (read-only) | Payment matching, receipt reference, CUSTOMERNUMBER |
| `pl_jde.F0101` | Address Book | JDE ERP (read-only) | SALESREP, COLLECTOR, COLLECTIONMANAGER, PARENTCUSTOMER, CUSTOMERNUMBER |
| `pl_jde.F0014` | Payment Terms | JDE ERP (read-only) | PAYMENTTERMCODE, Description, NETDAYS |
| `pl_jde.F03012` | Customer Credit | JDE ERP (read-only) | HOLDFLAG, ARCode, CUSTOMERNUMBER |
| `pl_jde.F5803B2I` | Invoice Comments | JDE ERP (read-only) | LASTINVOICECOMMENT, DOCNO |
| `pl_jde.F5803B2C` | Customer Comments | JDE ERP (read-only) | LASTCUSTOMERCOMMENT, CUSTOMERNUMBER |
| `pl_jde.F0006` | Business Unit | JDE ERP (read-only) | BUSINESSUNIT, BUDESC |
| `pl_jde.F0012` | GL Offset / LOB | JDE ERP (read-only) | LOBCODE, LOBDESCRIPTION, GLOFFSET, COMPANYID |
| `Workday` (reference table) | Employee / Email | HR (scheduled refresh) | WORKDAYEMAIL, employee identifier matched via F01151 |

> **Consumption scope**: This semantic data product queries **`JDE_PRODUCTION.RL_JDE.*`** gold tables only. The `pl_jde` rows below are upstream lineage reference — not queried by this DP.
>
> **Note**: The Nilus Metadata Workflow has not been run on the `pl_jde` schema — tables do not appear in search results. Column schemas are sourced from the Customer Invoice360-Design_Document.md.
> [Assumption] Workday integration will be implemented as a pre-loaded reference table with scheduled refresh (per Open Design Decision D1) rather than a live SQL Server call.

### RL_JDE Gold Layer (Snowflake — semantic DP consumption)

Gold tables in `JDE_PRODUCTION.RL_JDE.*` are **maintained by Snowflake stored procedures** in the JDE pipeline. This data product registers them as **EXTERNAL** metadata stubs — semantic-only, no transformation.

| Source | Description | Owner | Key Columns (MCP-confirmed) |
|---|---|---|---|
| `JDE_PRODUCTION.RL_JDE.FACTDSO` | DSO & dispute analytics fact — pre-aggregated at company × fiscal period × collection-priority grain | JDE pipeline (stored proc) | COMPANYID, FISCALYEAR, FISCALMONTH, COLLECTIONPRIORITY, TOTALOPENAR, TOTALGROSSINVOICED, DAYSINPERIOD, DSO, AVGCONTRACTUALNETDAYS, DSOVARIANCEFROMTERMS, DISPUTEDAMOUNTTOTAL, DISPUTEDAMOUNTROLLING30/60/90/180, RESOLVEDDISPUTEGROSS, RESOLVEDDISPUTERECOVERED, DISPUTERECOVERYRATIO, CEI, INVOICECOUNT |
| `JDE_PRODUCTION.RL_JDE.DIMARDETAILS` | Invoice dimension (+ COLLECTIONPRIORITY from F03012) | JDE pipeline | Existing columns + **COLLECTIONPRIORITY** (H/M/L/NONE) |
| `JDE_PRODUCTION.RL_JDE.FACTARDETAILS` | Invoice measures | JDE pipeline | OPENAMOUNT, GROSSAMOUNT, DISPUTEDAMOUNT, reserve/aging columns |
| `JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION` | Collection facts | JDE pipeline | CEI components, receipts, cash applied |
| `JDE_PRODUCTION.RL_JDE.DIMARCOLLECTIONLOB` | LOB reference | JDE pipeline | GLOFFSET → LOB mapping |
| `JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM` | Payment terms (F0014) | JDE pipeline | PAYMENTTERMCODE, NETDAYS |

> **DSO denominator caveat**: DSO = `TOTALOPENAR / TOTALGROSSINVOICED * DAYSINPERIOD` uses invoiced gross (RPAAP), not F4211 sales orders. Acceptable for Otis service/maintenance AR; F4211 noted as future optional source.

---

## 3. Entities

1. **Invoice / Pay-Item** — the atomic AR record; every fact is at invoice/pay-item grain. Core entity.
2. **Customer** — the party owing the invoice; carries collector, sales rep, parent relationship, credit hold.
3. **Collection** — aggregated collection performance per customer, LOB, and fiscal period.
4. **Line of Business (LOB)** — classifies invoices and collection records by business line via GL Offset mapping.
5. **Payment Term** — defines payment terms used across invoices; drives compliance analysis.
6. **Collection Performance Snapshot** — pre-aggregated DSO, dispute rolling, recovery, and CEI by company × fiscal period × collection priority (FACTDSO grain).

---

## 4. Entity Relationships and Joins

| Join | Left Entity | Right Entity | Join Key | Purpose |
|---|---|---|---|---|
| DIMARDETAILS → FACTARDETAILS | DIMARDETAILS | FACTARDETAILS | COMPANYID + DOCNO + DOCTYPE + PAYITM | Link invoice attributes to invoice measures |
| DIMARDETAILS → FACTARCOLLECTION | DIMARDETAILS | FACTARCOLLECTION | COMPANYID + CUSTOMERNUMBER + FISCALPERIODID | Link invoice attributes to collection performance |
| FACTARCOLLECTION → DIMARCOLLECTIONLOB | FACTARCOLLECTION | DIMARCOLLECTIONLOB | LOB | Enrich collection facts with LOB description |
| FACTARCOLLECTION → ARPAYMENTTERM | FACTARCOLLECTION | ARPAYMENTTERM | PAYMENTTERMCODE | Enrich collection facts with net days |
| DIMARDETAILS → DIMARCOLLECTIONLOB | DIMARDETAILS | DIMARCOLLECTIONLOB | GLOFFSET | Derive LOB label for invoice dimension |
| DIMARDETAILS → ARPAYMENTTERM | DIMARDETAILS | ARPAYMENTTERM | PAYMENTTERMCODE | Enrich invoice dimension with net days for compliance |
| FACTDSO → DIMARDETAILS | FACTDSO | DIMARDETAILS | COMPANYID + CUSTOMERNUMBER (when customer present) | Enrich DSO/dispute KPIs with invoice-level attributes for drill-down |
| FACTDSO → ARPAYMENTTERM | FACTDSO | ARPAYMENTTERM | PAYMENTTERMCODE (via DIMARDETAILS) | Net days context when AVGCONTRACTUALNETDAYS not sufficient for detail |

**Population Filters** (business rules applied before/during joins):
- JDE dates are in Julian format — all must be converted to standard DATE/TIMESTAMP before use
- All monetary amounts are decimal-adjusted from JDE integer encoding (precision factor applied)
- `FISCALPERIODID` is a derived field: `((Century * 100 + Year) * 100) + Month`
- LOB is derived via: `DIMARCOLLECTIONLOB.GLOFFSET` → LOB label (not a direct source column)
- [Assumption] France-specific logic (company 10168) will be handled via SQL CASE in the staging layer (per Open Design Decision D7 recommendation)
- [Assumption] Currency: local currency only in the initial build; USD-normalized column to be added in a later phase (per Open Design Decision D3)

---

## 5. Dimensions

| Dimension | Definition | Entity |
|---|---|---|
| COMPANYID | JDE company identifier | Invoice/Pay-Item |
| DOCUMENTCOMPANY | Document company (may differ from COMPANYID) | Invoice/Pay-Item |
| DOCNO | JDE document number | Invoice/Pay-Item |
| DOCTYPE | JDE document type (invoice type code) | Invoice/Pay-Item |
| PAYITM | Pay item suffix distinguishing multiple pay items on one invoice | Invoice/Pay-Item |
| CUSTOMERNUMBER | JDE customer number | Customer |
| PARENTCUSTOMER | Parent account for customer rollup analysis | Customer |
| SALESREP | Sales representative assigned to the customer | Customer |
| COLLECTOR | COLLECTOR responsible for this invoice | Customer |
| COLLECTIONPRIORITY | Collection priority segment (H/M/L/NONE from F03012) | Customer |
| COLLECTIONMANAGER | Manager overseeing the collector | Customer |
| LOB | Line of Business (derived from GLOFFSET → DIMARCOLLECTIONLOB) | LOB |
| BUSINESSUNIT | JDE business unit code | Invoice/Pay-Item |
| BUDESC | Business unit description | Invoice/Pay-Item |
| PAYMENTTERMCODE | Payment term code on the invoice | Payment Term |
| DISPUTEREASONCODE | Reason code for dispute | Invoice/Pay-Item |
| DISPUTESTATUS | Current dispute status (Open / Resolved / null) | Invoice/Pay-Item |
| DISPUTECODEDESC | Description of dispute reason code | Invoice/Pay-Item |
| RESOLVERCODE | Code of the resolver assigned | Invoice/Pay-Item |
| RESOLVERNAME | Name of the resolver assigned | Invoice/Pay-Item |
| INVOICEDATE | Date invoice was created | Invoice/Pay-Item |
| DUEDATE | Payment due date | Invoice/Pay-Item |
| PROMISETOPAY | Promised payment date from customer | Invoice/Pay-Item |
| CURRENCYCODE | Currency of the invoice | Invoice/Pay-Item |
| HOLDFLAG | Whether customer is on credit hold (Y/N) | Customer |
| WORKDAYEMAIL | COLLECTOR/sales rep work email from Workday | Customer |
| LASTINVOICECOMMENT | Most recent invoice-level collection comment | Invoice/Pay-Item |
| LASTCUSTOMERCOMMENT | Most recent customer-level collection comment | Customer |
| ATTACHMENTSTARTDATE | Start date of attachment period | Invoice/Pay-Item |
| ATTACHMENTENDDATE | End date of attachment period | Invoice/Pay-Item |
| CHARGEBACKCODE | Chargeback classification code | Invoice/Pay-Item |
| FISCALPERIODID | Fiscal period key: ((Century*100+Year)*100)+Month | Collection |
| GLDATE | General ledger date | Invoice/Pay-Item |
| AGEASOFDATE | Date as-of for aging calculation | Invoice/Pay-Item |

---

## 6. Measures (Aggregations)

| Measure | Definition | Row Filter | Computation Method | Entity |
|---|---|---|---|---|
| OPEN_AMOUNT | Sum of outstanding invoice amounts | none | SUM(OPENAMOUNT) | Invoice/Pay-Item |
| GROSS_AMOUNT | Sum of gross invoice amounts before adjustments | none | SUM(GROSSAMOUNT) | Invoice/Pay-Item |
| TAX_AMOUNT | Sum of tax amounts | none | SUM(TAXAMOUNT) | Invoice/Pay-Item |
| DISPUTED_AMOUNT | Sum of amounts under dispute | none | SUM(DISPUTEDAMOUNT) | Invoice/Pay-Item |
| CURRENT_RESERVE | Sum of current reserve amounts | none | SUM(CURRENTRESERVE) | Invoice/Pay-Item |
| FORECAST_RESERVE_30 | Sum of 30-day forward reserve forecast | none | SUM(FORECASTRESERVE30) | Invoice/Pay-Item |
| FORECAST_RESERVE_60 | Sum of 60-day forward reserve forecast | none | SUM(FORECASTRESERVE60) | Invoice/Pay-Item |
| FORECAST_RESERVE_90 | Sum of 90-day forward reserve forecast | none | SUM(FORECASTRESERVE90) | Invoice/Pay-Item |
| CHANGE_IN_RESERVE | Net change in reserve amount | none | SUM(CHANGEINRESERVE) | Invoice/Pay-Item |
| RESERVE_CASH_APPLIED | Reserve cash applied to invoices | none | SUM(RESERVECASHAPPLIED) | Invoice/Pay-Item |
| ADJUSTMENT_AMOUNT | Sum of adjustment amounts | none | SUM(ADJUSTMENTAMOUNT) | Invoice/Pay-Item |
| DRAFT_OPEN_AMOUNT | Sum of draft open amounts | none | SUM(DRAFTOPENAMOUNT) | Invoice/Pay-Item |
| AVG_AGING_DAYS | Average aging days across invoices | none | AVG(AGINGDAYS) | Invoice/Pay-Item |
| TOTAL_RECEIPTS | Total cash receipts received from customer | none | SUM(TOTALRECEIPTS) | Collection |
| CASH_APPLIED | Cash applied against open invoices | none | SUM(CASHAPPLIED) | Collection |
| RESERVE_CASH | Reserve cash held | none | SUM(RESERVECASH) | Collection |
| ADJUSTED_COLLECTION | Adjusted collection amount | none | SUM(ADJUSTEDCOLLECTION) | Collection |
| COLLECTION_EFFICIENCY | Collection Efficiency Index (CEI) — [Assumption: CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS) — formula pending Finance sign-off per Open Decision D2] | none | ratio: numerator=CASH_APPLIED, denominator=(OPEN_AMOUNT+TOTAL_RECEIPTS) | Collection |
| UNAPPLIED_CASH_PCT | Percentage of receipts not yet applied | none | ratio: numerator=TOTAL_RECEIPTS-CASH_APPLIED, denominator=TOTAL_RECEIPTS | Collection |
| RESERVE_ACCURACY_PCT | How accurate the reserve forecast was | none | ratio: 1 - ABS(CHANGE_IN_RESERVE) / FORECAST_RESERVE_30 | Invoice/Pay-Item |
| DISPUTE_RESOLUTION_RATE | Fraction of disputes resolved | DISPUTESTATUS IS NOT NULL | ratio: numerator=COUNT(DISPUTESTATUS='Resolved'), denominator=COUNT(DISPUTESTATUS IS NOT NULL) | Invoice/Pay-Item |
| OVERDUE_WITHOUT_ACTION_PCT | Overdue invoices with no dispute or action | AGINGDAYS > 30 | ratio: numerator=COUNT(AGINGDAYS > 30 AND DISPUTESTATUS IS NULL), denominator=COUNT(AGINGDAYS > 30) | Invoice/Pay-Item |
| RESERVE_CASH_COVERAGE | Fraction of reserve covered by applied cash | none | ratio: numerator=RESERVE_CASH_APPLIED, denominator=CURRENT_RESERVE | Invoice/Pay-Item |
| HIGH_RESERVE_CHANGE_COUNT | Count of invoices with large reserve movement | CHANGEINRESERVE / FORECASTRESERVE30 > 0.2 | count with filter | Invoice/Pay-Item |
| INVOICE_COUNT | Total number of invoices / pay-items | none | count | Invoice/Pay-Item |
| **FACTDSO-native measures (gold layer — supersede semantic proxies)** | | | | |
| DSO | Days Sales Outstanding | none | column: FACTDSO.DSO | Collection Performance Snapshot |
| DSO_VARIANCE_FROM_TERMS | DSO minus avg contractual net days | none | column: FACTDSO.DSOVARIANCEFROMTERMS | Collection Performance Snapshot |
| AVG_CONTRACTUAL_NET_DAYS | Average contractual net days (F0014 PTNDDY) | none | column: FACTDSO.AVGCONTRACTUALNETDAYS | Collection Performance Snapshot |
| DISPUTED_AMOUNT_ROLLING_30 | Rolling 30-day average disputed amount | none | column: FACTDSO.DISPUTEDAMOUNTROLLING30 | Collection Performance Snapshot |
| DISPUTED_AMOUNT_ROLLING_60 | Rolling 60-day average disputed amount | none | column: FACTDSO.DISPUTEDAMOUNTROLLING60 | Collection Performance Snapshot |
| DISPUTED_AMOUNT_ROLLING_90 | Rolling 90-day average disputed amount | none | column: FACTDSO.DISPUTEDAMOUNTROLLING90 | Collection Performance Snapshot |
| DISPUTED_AMOUNT_ROLLING_180 | Rolling 180-day average disputed amount | none | column: FACTDSO.DISPUTEDAMOUNTROLLING180 | Collection Performance Snapshot |
| DISPUTE_RECOVERY_RATIO | Proportion recovered on resolved disputes | none | column: FACTDSO.DISPUTERECOVERYRATIO | Collection Performance Snapshot |
| CEI | Unified Collection Effectiveness Index | none | column: FACTDSO.CEI | Collection Performance Snapshot |
| TOTAL_OPEN_AR | Total open AR in segment/period | none | column: FACTDSO.TOTALOPENAR | Collection Performance Snapshot |
| TOTAL_GROSS_INVOICED | Total gross invoiced in period | none | column: FACTDSO.TOTALGROSSINVOICED | Collection Performance Snapshot |
| ~~DSO_PROXY~~ | **Deprecated** — replaced by FACTDSO.DSO | — | — | — |
| ~~DSO_TRUE~~ | **Deprecated** — not needed; DSO uses invoiced gross denominator | — | — | — |
| ~~DISPUTED_REMAINING_OBLIGATION_RATE~~ | **Deprecated** — replaced by FACTDSO.DISPUTERECOVERYRATIO | — | — | — |

---

## 7. Metrics (Measure over Time)

> **Fourteen primary business trend metrics** — nine invoice/collection-level trends plus five FACTDSO-native KPI trends. Rolling disputed views (30/60/90/180) are native columns on FACTDSO.

| # | Metric Name | Underlying Measure | Time Dimension | Granularity | Business Question Answered | Consumer |
|---|---|---|---|---|---|---|
| 1 | `COLLECTION_EFFICIENCY_TREND` | `COLLECTION_EFFICIENCY` | `INSERTDATE` | Daily/Monthly | "Is our collection efficiency improving or deteriorating period-over-period?" — invoice-level CEI from FACTARCOLLECTION. | Collections Manager, GM |
| 2 | `OPEN_AR_TREND` | `OPEN_AMOUNT` | `INSERTDATE` | Daily/Monthly | "How much total outstanding AR do we carry into each period, and is it growing?" | Finance, GM |
| 3 | `RESERVE_ACCURACY_TREND` | `RESERVE_ACCURACY_PCT` | `INSERTDATE` | Daily/Monthly | "How accurate is our 30-day reserve forecast vs actual reserve movement?" | Finance, Reporting |
| 4 | `UNAPPLIED_CASH_TREND` | `UNAPPLIED_CASH_PCT` | `INSERTDATE` | Daily/Monthly | "What % of receipts remain unapplied period-over-period?" | Collections Manager, Finance |
| 5 | `OVERDUE_INVOICE_TREND` | `OVERDUE_INVOICE_COUNT` (filtered: `AGINGDAYS > 30`) | `INSERTDATE` | Daily/Monthly | "Is the volume of overdue invoices growing or shrinking?" | Collections Manager, Dispute Resolver |
| 6 | `DSO_TREND` | `FACTDSO.DSO` | `FISCALYEAR` + `FISCALMONTH` | Monthly | "How long does it take to collect cash?" — native DSO from gold layer. | Finance, Collections Manager, GM |
| 7 | `DSO_VARIANCE_FROM_TERMS_TREND` | `FACTDSO.DSO_VARIANCE_FROM_TERMS` | `FISCALYEAR` + `FISCALMONTH` | Monthly | "Are we collecting slower or faster than contractual terms?" | Finance, Collections Manager |
| 8 | `DISPUTED_AMOUNT_ROLLING_30_TREND` | `FACTDSO.DISPUTED_AMOUNT_ROLLING_30` | `FISCALYEAR` + `FISCALMONTH` | Monthly | "How much disputed exposure is accumulating (30-day rolling)?" | Collections Manager, Dispute Resolver, Finance |
| 9 | `DISPUTED_AMOUNT_ROLLING_60_TREND` | `FACTDSO.DISPUTED_AMOUNT_ROLLING_60` | `FISCALYEAR` + `FISCALMONTH` | Monthly | 60-day rolling disputed amount trend | Collections Manager, Finance |
| 10 | `DISPUTED_AMOUNT_ROLLING_90_TREND` | `FACTDSO.DISPUTED_AMOUNT_ROLLING_90` | `FISCALYEAR` + `FISCALMONTH` | Monthly | 90-day rolling disputed amount trend | Collections Manager, Finance |
| 11 | `DISPUTED_AMOUNT_ROLLING_180_TREND` | `FACTDSO.DISPUTED_AMOUNT_ROLLING_180` | `FISCALYEAR` + `FISCALMONTH` | Monthly | 180-day rolling disputed amount trend | Collections Manager, Finance |
| 12 | `DISPUTE_RECOVERY_RATIO_TREND` | `FACTDSO.DISPUTE_RECOVERY_RATIO` | `FISCALYEAR` + `FISCALMONTH` | Monthly | "What proportion of resolved disputes was recovered?" | Collections Manager, Finance |
| 13 | `CEI_TREND` | `FACTDSO.CEI` | `FISCALYEAR` + `FISCALMONTH` | Monthly | Unified portfolio CEI by collection priority segment | Collections Manager, GM |
| 14 | `DSO_BY_COLLECTION_PRIORITY` | `FACTDSO.DSO` segmented by `COLLECTIONPRIORITY` | `FISCALYEAR` + `FISCALMONTH` | Monthly | "Is collection prioritization working?" — compare DSO/CEI across H/M/L/NONE | Collections Manager, GM |

**Removed (superseded by FACTDSO):** `DSO_PROXY_TREND`, `DSO_TRUE_TREND`, `DISPUTED_REMAINING_OBLIGATION_TREND`, `DISPUTED_AMOUNT_TREND` (use rolling metrics; invoice-level `DISPUTED_AMOUNT` measure remains on FACTARDETAILS for drill-down).

**Metric kind definitions (Vulcan `kind: metric` YAML — one file per metric in `models/metrics/`):**

```yaml
# models/metrics/COLLECTION_EFFICIENCY_TREND.yml
kind: metric
name: COLLECTION_EFFICIENCY_TREND
measure: FACTARCOLLECTION.COLLECTION_EFFICIENCY
ts: FACTARCOLLECTION.INSERTDATE
description: >
  Collection Efficiency Index (CEI) tracked monthly by fiscal period.
  Formula: CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS).
  Declining trend = collections team under-performing vs AR volume.
  Benchmark target: CEI >= 0.85 (industry standard for AR operations).
```

```yaml
# models/metrics/OPEN_AR_TREND.yml
kind: metric
name: OPEN_AR_TREND
measure: FACTARDETAILS.OPEN_AMOUNT
ts: FACTARDETAILS.INSERTDATE
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
measure: FACTARDETAILS.RESERVE_ACCURACY_PCT
ts: FACTARDETAILS.INSERTDATE
description: >
  Reserve forecast accuracy (CURRENTRESERVE vs PREVIOUSFORECASTRESERVE) by fiscal period.
  Values close to 1.0 = accurate reserve provisioning.
  Values below 0.8 signal that Finance needs to recalibrate the JDE reserve model.
  Used by Finance for IFRS/GAAP provision audits.
```

```yaml
# models/metrics/UNAPPLIED_CASH_TREND.yml
kind: metric
name: UNAPPLIED_CASH_TREND
measure: FACTARCOLLECTION.UNAPPLIED_CASH_PCT
ts: FACTARCOLLECTION.INSERTDATE
description: >
  Percentage of total receipts not yet applied to open invoices, tracked by fiscal period.
  Formula: (TOTALRECEIPTS - CASHAPPLIED) / TOTALRECEIPTS.
  A rising trend without a dispute volume spike = cash posting process failure.
  Primary leakage detection signal — triggers Cash Application team investigation.
```

```yaml
# models/metrics/OVERDUE_INVOICE_TREND.yml
kind: metric
name: OVERDUE_INVOICE_TREND
measure: FACTARDETAILS.OVERDUE_INVOICE_COUNT
ts: FACTARDETAILS.INSERTDATE
description: >
  Count of invoices with AGINGDAYS > 30, tracked by AGEASOFDATE.
  A growing trend = collections backlog is building.
  Segment by COLLECTOR and LOB to identify where the backlog is concentrated.
  Drives daily collections prioritisation and escalation decisions.
```

**Rolling disputed amount views** — native columns on FACTDSO (`DISPUTEDAMOUNTROLLING30/60/90/180`); no semantic-layer SQL window required.

```yaml
# models/metrics/DSO_TREND.yml
kind: metric
name: DSO_TREND
measure: FACTDSO.DSO
ts: FACTDSO.FISCALMONTH
granularity: month
description: >
  Native Days Sales Outstanding from FACTDSO gold layer.
  Formula: (TOTALOPENAR / TOTALGROSSINVOICED) * DAYSINPERIOD.
  Denominator uses invoiced gross (RPAAP), not F4211 sales orders.
```

```yaml
# models/metrics/DSO_VARIANCE_FROM_TERMS_TREND.yml
kind: metric
name: DSO_VARIANCE_FROM_TERMS_TREND
measure: FACTDSO.DSO_VARIANCE_FROM_TERMS
ts: FACTDSO.FISCALMONTH
granularity: month
description: >
  DSO minus average contractual net days (F0014). Positive = collecting slower than terms.
```

```yaml
# models/metrics/DISPUTE_RECOVERY_RATIO_TREND.yml
kind: metric
name: DISPUTE_RECOVERY_RATIO_TREND
measure: FACTDSO.DISPUTE_RECOVERY_RATIO
ts: FACTDSO.FISCALMONTH
granularity: month
description: >
  Proportion recovered on resolved disputes = Recovered / Gross.
  Native column from FACTDSO stored procedure.
```

```yaml
# models/metrics/CEI_TREND.yml
kind: metric
name: CEI_TREND
measure: FACTDSO.CEI
ts: FACTDSO.FISCALMONTH
granularity: month
description: >
  Unified Collection Effectiveness Index by company × period × collection priority.
```

**Collection prioritization effectiveness**

Slice FACTDSO by `COLLECTIONPRIORITY` (H/M/L/NONE from F03012). Compare `DSO` and `CEI` across priority segments. NONE = not collection-prioritized.

---

## 8. Grain

> What does one row represent?

**Primary grain (DIMARDETAILS + FACTARDETAILS)**: One row = one **invoice / pay-item** — uniquely identified by `COMPANYID + DOCUMENTCOMPANY + DOCNO + DOCTYPE + PAYITM`. This is the atomic AR record from which all metrics compose.

**Secondary grain (FACTARCOLLECTION)**: One row = one **customer × fiscal period × LOB** collection summary — uniquely identified by `COMPANYID + CUSTOMERNUMBER + FISCALPERIODID + LOB`.

**Reference grain (DIMARCOLLECTIONLOB)**: One row = one **LOB code** per company.

**Reference grain (ARPAYMENTTERM)**: One row = one **payment term code** per company.

**FACTDSO grain (Collection Performance Snapshot)**: One row = one **company × fiscal year × fiscal month × collection priority** segment — uniquely identified by `COMPANYID + FISCALYEAR + FISCALMONTH + COLLECTIONPRIORITY`. MCP profile: 10 rows in dev sample; DSO null rate ~50% on sparse segments.

**COLLECTIONPRIORITY semantics**: H/M/L/NONE derived from F03012 customer credit master. NONE = not collection-prioritized (no active priority assignment).

**Grain Key Construction**:
- DIMARDETAILS / FACTARDETAILS grain key: Natural composite — `COMPANYID + DOCUMENTCOMPANY + DOCNO + DOCTYPE + PAYITM` (all direct columns from F03B11)
- FACTARCOLLECTION grain key: Natural composite — `COMPANYID + CUSTOMERNUMBER + FISCALPERIODID + LOB` where `FISCALPERIODID = ((Century * 100 + Year) * 100) + Month` (derived in staging from JDE fiscal fields)
- FACTDSO grain key: Natural composite — `COMPANYID + FISCALYEAR + FISCALMONTH + COLLECTIONPRIORITY` (maintained by JDE stored procedure)

---

## 9. Measure and Metric Reasoning

**Rationale chain:**

```
CEI trend → COLLECTION_EFFICIENCY measure → CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS) → 
  CASHAPPLIED from F03B14 (FACTARCOLLECTION), OPENAMOUNT from F03B11 (FACTARDETAILS)
  
Overdue analysis → AVG_AGING_DAYS + OPEN_AMOUNT → AGINGDAYS + OPENAMOUNT from F03B11 → 
  joined with DIMARDETAILS for COLLECTOR, LOB, DISPUTESTATUS filtering
  
Reserve accuracy → RESERVE_ACCURACY_PCT → CHANGEINRESERVE / FORECASTRESERVE30 → 
  both from F59HQ084 (FACTARDETAILS)
  
Leakage detection → UNAPPLIED_CASH_PCT → TOTALRECEIPTS - CASHAPPLIED → F03B14 (FACTARCOLLECTION)
  HIGH_RESERVE_CHANGE_COUNT → CHANGEINRESERVE threshold → F59HQ084 (FACTARDETAILS)
  
Payment term compliance → AGINGDAYS > NETDAYS → AGINGDAYS from F03B11, NETDAYS from F0014 →
  requires join of FACTARDETAILS + DIMARDETAILS + ARPAYMENTTERM

DSO trend → FACTDSO.DSO → TOTALOPENAR + TOTALGROSSINVOICED + DAYSINPERIOD (stored proc)

DSO vs terms → FACTDSO.DSOVARIANCEFROMTERMS → DSO minus AVGCONTRACTUALNETDAYS (F0014 PTNDDY)

Disputed rolling trends → FACTDSO.DISPUTEDAMOUNTROLLING30/60/90/180 → native gold columns

Dispute recovery → FACTDSO.DISPUTERECOVERYRATIO → resolved dispute amounts (stored proc)

Collection prioritization → compare FACTDSO.DSO / CEI by COLLECTIONPRIORITY (H/M/L/NONE)

Unified CEI → FACTDSO.CEI → single portfolio CEI by priority segment
```

**Key design decisions**:
- CEI formula defined as `CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS)` — [Assumption] pending Finance sign-off (Open Decision D2); requires join of FACTARCOLLECTION (CASHAPPLIED, TOTALRECEIPTS) + FACTARDETAILS (OPENAMOUNT)
- All ratio measures use computed numerator/denominator — Vulcan `behavior.type: ratio` will be applied unless CLI rejects it, in which case explicit filtered count/sum + downstream division is the fallback
- `FISCALPERIODID` is a derived integer key computed in staging from JDE century/year/month fields; it is the primary time dimension for collection metrics
- `AGINGDAYS` is computed by JDE and stored directly in F59HQ084 — it is NOT recomputed by this data product
- All JDE Julian dates are converted to standard DATE/TIMESTAMP in the staging layer

---

## 10. Consumption & Freshness

- **Consumption Pattern**: Multi-channel — AI Agent (Cortex Analyst NL queries via Snowflake Semantic View), KPI Dashboards (Collections, Disputes, Leakage), Persona Reports (Collections Manager, Finance, GM), Action Triggers (email, alerts, workflow initiation)
- **Freshness**: Daily — the 6 RL_JDE tables are refreshed daily by the existing JDE pipeline (MERGE incremental per D5). This data product's semantic layer simply reads from those tables and inherits their cadence.
- **Backfill**: Full JDE history — all available data already present in `RL_JDE` tables is immediately queryable from day 1 via the semantic layer; no additional backfill step required for this data product.

---

## 11. Assumptions

- [Assumption] Workday integration will be implemented as a pre-loaded reference table with scheduled refresh (per D1 recommendation) rather than a live SQL Server call
- [Assumption] Currency: local currency only in initial build; USD-normalized column deferred to a later phase (per D3)
- [Assumption] France-specific logic (company 10168) will be handled via SQL CASE expressions in the staging layer (per D7 recommendation)
- [Assumption] CEI formula = `CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS)` — pending Finance sign-off (Open Decision D2)
- [Assumption] Dispute fields remain embedded in DIMARDETAILS (no separate DIMARDISPUTE table) per Open Decision D8 recommendation
- [Assumption] Leakage signals implemented as computed fields in FACTARDETAILS first; separate leakage table deferred until thresholds agreed (per D4)
- [Assumption] Semantic layer will provide both invoice-level and customer-period aggregated views (per D6: "dual views covering different query patterns")
- [Assumption] Reserve Accuracy threshold for "High Reserve Change" = 20% (0.2 per the formula in the design doc); exact threshold requires Analytics sign-off (marked as Open Question until confirmed)
- [Assumption] `CHANGEINRESERVE / FORECASTRESERVE30 > 0.2` is used as the leakage threshold trigger for HIGH_RESERVE_CHANGE_COUNT segment in the semantic layer
- [Assumption] The 6 RL_JDE output tables already exist in Snowflake and are managed by the existing JDE pipeline — this data product does NOT rebuild them; it wraps them as EXTERNAL models with a semantic layer
- [Assumption] **DSO denominator (resolved)**: DSO uses invoiced gross (`TOTALGROSSINVOICED` / RPAAP), not F4211 sales orders — acceptable for Otis service/maintenance AR
- [Assumption] **Dispute recovery**: FACTDSO.DISPUTERECOVERYRATIO is authoritative; confirm numerator/denominator definitions with Finance wording
- [Assumption] **COLLECTOR tiers (D11)**: COLLECTOR required when `COLLECTIONPRIORITY != 'NONE'` and invoice is overdue — hard fail at >90 days; monitor-only at >60 and >30 days
- [Assumption] **Reserve forecast DQ removed (D12)**: Finance no longer wants invoice-level reserve-forecast enforcement in active DQ; reserve accuracy remains a reporting metric only
- **CEI Formula confirmed**: `CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS)` — industry standard (Finance sign-off confirmed)

---

## 12. Open Questions

- [ ] **CEI Definition (D2)**: Confirm formula `CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS)` with Finance — is this the Otis-adjusted or industry-standard version?
- [x] **DSO denominator (D2b)**: Resolved — uses invoiced gross (RPAAP), not F4211 sales orders
- [ ] **FACTDSO grain and refresh cadence**: Confirm exact stored-proc schedule with Data Engineering
- [ ] **DISPUTERECOVERYRATIO definition (D10)**: Confirm numerator/denominator match Finance wording
- [ ] **COLLECTOR overdue tiers (D11)**: Confirm 30/60/90-day tier policy with COLLECTIONPRIORITY predicate
- [ ] **Reserve forecast DQ removal (D12)**: Confirm de-prioritization of `active_invoices_have_no_reserve_forecast` and `ar_reserve_forecast_gap` audit
- [x] **Backfill (Q9)**: Full JDE history — all data already present in RL_JDE is immediately queryable via the semantic layer. **Resolved.**
- [ ] **Reserve Change Threshold**: Confirm 20% (0.2) as the agreed threshold for HIGH_RESERVE_CHANGE_COUNT with Analytics
- [ ] **USD Normalization (D3)**: Confirm timeline for adding USD-normalized amounts column
- [ ] **Workday Reference Table Schema**: Confirm exact schema/table name for the pre-loaded Workday email reference (match via F01151 email field)
- [ ] **FISCALPERIODID Components**: Confirm which JDE columns carry Century, Year, Month values in source tables for the staging derivation
- [ ] **"Overdue Without Action" threshold**: The design doc shows AGINGDAYS > 30 — confirm this is the right aging bucket for leakage signal L4

---

## 13. Model Architecture

> **Important**: The 6 final star schema tables already exist in Snowflake under the `RL_JDE` schema, maintained by the existing JDE pipeline (including FACTDSO stored procedure). This Vulcan data product wraps them as EXTERNAL models and adds a complete semantic layer, metrics, and quality monitoring on top. No Silver/Gold build layers are created by this DP.

| Layer | Model Name | Kind | Purpose | Sources |
|---|---|---|---|---|
| External | `JDE_PRODUCTION.RL_JDE.DIMARDETAILS` | EXTERNAL | Invoice dimension (+ COLLECTIONPRIORITY) | JDE pipeline (existing) |
| External | `JDE_PRODUCTION.RL_JDE.FACTARDETAILS` | EXTERNAL | Invoice measures | JDE pipeline (existing) |
| External | `JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION` | EXTERNAL | Collection facts | JDE pipeline (existing) |
| External | `JDE_PRODUCTION.RL_JDE.FACTDSO` | EXTERNAL | **DSO, dispute rolling, recovery, CEI by priority** | JDE stored procedure (existing) |
| External | `JDE_PRODUCTION.RL_JDE.DIMARCOLLECTIONLOB` | EXTERNAL | LOB reference dim | JDE pipeline (existing) |
| External | `JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM` | EXTERNAL | Payment term reference dim | JDE pipeline (existing) |
| Semantic | `models/semantics/DIMARDETAILS.yml` | SEMANTIC | Business-friendly wrapper for DIMARDETAILS | JDE_PRODUCTION.RL_JDE.DIMARDETAILS |
| Semantic | `models/semantics/FACTARDETAILS.yml` | SEMANTIC | Invoice measures, reserve/aging (no DSO proxies) | JDE_PRODUCTION.RL_JDE.FACTARDETAILS |
| Semantic | `models/semantics/FACTARCOLLECTION.yml` | SEMANTIC | CEI components, receipts | JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION |
| Semantic | `models/semantics/FACTDSO.yml` | SEMANTIC | **DSO, dispute rolling, recovery, unified CEI** | JDE_PRODUCTION.RL_JDE.FACTDSO |
| Semantic | `models/semantics/DIMARCOLLECTIONLOB.yml` | SEMANTIC | LOB reference semantic model | JDE_PRODUCTION.RL_JDE.DIMARCOLLECTIONLOB |
| Semantic | `models/semantics/ARPAYMENTTERM.yml` | SEMANTIC | Payment term reference semantic model | JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM |
| Metrics | `models/metrics/DSO_TREND.yml` | METRIC | Native DSO trend | FACTDSO semantic model |
| Metrics | `models/metrics/DSO_VARIANCE_FROM_TERMS_TREND.yml` | METRIC | DSO vs contractual terms | FACTDSO semantic model |
| Metrics | `models/metrics/DISPUTED_AMOUNT_ROLLING_*_TREND.yml` | METRIC | Rolling disputed amount (30/60/90/180) | FACTDSO semantic model |
| Metrics | `models/metrics/DISPUTE_RECOVERY_RATIO_TREND.yml` | METRIC | Dispute recovery trend | FACTDSO semantic model |
| Metrics | `models/metrics/CEI_TREND.yml` | METRIC | Unified CEI by priority | FACTDSO semantic model |
| DQ | `dq/FACTDSO.yml` | DQ | DSO and gross-invoiced anomaly checks | JDE_PRODUCTION.RL_JDE.FACTDSO |

**Architecture decisions**:
- **Why EXTERNAL for all 6 RL_JDE tables**: They already exist in Snowflake, produced and maintained by the existing JDE pipeline. EXTERNAL registers them as metadata stubs — enabling semantic model definitions and DQ monitoring without taking ownership
- **Why Star Schema consumption architecture**: The 6 tables form a clean star schema; the semantic layer maps directly with pre-defined joins
- **No Silver/Gold layers**: Pipeline work is done by the existing JDE pipeline; this DP's value is semantic governance, metrics, AI context, and quality monitoring on top
- **Why 6 separate semantic models**: Vulcan semantic models wrap exactly one physical model — 6 tables → 6 semantic models with joins on fact tables pointing to dimension models

---

### 13.1 External Model Definitions (`external_models/rl_jde_tables.yaml`)

> This file is placed in the `external_models/` directory so it is not overwritten by `vulcan create_external_models`.
> `grains` declare the unique key for each table. `column_descriptions` and `column_tags` for the business-critical columns are documented here for catalog and lineage purposes; they are also declared on semantic model `dimensions` for AI/query-layer consumers.

```yaml
# external_models/rl_jde_tables.yaml
# All 6 tables exist in Snowflake under the RL_JDE schema.
# Vulcan registers these as metadata stubs (EXTERNAL) — no transformation.

# ─────────────────────────────────────────────────────────────────────────────
# 1. DIMARDETAILS — Invoice Dimension Table
# ─────────────────────────────────────────────────────────────────────────────
- name: JDE_PRODUCTION.RL_JDE.DIMARDETAILS
  description: >
    Invoice Dimension Table — the descriptive backbone of Customer Invoice 360.
    One row per invoice / pay-item (grain: COMPANYID + DOCUMENTCOMPANY + DOCNO +
    DOCTYPE + PAYITM). Carries all attributes needed to describe an invoice:
    who owns it (COLLECTOR, SALESREP), what status it is in (DISPUTESTATUS,
    HOLDFLAG), which LOB it belongs to, and the latest collection comments.
    Source: JDE ERP pipeline (F03B11, F0101, F03012, F5803B2I/C, F0006, Workday).
  grains:
    - COMPANYID
    - DOCUMENTCOMPANY
    - DOCNO
    - DOCTYPE
    - PAYITM
  columns:
    # ── Grain / Identity columns ──────────────────────────────────────────
    COMPANYID:          VARCHAR(10)
    DOCUMENTCOMPANY:    VARCHAR(10)
    DOCNO:              VARCHAR(20)
    DOCTYPE:            VARCHAR(5)
    PAYITM:             VARCHAR(5)
    # ── Customer & Ownership ──────────────────────────────────────────────
    CUSTOMERNUMBER:     VARCHAR(20)
    PARENTCUSTOMER:     VARCHAR(20)
    SALESREP:           VARCHAR(50)
    COLLECTOR:          VARCHAR(50)
    COLLECTIONPRIORITY: VARCHAR(10)
    COLLECTIONMANAGER:  VARCHAR(50)
    # ── LOB & Business Unit ───────────────────────────────────────────────
    GLOFFSET:           VARCHAR(10)
    LOB:                VARCHAR(50)
    BUSINESSUNIT:       VARCHAR(10)
    BUDESC:             VARCHAR(100)
    # ── Payment Terms ─────────────────────────────────────────────────────
    PAYMENTTERMCODE:    VARCHAR(10)
    # ── Dispute Fields ────────────────────────────────────────────────────
    DISPUTEREASONCODE:  VARCHAR(10)
    DISPUTESTATUS:      VARCHAR(20)
    DISPUTECODEDESC:    VARCHAR(100)
    RESOLVERCODE:       VARCHAR(10)
    RESOLVERNAME:       VARCHAR(100)
    # ── Dates ─────────────────────────────────────────────────────────────
    INVOICEDATE:        DATE
    DUEDATE:            DATE
    PROMISETOPAY:       DATE
    ATTACHMENTSTARTDATE: DATE
    ATTACHMENTENDDATE:  DATE
    # ── Customer Status ───────────────────────────────────────────────────
    CURRENCYCODE:       VARCHAR(5)
    HOLDFLAG:           VARCHAR(1)
    WORKDAYEMAIL:       VARCHAR(200)
    CHARGEBACKCODE:     VARCHAR(20)
    # ── Comments ──────────────────────────────────────────────────────────
    LASTINVOICECOMMENT:  VARCHAR(4000)
    LASTCUSTOMERCOMMENT: VARCHAR(4000)
    # ── Audit ─────────────────────────────────────────────────────────────
    INSERTDATE:         TIMESTAMP_NTZ
    MODIFYDATE:         TIMESTAMP_NTZ

  # ── Column Descriptions (business-critical columns only) ─────────────────
  column_descriptions:
    COMPANYID:          "JDE company identifier — used in all joins as part of grain key. Determines which legal entity owns the invoice."
    CUSTOMERNUMBER:     "JDE AR customer number. Groups all invoices for a customer. Join to F0101/Address Book for customer name and parent roll-up."
    PARENTCUSTOMER:     "Ultimate parent account for multi-entity customer groups. Use for parent-level CEI and consolidated AR exposure."
    COLLECTOR:          "The individual AR collector responsible for chasing payment on this invoice. Primary attribution field for COLLECTOR Performance KPI and email triggers."
    LOB:                "Line of Business classification derived from GLOFFSET via DIMARCOLLECTIONLOB reference. Required for LOB-level CEI and Exec KPI dashboards. Null LOB = unmapped GL Offset — exclude from LOB reports."
    DISPUTESTATUS:      "Current dispute status: Open, Resolved, or null (not disputed). Null ≠ unknown — null means the invoice has no registered dispute. Required for Dispute Resolution Rate KPI."
    DISPUTEREASONCODE:  "JDE reason code for the dispute. Must be co-populated with DISPUTESTATUS (both populated or both null). Used for Dispute Tracking and dispute aging analysis."
    HOLDFLAG:           "Credit hold flag: Y = customer is on credit hold, N = not on hold. Y + OPENAMOUNT > 0 = leakage signal L8 (Credit Hold Open Invoices)."
    DUEDATE:            "Contractual payment due date. Used with AGINGDAYS for overdue detection and payment term compliance (AGINGDAYS > NETDAYS from ARPAYMENTTERM)."
    PROMISETOPAY:       "Customer-committed payment date recorded by the collector. Differs from DUEDATE for negotiated/disputed invoices. Used for Promise-to-Pay tracking."
    WORKDAYEMAIL:       "COLLECTOR or sales rep work email sourced from Workday via scheduled reference table. Used for action triggers (automated email on overdue escalation)."
    MODIFYDATE:         "Timestamp of last modification in the JDE pipeline. Used as the freshness indicator in DQ timeliness checks."

  # ── Column Tags (business classification for main columns) ────────────────
  column_tags:
    COMPANYID:          ["grain", "identifier", "join_key"]
    DOCUMENTCOMPANY:    ["grain", "identifier"]
    DOCNO:              ["grain", "identifier", "invoice_key"]
    DOCTYPE:            ["grain", "identifier"]
    PAYITM:             ["grain", "identifier"]
    CUSTOMERNUMBER:     ["dimension", "customer", "join_key", "kpi"]
    PARENTCUSTOMER:     ["dimension", "customer", "hierarchy"]
    COLLECTOR:          ["dimension", "ownership", "kpi", "action_trigger"]
    COLLECTIONMANAGER:  ["dimension", "ownership", "hierarchy"]
    SALESREP:           ["dimension", "ownership"]
    LOB:                ["dimension", "lob", "kpi", "dashboard"]
    GLOFFSET:           ["dimension", "lob", "join_key"]
    BUSINESSUNIT:       ["dimension", "org_structure"]
    PAYMENTTERMCODE:    ["dimension", "compliance", "join_key"]
    DISPUTESTATUS:      ["dimension", "dispute", "kpi"]
    DISPUTEREASONCODE:  ["dimension", "dispute", "kpi"]
    RESOLVERCODE:       ["dimension", "dispute", "ownership"]
    DUEDATE:            ["date", "compliance", "aging", "kpi"]
    PROMISETOPAY:       ["date", "collections", "action_trigger"]
    INVOICEDATE:        ["date", "time_dimension"]
    HOLDFLAG:           ["flag", "leakage", "kpi", "action_trigger"]
    WORKDAYEMAIL:       ["contact", "action_trigger", "pii"]
    MODIFYDATE:         ["audit", "freshness"]


# ─────────────────────────────────────────────────────────────────────────────
# 2. FACTARDETAILS — Invoice Measures Table
# ─────────────────────────────────────────────────────────────────────────────
- name: JDE_PRODUCTION.RL_JDE.FACTARDETAILS
  description: >
    Invoice Measures Table — all quantitative AR measures per invoice / pay-item.
    One row per invoice / pay-item (same grain as DIMARDETAILS).
    Carries all financial KPIs: open amount, reserve, forecast 30/60/90,
    aging days, and reserve cash applied.
    Source: JDE ERP pipeline (F03B11, F59HQ084).
  grains:
    - COMPANYID
    - DOCUMENTCOMPANY
    - DOCNO
    - DOCTYPE
    - PAYITM
  columns:
    # ── Grain ─────────────────────────────────────────────────────────────
    COMPANYID:               VARCHAR(10)
    DOCUMENTCOMPANY:         VARCHAR(10)
    DOCNO:                   VARCHAR(20)
    DOCTYPE:                 VARCHAR(5)
    PAYITM:                  VARCHAR(5)
    # ── Core AR Amounts ───────────────────────────────────────────────────
    OPENAMOUNT:              DECIMAL(18, 2)
    GROSSAMOUNT:             DECIMAL(18, 2)
    TAXAMOUNT:               DECIMAL(18, 2)
    DISPUTEDAMOUNT:          DECIMAL(18, 2)
    # ── Reserve & Forecast ────────────────────────────────────────────────
    CURRENTRESERVE:          DECIMAL(18, 2)
    ARCURRENTRESERVE:        DECIMAL(18, 2)
    PREVIOUSFORECASTRESERVE: DECIMAL(18, 2)
    FORECASTRESERVE30:       DECIMAL(18, 2)
    FORECASTRESERVE60:       DECIMAL(18, 2)
    FORECASTRESERVE90:       DECIMAL(18, 2)
    CHANGEINRESERVE:         DECIMAL(18, 2)
    # ── Collection Fields ─────────────────────────────────────────────────
    DRAFTOPENAMOUNT:         DECIMAL(18, 2)
    ADJUSTMENTAMOUNT:        DECIMAL(18, 2)
    RESERVECASHAPPLIED:      DECIMAL(18, 2)
    # ── Aging & Time ──────────────────────────────────────────────────────
    AGINGDAYS:               INTEGER
    FISCALPERIODID:          INTEGER
    GLDATE:                  DATE
    DUEDATE:                 DATE
    AGEASOFDATE:             DATE
    LatestReceiptDate:       DATE
    # ── Audit ─────────────────────────────────────────────────────────────
    INSERTDATE:              TIMESTAMP_NTZ

  column_descriptions:
    OPENAMOUNT:              "Outstanding invoice balance as of AGEASOFDATE. The primary AR exposure metric. SUM across invoices = total open AR for a period."
    GROSSAMOUNT:             "Original invoice face value before any adjustments, discounts, or credit memos."
    DISPUTEDAMOUNT:          "Amount under formal dispute. Used in Dispute Tracking and leakage analysis (DISPUTEDAMOUNT that ages without resolution = leakage risk)."
    CURRENTRESERVE:          "Current doubtful debt reserve held for this invoice (point-in-time balance). Do NOT sum across periods — use the latest FISCALPERIODID snapshot for balance reporting."
    FORECASTRESERVE30:       "30-day forward reserve forecast. Used as the denominator in Reserve Accuracy % and the threshold in leakage signal L7 (CHANGEINRESERVE / FORECASTRESERVE30 > 0.2)."
    FORECASTRESERVE60:       "60-day forward reserve forecast. Used for medium-term exposure planning."
    FORECASTRESERVE90:       "90-day forward reserve forecast. Used for long-range exposure planning and IFRS provisioning."
    CHANGEINRESERVE:         "Period-over-period change in reserve. Positive = more doubtful debt provisioned; negative = reserve released. Primary reserve leakage signal L2."
    RESERVECASHAPPLIED:      "Reserve cash that has been applied to this invoice. Zero on an aged invoice with CURRENTRESERVE > 0 = leakage signal L6 (reserve held but not utilised)."
    AGINGDAYS:               "Number of days the invoice has been outstanding beyond its DUEDATE. Computed by JDE; NOT recomputed by this DP. > 30 days = overdue; > 90 days = high write-off risk."
    FISCALPERIODID:          "Fiscal period integer key: ((Century * 100 + Year) * 100) + Month. Example: 20260800 = August 2026. Primary time dimension for all period-based trend metrics."
    AGEASOFDATE:             "The date as-of which AGINGDAYS was calculated. Used as time dimension for OVERDUE_INVOICE_TREND metric."

  column_tags:
    COMPANYID:               ["grain", "identifier", "join_key"]
    DOCUMENTCOMPANY:         ["grain", "identifier"]
    DOCNO:                   ["grain", "identifier", "invoice_key"]
    DOCTYPE:                 ["grain", "identifier"]
    PAYITM:                  ["grain", "identifier"]
    OPENAMOUNT:              ["measure", "amount", "kpi", "dashboard", "finance"]
    GROSSAMOUNT:             ["measure", "amount", "finance"]
    DISPUTEDAMOUNT:          ["measure", "amount", "dispute", "leakage"]
    CURRENTRESERVE:          ["measure", "reserve", "stock", "kpi", "finance"]
    FORECASTRESERVE30:       ["measure", "reserve", "forecast", "kpi", "finance"]
    FORECASTRESERVE60:       ["measure", "reserve", "forecast", "finance"]
    FORECASTRESERVE90:       ["measure", "reserve", "forecast", "finance"]
    CHANGEINRESERVE:         ["measure", "reserve", "leakage", "kpi", "signal"]
    RESERVECASHAPPLIED:      ["measure", "reserve", "leakage", "signal"]
    AGINGDAYS:               ["measure", "aging", "kpi", "overdue", "compliance"]
    FISCALPERIODID:          ["time_dimension", "period", "kpi"]
    AGEASOFDATE:             ["date", "time_dimension", "aging"]
    DUEDATE:                 ["date", "compliance"]


# ─────────────────────────────────────────────────────────────────────────────
# 3. FACTARCOLLECTION — Collection Facts Table
# ─────────────────────────────────────────────────────────────────────────────
- name: JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
  description: >
    Collection Facts Table — aggregated collection performance per customer,
    LOB, and fiscal period. One row per COMPANYID + CUSTOMERNUMBER +
    FISCALPERIODID + LOB. The home of CEI, unapplied cash, and collection
    efficiency KPIs. Source: JDE ERP pipeline (F03B14, F03B13, F0006).
  grains:
    - COMPANYID
    - CUSTOMERNUMBER
    - FISCALPERIODID
    - LOB
  columns:
    # ── Grain ─────────────────────────────────────────────────────────────
    COMPANYID:            VARCHAR(10)
    CUSTOMERNUMBER:       VARCHAR(20)
    FISCALPERIODID:       INTEGER
    LOB:                  VARCHAR(50)
    # ── Organisational ────────────────────────────────────────────────────
    BUSINESSUNIT:         VARCHAR(10)
    PAYMENTTERMCODE:      VARCHAR(10)
    # ── Collection Amounts ────────────────────────────────────────────────
    TOTALRECEIPTS:        DECIMAL(18, 2)
    CASHAPPLIED:          DECIMAL(18, 2)
    RESERVECASH:          DECIMAL(18, 2)
    ADJUSTEDCOLLECTION:   DECIMAL(18, 2)
    # ── Efficiency KPI ────────────────────────────────────────────────────
    COLLECTIONEFFICIENCY: DECIMAL(10, 6)
    # ── Audit ─────────────────────────────────────────────────────────────
    INSERTDATE:           TIMESTAMP_NTZ

  column_descriptions:
    CUSTOMERNUMBER:       "JDE AR customer number (grain key). Identifies the customer whose collection performance this row describes."
    FISCALPERIODID:       "Fiscal period integer key (grain key): ((Century * 100 + Year) * 100) + Month. Primary time dimension for CEI trend and unapplied cash trend metrics."
    LOB:                  "Line of Business (grain key). Enables LOB-level CEI analysis and Exec KPI dashboard breakdown by business line."
    TOTALRECEIPTS:        "Total cash receipts posted for this customer × period × LOB. Denominator in Unapplied Cash %. A sudden drop signals missed cash postings."
    CASHAPPLIED:          "Cash receipts that have been matched and applied against open invoices. Numerator in CEI formula. TOTALRECEIPTS - CASHAPPLIED = unapplied cash (leakage signal L1)."
    RESERVECASH:          "Reserve cash component of total receipts. Tracked separately from standard CASHAPPLIED for reserve utilisation reporting."
    ADJUSTEDCOLLECTION:   "Collection amount after adjustments (discounts, write-offs, credit memos). Used in Adjusted Collection Gap leakage signal L3."
    COLLECTIONEFFICIENCY: "Pre-computed Collection Efficiency Index (CEI) = CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS). Stored value from JDE pipeline. Always recompute from raw measures for trend analysis to avoid cross-period averaging errors."

  column_tags:
    COMPANYID:            ["grain", "identifier", "join_key"]
    CUSTOMERNUMBER:       ["grain", "identifier", "customer", "join_key"]
    FISCALPERIODID:       ["grain", "time_dimension", "period", "kpi"]
    LOB:                  ["grain", "dimension", "lob", "kpi"]
    TOTALRECEIPTS:        ["measure", "amount", "receipts", "kpi"]
    CASHAPPLIED:          ["measure", "amount", "receipts", "kpi", "cei"]
    RESERVECASH:          ["measure", "amount", "reserve"]
    ADJUSTEDCOLLECTION:   ["measure", "amount", "leakage", "signal"]
    COLLECTIONEFFICIENCY: ["measure", "kpi", "cei", "dashboard", "stored_ratio"]


# ─────────────────────────────────────────────────────────────────────────────
# 4. DIMARCOLLECTIONLOB — Line of Business Reference Dimension
# ─────────────────────────────────────────────────────────────────────────────
- name: JDE_PRODUCTION.RL_JDE.DIMARCOLLECTIONLOB
  description: >
    Line of Business Reference Dimension — maps GL Offset codes to LOB labels.
    One row per LOBKEY (company + LOB code). Used to classify invoices and
    collection records by business line across all fact tables.
    Source: JDE ERP pipeline (F0012 GL Offset descriptions).
  grains:
    - LOBKEY
  columns:
    LOBKEY:          INTEGER
    COMPANYID:       VARCHAR(10)
    LOBCODE:         VARCHAR(20)
    LOBDESCRIPTION:  VARCHAR(100)
    GLOFFSET:        VARCHAR(10)

  column_descriptions:
    LOBKEY:         "Surrogate primary key for the LOB reference table."
    LOBCODE:        "Short Line of Business code used in FACTARCOLLECTION and DIMARDETAILS LOB fields."
    LOBDESCRIPTION: "Full name of the Line of Business (e.g., 'Maintenance', 'New Equipment'). Displayed in LOB-level CEI dashboards."
    GLOFFSET:       "JDE General Ledger offset code that maps to this LOB. Join key from DIMARDETAILS.GLOFFSET to derive LOB label."

  column_tags:
    LOBKEY:         ["grain", "surrogate_key"]
    LOBCODE:        ["dimension", "lob", "join_key", "kpi"]
    LOBDESCRIPTION: ["dimension", "lob", "display"]
    GLOFFSET:       ["dimension", "lob", "join_key"]


# ─────────────────────────────────────────────────────────────────────────────
# 5. ARPAYMENTTERM — Payment Term Reference Dimension
# ─────────────────────────────────────────────────────────────────────────────
- name: JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM
  description: >
    Payment Term Reference Dimension — defines payment terms used across
    invoices and collection records. One row per PAYMENTTERMKEY (company +
    code). Used for payment term compliance analysis (AGINGDAYS > NETDAYS).
    Source: JDE ERP pipeline (F0014 Payment Terms).
  grains:
    - PAYMENTTERMKEY
  columns:
    PAYMENTTERMKEY:   INTEGER
    COMPANYID:        VARCHAR(10)
    PAYMENTTERMCODE:  VARCHAR(10)
    DESCRIPTION:      VARCHAR(100)
    NETDAYS:          INTEGER

  column_descriptions:
    PAYMENTTERMKEY:  "Surrogate primary key for the payment term reference table."
    PAYMENTTERMCODE: "JDE payment term code. Join key from DIMARDETAILS.PAYMENTTERMCODE and FACTARCOLLECTION.PAYMENTTERMCODE."
    DESCRIPTION:     "Human-readable payment term description (e.g., 'Net 30', '2/10 Net 30'). Displayed in payment term compliance reports."
    NETDAYS:         "Number of days from invoice date until payment is due. Used in compliance check: AGINGDAYS > NETDAYS = invoice has breached its payment term."

  column_tags:
    PAYMENTTERMKEY:  ["grain", "surrogate_key"]
    PAYMENTTERMCODE: ["dimension", "compliance", "join_key"]
    DESCRIPTION:     ["dimension", "compliance", "display"]
    NETDAYS:         ["measure", "compliance", "kpi", "threshold"]

# ─────────────────────────────────────────────────────────────────────────────
# 6. FACTDSO — DSO & Dispute Analytics Fact
# ─────────────────────────────────────────────────────────────────────────────
- name: JDE_PRODUCTION.RL_JDE.FACTDSO
  description: >
    DSO & Dispute Analytics Fact — company × fiscal period × collection-priority grain.
  grains:
    - COMPANYID
    - FISCALYEAR
    - FISCALMONTH
    - COLLECTIONPRIORITY
  columns:
    COMPANYID:               VARCHAR(10)
    FISCALYEAR:              INTEGER
    FISCALMONTH:             INTEGER
    COLLECTIONPRIORITY:      VARCHAR(10)
    TOTALOPENAR:             DECIMAL(18, 2)
    TOTALGROSSINVOICED:      DECIMAL(18, 2)
    DAYSINPERIOD:            INTEGER
    DSO:                     DECIMAL(18, 4)
    AVGCONTRACTUALNETDAYS:   DECIMAL(18, 4)
    DSOVARIANCEFROMTERMS:    DECIMAL(18, 4)
    DISPUTEDAMOUNTROLLING30: DECIMAL(18, 2)
    DISPUTEDAMOUNTROLLING60: DECIMAL(18, 2)
    DISPUTEDAMOUNTROLLING90: DECIMAL(18, 2)
    DISPUTEDAMOUNTROLLING180: DECIMAL(18, 2)
    DISPUTERECOVERYRATIO:    DECIMAL(10, 6)
    CEI:                     DECIMAL(10, 6)
    INVOICECOUNT:            INTEGER

```

---

## 14. Design Specification — YAML Contract

```yaml
name: customer_invoices
version: 1.0
  engine: snowflake
  schema: RL_JDE

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
    grain: one row per COMPANYID + DOCUMENTCOMPANY + DOCNO + DOCTYPE + PAYITM

  - name: collection_summary
    grain: one row per COMPANYID + CUSTOMERNUMBER + FISCALPERIODID + LOB

  - name: lob_reference
    grain: one row per LOBKEY (company + LOB code)

  - name: payment_term_reference
    grain: one row per PAYMENTTERMKEY (company + PAYMENTTERMCODE)

entity_relationships:
  - left: DIMARDETAILS
    right: FACTARDETAILS
    join_key: COMPANYID + DOCNO + DOCTYPE + PAYITM
    purpose: Link invoice attributes (collector, dispute, customer) to invoice measures (amounts, reserves, aging)

  - left: DIMARDETAILS
    right: FACTARCOLLECTION
    join_key: COMPANYID + CUSTOMERNUMBER + FISCALPERIODID
    purpose: Link invoice dimension to collection performance facts for collector analysis

  - left: FACTARCOLLECTION
    right: DIMARCOLLECTIONLOB
    join_key: LOB
    purpose: Enrich collection facts with LOB description for LOB-level performance reporting

  - left: FACTARCOLLECTION
    right: ARPAYMENTTERM
    join_key: PAYMENTTERMCODE
    purpose: Enrich collection facts with net days for payment term compliance analysis

  - left: DIMARDETAILS
    right: DIMARCOLLECTIONLOB
    join_key: GLOFFSET
    purpose: Derive LOB label for each invoice dimension row

  - left: DIMARDETAILS
    right: ARPAYMENTTERM
    join_key: PAYMENTTERMCODE
    purpose: Enable payment term compliance check (AGINGDAYS > NETDAYS) from dimension alone

measures:
  - name: OPEN_AMOUNT
    definition: SUM(OPENAMOUNT) — total outstanding AR
    entity: invoice_pay_item

  - name: CURRENT_RESERVE
    definition: SUM(CURRENTRESERVE) — total reserve held
    entity: invoice_pay_item

  - name: FORECAST_RESERVE_30
    definition: SUM(FORECASTRESERVE30) — 30-day forward reserve
    entity: invoice_pay_item

  - name: CHANGE_IN_RESERVE
    definition: SUM(CHANGEINRESERVE) — net reserve movement
    entity: invoice_pay_item

  - name: TOTAL_RECEIPTS
    definition: SUM(TOTALRECEIPTS) — total cash receipts
    entity: collection_summary

  - name: CASH_APPLIED
    definition: SUM(CASHAPPLIED) — receipts matched to invoices
    entity: collection_summary

  - name: COLLECTION_EFFICIENCY
    definition: CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS) — CEI ratio [Assumption: formula pending Finance sign-off]
    entity: collection_summary

  - name: UNAPPLIED_CASH_PCT
    definition: (TOTALRECEIPTS - CASHAPPLIED) / TOTALRECEIPTS — unapplied fraction
    entity: collection_summary

  - name: RESERVE_ACCURACY_PCT
    definition: 1 - ABS(CHANGEINRESERVE / FORECASTRESERVE30) — reserve forecast accuracy
    entity: invoice_pay_item

  - name: DISPUTE_RESOLUTION_RATE
    definition: COUNT(DISPUTESTATUS='Resolved') / COUNT(DISPUTESTATUS IS NOT NULL)
    entity: invoice_pay_item

  - name: RESERVE_CASH_COVERAGE
    definition: RESERVECASHAPPLIED / CURRENTRESERVE — cash coverage of reserve
    entity: invoice_pay_item

metrics:
  - name: COLLECTION_EFFICIENCY_TREND
    measure: COLLECTION_EFFICIENCY
    time_dimension: FISCALPERIODID
    description: CEI tracked by fiscal period

  - name: OPEN_AMOUNT_TREND
    measure: OPEN_AMOUNT
    time_dimension: GLDATE
    description: Total open AR trend over GL dates

  - name: RESERVE_ACCURACY_TREND
    measure: RESERVE_ACCURACY_PCT
    time_dimension: AGEASOFDATE
    description: Reserve forecast accuracy tracked by period

  - name: UNAPPLIED_CASH_TREND
    measure: UNAPPLIED_CASH_PCT
    time_dimension: FISCALPERIODID
    description: Unapplied cash % by fiscal period

dimensions:
  - name: CUSTOMERNUMBER
    type: string
    entity: invoice_pay_item

  - name: COLLECTOR
    type: string
    entity: invoice_pay_item

  - name: LOB
    type: string
    entity: invoice_pay_item

  - name: DISPUTESTATUS
    type: string
    entity: invoice_pay_item

  - name: HOLDFLAG
    type: string
    entity: invoice_pay_item

  - name: FISCALPERIODID
    type: number
    entity: collection_summary

  - name: GLDATE
    type: date
    entity: invoice_pay_item

  - name: DUEDATE
    type: date
    entity: invoice_pay_item

  - name: PAYMENTTERMCODE
    type: string
    entity: invoice_pay_item

  - name: AGINGDAYS
    type: number
    entity: invoice_pay_item

  - name: COMPANYID
    type: string
    entity: invoice_pay_item

freshness:
  cadence: daily
  expected_by: "6am UTC"
  backfill: OPEN QUESTION — see Section 12

consumption:
  pattern: AI Agent (Cortex Analyst NL queries) + KPI Dashboards + Persona Reports + Action Triggers
```

---

## 15. Quality Rules (Recommended)

> Strategy: Since the 6 RL_JDE tables are EXTERNAL (managed by the JDE pipeline), Vulcan MODEL() assertions cannot be added directly.
> The three-layer quality strategy is:
> 1. **Blocking audits** (`audits/*.sql`) — catch critical data integrity failures; run via `vulcan audit`
> 2. **Non-blocking DQ checks** (`dq/*.yml`, `kind: dq`) — monitor business KPI thresholds and leakage signals
> 3. **SLOs** — freshness and completeness commitments for period-end reporting

---

### Blocking Audit Files (`audits/`)

> **SQL convention (this plan):** All examples use Snowflake identifiers — database `JDE_PRODUCTION`, schema `RL_JDE`, uppercase table and column names (e.g. `JDE_PRODUCTION.RL_JDE.DIMARDETAILS`, `COMPANYID`, `OPENAMOUNT`).

> Each audit returns rows that represent a business problem. Zero rows = pass. Any rows = audit fails, investigation required.

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_fact_dim_grain_integrity.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: FACTARDETAILS rows without a matching DIMARDETAILS row
-- are invisible financial exposures. OPENAMOUNT for those invoices cannot
-- appear in any COLLECTOR, LOB, or Dispute dashboard — they are hidden AR.
-- This is the most critical integrity check in the data product.
AUDIT (name ar_fact_dim_grain_integrity);

SELECT
    f.COMPANYID,
    f.DOCUMENTCOMPANY,
    f.DOCNO,
    f.DOCTYPE,
    f.PAYITM,
    f.OPENAMOUNT          AS orphan_open_amount,
    f.CURRENTRESERVE      AS orphan_reserve,
    f.FISCALPERIODID
FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
LEFT JOIN JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
    ON  f.COMPANYID       = d.COMPANYID
    AND f.DOCUMENTCOMPANY = d.DOCUMENTCOMPANY
    AND f.DOCNO           = d.DOCNO
    AND f.DOCTYPE         = d.DOCTYPE
    AND f.PAYITM          = d.PAYITM
WHERE d.DOCNO IS NULL
  AND f.OPENAMOUNT > 0;
-- Only flag rows with actual outstanding balance (zero-balance orphans are lower priority)
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_lob_not_derivable.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: A null or empty LOB on an invoice means that invoice
-- is excluded from ALL LOB-level CEI calculations, Exec KPI dashboards,
-- and LOB performance reports (DQ3 in design doc).
-- Root cause: GLOFFSET in F03B11 has no matching row in DIMARCOLLECTIONLOB.
-- Fix: Add the missing GLOFFSET to the DIMARCOLLECTIONLOB reference table.
AUDIT (name ar_lob_not_derivable);

SELECT
    d.COMPANYID,
    d.DOCNO,
    d.DOCTYPE,
    d.PAYITM,
    d.GLOFFSET            AS unmapped_gl_offset,
    f.OPENAMOUNT          AS open_amount_excluded_from_lob_reports
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.COMPANYID       = f.COMPANYID
    AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
    AND d.DOCNO           = f.DOCNO
    AND d.DOCTYPE         = f.DOCTYPE
    AND d.PAYITM          = f.PAYITM
WHERE (d.LOB IS NULL OR d.LOB = '')
  AND f.OPENAMOUNT > 0;
-- Show open amount to quantify financial impact of missing LOB derivation
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_dispute_co_population_integrity.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: Partial dispute records (one field populated, the other null)
-- corrupt the Dispute Resolution Rate KPI (DQ5 in design doc).
-- Example: DISPUTESTATUS = "Open" but DISPUTEREASONCODE = null means the
-- dispute cannot be categorised in Dispute Tracking reports.
-- Root cause: JDE data entry error or incomplete dispute posting in F03B11.
AUDIT (name ar_dispute_co_population_integrity);

SELECT
    COMPANYID,
    DOCNO,
    DOCTYPE,
    PAYITM,
    CUSTOMERNUMBER,
    COLLECTOR,
    DISPUTESTATUS,
    DISPUTEREASONCODE,
    CASE
        WHEN DISPUTESTATUS IS NOT NULL AND DISPUTEREASONCODE IS NULL
            THEN 'Status set, ReasonCode missing — dispute cannot be categorised'
        WHEN DISPUTESTATUS IS NULL AND DISPUTEREASONCODE IS NOT NULL
            THEN 'ReasonCode set, Status missing — dispute cannot be tracked'
    END AS integrity_violation_description
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS
WHERE (DISPUTESTATUS IS NOT NULL AND DISPUTEREASONCODE IS NULL)
   OR (DISPUTESTATUS IS NULL     AND DISPUTEREASONCODE IS NOT NULL);
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_cash_applied_exceeds_receipts.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: CASHAPPLIED > TOTALRECEIPTS is a JDE misposting error.
-- Mathematically impossible in real operations — you cannot apply more cash
-- than you received. Each row here directly inflates the CEI for that
-- customer × period × LOB, causing the KPI to show collection performance
-- better than actuality.
-- Root cause: Duplicate receipts posted, reversed receipt not yet cleared,
-- or cross-period posting mismatch in F03B14.
AUDIT (name ar_cash_applied_exceeds_receipts);

SELECT
    COMPANYID,
    CUSTOMERNUMBER,
    FISCALPERIODID,
    LOB,
    TOTALRECEIPTS,
    CASHAPPLIED,
    CASHAPPLIED - TOTALRECEIPTS          AS over_application_amount,
    ROUND(CASHAPPLIED / NULLIF(TOTALRECEIPTS, 0) * 100, 2) AS applied_pct
FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
WHERE CASHAPPLIED > TOTALRECEIPTS * 1.005;
-- 0.5% tolerance covers legitimate floating-point rounding in JDE decimal encoding
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_payment_term_orphan.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: A PAYMENTTERMCODE on an invoice that has no row in
-- ARPAYMENTTERM means NETDAYS is unknown for that invoice.
-- Payment Term Compliance analysis (AGINGDAYS > NETDAYS) will silently
-- exclude those invoices — they will never appear in "breaching payment terms"
-- reports even when genuinely overdue.
-- Root cause: New payment term added to JDE but not yet loaded to ARPAYMENTTERM.
AUDIT (name ar_payment_term_orphan);

SELECT
    d.COMPANYID,
    d.DOCNO,
    d.DOCTYPE,
    d.PAYITM,
    d.CUSTOMERNUMBER,
    d.PAYMENTTERMCODE     AS unmapped_payment_term,
    f.AGINGDAYS,
    f.OPENAMOUNT
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.COMPANYID       = f.COMPANYID
    AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
    AND d.DOCNO           = f.DOCNO
    AND d.DOCTYPE         = f.DOCTYPE
    AND d.PAYITM          = f.PAYITM
LEFT JOIN JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM pt
    ON d.PAYMENTTERMCODE  = pt.PAYMENTTERMCODE
WHERE d.PAYMENTTERMCODE IS NOT NULL
  AND pt.PAYMENTTERMCODE IS NULL
  AND f.OPENAMOUNT        > 0;
```

-- audits/ar_reserve_forecast_gap.sql  [DEPRECATED — removed from active checks per D12]
-- Previously flagged active invoices with zero forecast reserve buckets.
-- Finance confirmed this is no longer an invoice-level DQ enforcement target.
-- File retained for reference only; not registered in inputs.yaml audits.
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_period_all_companies_present.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: If any company is missing from FACTARCOLLECTION for the
-- current fiscal period, that company's entire collection performance is
-- absent from the period-end CEI report and Exec KPI dashboard (DQ4 in design doc).
-- Finance will produce an incomplete period-end AR summary.
-- Root cause: JDE collection pipeline failed for that company, or the period
-- has not yet been closed/processed for that entity.
AUDIT (name ar_period_all_companies_present);

WITH companies_with_recent_history AS (
    -- Companies that had collection activity in the past 3 periods
    SELECT DISTINCT COMPANYID
    FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
    WHERE FISCALPERIODID >= (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION) - 3
),
latest_period_companies AS (
    SELECT DISTINCT COMPANYID
    FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
    WHERE FISCALPERIODID = (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION)
)
SELECT
    h.COMPANYID                                                     AS missing_company,
    (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION)       AS current_period,
    'Company had collection data in recent periods but is absent in current period'
        AS impact_description
FROM companies_with_recent_history h
LEFT JOIN latest_period_companies l ON h.COMPANYID = l.COMPANYID
WHERE l.COMPANYID IS NULL;
```

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- audits/ar_collector_unassigned_on_overdue.sql
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS IMPACT: Overdue invoices without a COLLECTOR assigned have no owner
-- for follow-up. Tiered policy:
--   >90 days + open balance = hard fail (blocking audit)
--   >60 days = monitor-only DQ warning
--   >30 days = monitor-only DQ warning
-- Root cause: customer not yet assigned to a collector in JDE F0101 Address Book.
AUDIT (name ar_collector_unassigned_on_overdue);

SELECT
    d.COMPANYID,
    d.DOCNO,
    d.DOCTYPE,
    d.PAYITM,
    d.CUSTOMERNUMBER,
    d.LOB,
    d.DUEDATE,
    f.AGINGDAYS,
    f.OPENAMOUNT,
    d.DISPUTESTATUS
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.COMPANYID       = f.COMPANYID
    AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
    AND d.DOCNO           = f.DOCNO
    AND d.DOCTYPE         = f.DOCTYPE
    AND d.PAYITM          = f.PAYITM
WHERE (d.COLLECTOR IS NULL OR TRIM(d.COLLECTOR) = '')
  AND d.COLLECTIONPRIORITY IS NOT NULL AND d.COLLECTIONPRIORITY <> 'NONE'
  AND f.AGINGDAYS > 90
  AND f.OPENAMOUNT > 0
ORDER BY f.OPENAMOUNT DESC;
```

---

### Data Quality Rules (`dq/` — non-blocking monitoring)

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# dq/DIMARDETAILS.yml
# ═══════════════════════════════════════════════════════════════════════════
# Business purpose: Monitor the Invoice Dimension — the descriptive backbone
# of Invoice 360. Without correct attribution (COLLECTOR, LOB, Customer),
# every AR KPI breaks silently. These rules catch the slow degradation that
# audits miss (gradual null creep, growing unattributed invoices over time).
kind: dq
name: DIMARDETAILS_dq
depends_on: JDE_PRODUCTION.RL_JDE.DIMARDETAILS

profiles:
  - COLLECTOR
  - LOB
  - DISPUTESTATUS
  - HOLDFLAG
  - MODIFYDATE

rules:

  # ── Completeness ─────────────────────────────────────────────────────────

  - missing_count(CUSTOMERNUMBER) = 0:
      name: every_invoice_has_a_customer
      dimension: completeness
      description: >
        Every invoice must be attributed to a customer. Null CUSTOMERNUMBER
        = the invoice cannot appear in any customer-level AR report, COLLECTOR
        Performance dashboard, or Parent Customer rollup. Zero tolerance.

  - failed rows:
      name: collector_required_for_way_overdue_invoices
      dimension: completeness
      fail query: |
        SELECT d.COMPANYID, d.DOCNO, d.DOCTYPE, d.PAYITM,
               d.CUSTOMERNUMBER, d.COLLECTOR, f.AGINGDAYS, f.OPENAMOUNT
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
          ON d.COMPANYID = f.COMPANYID AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
         AND d.DOCNO = f.DOCNO AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        WHERE (d.COLLECTOR IS NULL OR TRIM(d.COLLECTOR) = '')
          AND d.COLLECTIONPRIORITY IS NOT NULL AND d.COLLECTIONPRIORITY <> 'NONE'
          AND f.AGINGDAYS > 90
          AND f.OPENAMOUNT > 0
      samples limit: 20
      description: >
        COLLECTOR is required when COLLECTIONPRIORITY != 'NONE' (prioritized for collections)
        and invoice is way overdue. Hard fail when AGINGDAYS > 90.

  - failed rows:
      name: collector_missing_monitor_60_days
      dimension: completeness
      fail query: |
        SELECT d.COMPANYID, d.DOCNO, d.CUSTOMERNUMBER, f.AGINGDAYS, f.OPENAMOUNT
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
          ON d.COMPANYID = f.COMPANYID AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
         AND d.DOCNO = f.DOCNO AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        WHERE (d.COLLECTOR IS NULL OR TRIM(d.COLLECTOR) = '')
          AND d.COLLECTIONPRIORITY IS NOT NULL AND d.COLLECTIONPRIORITY <> 'NONE'
          AND f.AGINGDAYS BETWEEN 61 AND 90
          AND f.OPENAMOUNT > 0
      samples limit: 20
      description: >
        Monitor-only tier: missing collector on invoices overdue 61–90 days.
        Warning signal — not zero tolerance.

  - failed rows:
      name: collector_missing_monitor_30_days
      dimension: completeness
      fail query: |
        SELECT d.COMPANYID, d.DOCNO, d.CUSTOMERNUMBER, f.AGINGDAYS, f.OPENAMOUNT
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
          ON d.COMPANYID = f.COMPANYID AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
         AND d.DOCNO = f.DOCNO AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        WHERE (d.COLLECTOR IS NULL OR TRIM(d.COLLECTOR) = '')
          AND d.COLLECTIONPRIORITY IS NOT NULL AND d.COLLECTIONPRIORITY <> 'NONE'
          AND f.AGINGDAYS BETWEEN 31 AND 60
          AND f.OPENAMOUNT > 0
      samples limit: 20
      description: >
        Monitor-only tier: missing collector on invoices overdue 31–60 days.
        Early warning — not zero tolerance.

  - missing_count(DUEDATE) = 0:
      name: every_invoice_has_a_due_date
      dimension: completeness
      description: >
        DUEDATE is required for AGINGDAYS calculation and payment term compliance.
        A null DUEDATE = AGINGDAYS cannot be computed for that invoice, making it
        invisible in overdue aging analysis.

  - missing_percent(LOB) < 1:
      name: lob_derived_for_99pct_of_invoices
      dimension: coverage
      description: >
        LOB is derived from GLOFFSET via DIMARCOLLECTIONLOB. Up to 1% null LOB
        is tolerated for newly-added GL Offsets not yet in the reference table.
        Above 1% signals a systematic GL Offset mapping failure — LOB-level CEI
        and Exec dashboards will have significant blind spots.
        [Estimated threshold: 1% — calibrate after deployment]

  # ── Uniqueness ────────────────────────────────────────────────────────────

  - duplicate_count(COMPANYID, DOCUMENTCOMPANY, DOCNO, DOCTYPE, PAYITM) = 0:
      name: invoice_grain_must_be_unique
      dimension: uniqueness
      description: >
        Duplicate grain rows cause double-counting in OPENAMOUNT totals and CEI.
        This is a hard data integrity failure — every financial KPI on this table
        will be inflated. Zero tolerance.

  # ── Validity: Dispute Fields ──────────────────────────────────────────────

  - failed rows:
      name: dispute_status_and_reason_code_co_populated
      dimension: validity
      fail query: |
        SELECT COMPANYID, DOCNO, DOCTYPE, PAYITM,
               CUSTOMERNUMBER, COLLECTOR,
               DISPUTESTATUS, DISPUTEREASONCODE,
               CASE
                   WHEN DISPUTESTATUS IS NOT NULL AND DISPUTEREASONCODE IS NULL
                       THEN 'Status set, ReasonCode missing'
                   WHEN DISPUTESTATUS IS NULL AND DISPUTEREASONCODE IS NOT NULL
                       THEN 'ReasonCode set, Status missing'
               END AS violation
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS
        WHERE (DISPUTESTATUS IS NOT NULL AND DISPUTEREASONCODE IS NULL)
           OR (DISPUTESTATUS IS NULL     AND DISPUTEREASONCODE IS NOT NULL)
      samples limit: 20
      description: >
        Dispute Resolution Rate KPI requires both fields populated together or
        both null. Partial records inflate total_dispute_count (denominator)
        without a matching resolved_dispute_count (numerator), systematically
        understating the Dispute Resolution Rate.

  - failed rows:
      name: payment_term_code_in_reference_table
      dimension: consistency
      fail query: |
        SELECT d.COMPANYID, d.DOCNO, d.PAYMENTTERMCODE, f.AGINGDAYS
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
            ON d.COMPANYID = f.COMPANYID AND d.DOCNO = f.DOCNO
           AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        LEFT JOIN JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM pt ON d.PAYMENTTERMCODE = pt.PAYMENTTERMCODE
        WHERE d.PAYMENTTERMCODE IS NOT NULL
          AND pt.PAYMENTTERMCODE IS NULL
          AND f.OPENAMOUNT > 0
      samples limit: 20
      description: >
        Invoices with PAYMENTTERMCODE absent from ARPAYMENTTERM cannot be assessed
        for payment term compliance (AGINGDAYS > NETDAYS). They are silently excluded
        from the 'invoices breaching payment terms' report — a compliance blind spot.

  # ── Accuracy: Leakage Signal Monitoring ──────────────────────────────────

  - failed rows:
      name: credit_hold_customers_with_growing_open_ar
      dimension: accuracy
      fail query: |
        SELECT
            d.COMPANYID,
            d.CUSTOMERNUMBER,
            d.HOLDFLAG,
            COUNT(*)              AS invoice_count,
            SUM(f.OPENAMOUNT)     AS total_open_amount,
            MAX(f.AGINGDAYS)      AS max_aging_days
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
            ON d.COMPANYID = f.COMPANYID AND d.DOCNO = f.DOCNO
           AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        WHERE d.HOLDFLAG    = 'Y'
          AND f.OPENAMOUNT   > 0
          AND f.AGINGDAYS   > 90
        GROUP BY d.COMPANYID, d.CUSTOMERNUMBER, d.HOLDFLAG
        HAVING SUM(f.OPENAMOUNT) > 10000
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
        A 10%+ drop in DIMARDETAILS row count is a strong pipeline failure signal.
        Even a 5% drop in invoice count means a significant portion of AR is missing
        from all dashboards. Threshold of 10% catches failures while tolerating normal
        period-end invoice closures.
```

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# dq/FACTARDETAILS.yml
# ═══════════════════════════════════════════════════════════════════════════
# Business purpose: Monitor the Invoice Measures table — where every financial
# KPI lives. Amount errors here propagate directly to Exec KPI dashboards,
# Finance period-end reports, and reserve provisioning. These rules catch
# the data failures that cause Finance to restate numbers.
kind: dq
name: FACTARDETAILS_dq
depends_on: JDE_PRODUCTION.RL_JDE.FACTARDETAILS

profiles:
  - OPENAMOUNT
  - CURRENTRESERVE
  - FORECASTRESERVE30
  - CHANGEINRESERVE
  - AGINGDAYS

rules:

  # ── Completeness ─────────────────────────────────────────────────────────

  - missing_count(FISCALPERIODID) = 0:
      name: fiscal_period_required_for_all_invoices
      dimension: completeness
      description: >
        FISCALPERIODID is the primary time key for all period-based trend metrics
        (OPEN_AR_TREND, RESERVE_ACCURACY_TREND). A null FISCALPERIODID = this invoice
        is excluded from every time-series KPI. Zero tolerance.

  # ── Uniqueness ────────────────────────────────────────────────────────────

  - duplicate_count(COMPANYID, DOCUMENTCOMPANY, DOCNO, DOCTYPE, PAYITM) = 0:
      name: fact_invoice_grain_unique
      dimension: uniqueness
      description: >
        Duplicate fact rows double-count OPENAMOUNT, CURRENTRESERVE, and all other
        measures — a direct financial misstatement. Zero tolerance.

  # ── Validity: Amount Sanity ───────────────────────────────────────────────

  - failed rows:
      name: every_invoice_has_nonzero_gross_amount
      dimension: completeness
      fail query: |
        SELECT COMPANYID, DOCNO, DOCTYPE, PAYITM, OPENAMOUNT, GROSSAMOUNT
        FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS
        WHERE GROSSAMOUNT IS NULL OR GROSSAMOUNT <= 0
      samples limit: 20
      description: >
        Every loaded invoice row should carry a positive gross amount (GROSSAMOUNT > 0).
        Null or zero gross indicates missing measure population.

  - failed rows:
      name: open_amount_must_not_be_negative_without_reason
      dimension: validity
      fail query: |
        SELECT COMPANYID, DOCNO, DOCTYPE, PAYITM,
               OPENAMOUNT, GROSSAMOUNT, AGINGDAYS
        FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS
        WHERE OPENAMOUNT < -1
          AND GROSSAMOUNT > 0
      samples limit: 10
      description: >
        OPENAMOUNT < 0 on an invoice with positive GROSSAMOUNT indicates a JDE
        decimal encoding or sign error. Negative open amounts subtract from total
        AR exposure, making the portfolio look healthier than it actually is.
        Allow -1 tolerance for rounding; flag anything more negative.

  - failed rows:
      name: aging_days_must_be_non_negative
      dimension: validity
      fail query: |
        SELECT COMPANYID, DOCNO, AGINGDAYS, DUEDATE, AGEASOFDATE
        FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS
        WHERE AGINGDAYS < -730
      samples limit: 10
      description: >
        AGINGDAYS represents days past due. Allow up to -730 (invoices dated
        2 years in the future — valid for long-term contracts). More negative
        than -730 = JDE date conversion error (Julian-to-Gregorian failure).

  # ── Accuracy: Reserve & Forecast Monitoring ──────────────────────────────

  - failed rows:
      name: reserve_change_exceeds_forecast_threshold
      dimension: accuracy
      fail query: |
        SELECT
            COMPANYID, DOCNO, DOCTYPE, PAYITM,
            FISCALPERIODID,
            CHANGEINRESERVE,
            FORECASTRESERVE30,
            ROUND(ABS(CHANGEINRESERVE) / NULLIF(FORECASTRESERVE30, 0) * 100, 1)
                AS reserve_change_pct,
            OPENAMOUNT
        FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS
        WHERE FORECASTRESERVE30 > 0
          AND ABS(CHANGEINRESERVE) / FORECASTRESERVE30 > 0.20
          AND OPENAMOUNT > 1000
        ORDER BY ABS(CHANGEINRESERVE) DESC
      samples limit: 20
      description: >
        Leakage Signal L7: Reserve changed by >20% vs 30-day forecast.
        Each row here is a reserve mis-estimation event — Finance needs to
        investigate whether the reserve model is responding correctly to collection
        events. Systematic L7 signals indicate the reserve model needs recalibration.
        [Threshold: 20% — pending Analytics sign-off]

  - anomaly detection for sum(OPENAMOUNT):
      name: total_open_ar_anomaly
      dimension: accuracy
      description: >
        Detects unusual movements in total open AR. A sudden 10%+ drop may indicate
        mass write-offs, data deletion, or a pipeline gap. A sudden spike may
        indicate duplicate invoice loading. Either event requires Finance review
        before period-end reporting.

  - anomaly detection for sum(CURRENTRESERVE):
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
        A 10%+ drop in FACTARDETAILS rows signals that invoice measures were not
        loaded for a portion of the portfolio — those invoices will show $0 open
        amount on dashboards (they will appear financially settled when they are not).
```

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# dq/FACTARCOLLECTION.yml
# ═══════════════════════════════════════════════════════════════════════════
# Business purpose: Monitor collection performance facts — the home of CEI,
# unapplied cash, and receipt volume. Data errors here translate directly to
# incorrect CEI reported to the Collections Manager and GM.
# "Our CEI is 87%" is only true if FACTARCOLLECTION is clean.
kind: dq
name: FACTARCOLLECTION_dq
depends_on: JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION

profiles:
  - TOTALRECEIPTS
  - CASHAPPLIED
  - COLLECTIONEFFICIENCY
  - FISCALPERIODID
  - LOB

rules:

  # ── Completeness ─────────────────────────────────────────────────────────

  - missing_count(FISCALPERIODID) = 0:
      name: fiscal_period_required_in_collection_facts
      dimension: completeness
      description: >
        FISCALPERIODID is the grain key and primary time dimension for CEI trend.
        Null FISCALPERIODID = this customer's collection performance is not included
        in any period-based KPI. Zero tolerance.

  - missing_count(LOB) = 0:
      name: lob_required_in_collection_facts
      dimension: completeness
      description: >
        LOB is the grain key for LOB-level CEI analysis and Exec KPI dashboard.
        Null LOB = this collection record is excluded from all LOB performance reports.
        Zero tolerance.

  # ── Uniqueness ────────────────────────────────────────────────────────────

  - duplicate_count(COMPANYID, CUSTOMERNUMBER, FISCALPERIODID, LOB) = 0:
      name: collection_grain_must_be_unique
      dimension: uniqueness
      description: >
        Duplicate grain rows double-count TOTALRECEIPTS and CASHAPPLIED in CEI.
        A CEI of 92% computed from duplicated data may actually be 84% — this is
        a material misstatement of the primary AR health KPI. Zero tolerance.

  # ── Validity: CEI and Cash Application ───────────────────────────────────

  - failed rows:
      name: cash_applied_cannot_exceed_total_receipts
      dimension: validity
      fail query: |
        SELECT
            COMPANYID, CUSTOMERNUMBER, FISCALPERIODID, LOB,
            TOTALRECEIPTS,
            CASHAPPLIED,
            ROUND(CASHAPPLIED - TOTALRECEIPTS, 2)     AS over_application_amount,
            ROUND(CASHAPPLIED / NULLIF(TOTALRECEIPTS, 0) * 100, 1) AS applied_pct
        FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
        WHERE CASHAPPLIED > TOTALRECEIPTS * 1.005
      samples limit: 20
      description: >
        CASHAPPLIED > TOTALRECEIPTS is a JDE misposting error — impossible in real
        operations. Each row directly inflates CEI for that customer × period × LOB.
        Root cause: duplicate receipt entry or cross-period posting mismatch.

  - failed rows:
      name: total_receipts_must_not_be_negative
      dimension: validity
      fail query: |
        SELECT COMPANYID, CUSTOMERNUMBER, FISCALPERIODID, LOB,
               TOTALRECEIPTS, CASHAPPLIED
        FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
        WHERE TOTALRECEIPTS < -0.01
      samples limit: 10
      description: >
        Negative TOTALRECEIPTS indicates a reversed receipt not offset by a
        correcting entry. This makes unapplied cash % appear artificially high
        and may cause CEI to exceed 1.0 for that customer-period.

  # ── Accuracy: Leakage Signal Monitoring ──────────────────────────────────

  - failed rows:
      name: unapplied_cash_above_leakage_threshold
      dimension: accuracy
      fail query: |
        SELECT
            COMPANYID,
            CUSTOMERNUMBER,
            FISCALPERIODID,
            LOB,
            TOTALRECEIPTS,
            CASHAPPLIED,
            TOTALRECEIPTS - CASHAPPLIED                                 AS unapplied_cash,
            ROUND((TOTALRECEIPTS - CASHAPPLIED) / NULLIF(TOTALRECEIPTS, 0) * 100, 1)
                                                                        AS unapplied_pct
        FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
        WHERE TOTALRECEIPTS > 0
          AND (TOTALRECEIPTS - CASHAPPLIED) / TOTALRECEIPTS > 0.20
        ORDER BY unapplied_cash DESC
      samples limit: 20
      description: >
        Leakage Signal L1: Customer × period × LOB rows where >20% of receipts
        are unapplied. Each row represents cash received that is not reducing open
        AR — a direct collection process failure. Collections team must investigate
        whether these are timing differences, mispostings, or disputed items.
        [Threshold: 20% — calibrate to your normal cash application cycle time]

  - anomaly detection for sum(TOTALRECEIPTS):
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
            FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
            WHERE FISCALPERIODID >= (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION) - 3
        ),
        current_period_lobs AS (
            SELECT DISTINCT LOB
            FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
            WHERE FISCALPERIODID = (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION)
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
        A 15%+ drop in FACTARCOLLECTION rows may signal that one or more companies
        or LOBs were not loaded for the current period. Collections Manager will
        see incomplete CEI data for that period without any visible error indicator.
```

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# dq/FACTDSO.yml
# ═══════════════════════════════════════════════════════════════════════════
kind: dq
name: FACTDSO_dq
depends_on: JDE_PRODUCTION.RL_JDE.FACTDSO

profiles:
  - DSO
  - TOTALGROSSINVOICED
  - CEI
  - COLLECTIONPRIORITY

rules:
  - anomaly detection for avg(DSO):
      name: dso_spike
      dimension: accuracy
  - anomaly detection for sum(TOTALGROSSINVOICED):
      name: gross_invoiced_spike
      dimension: accuracy
  - anomaly detection for avg(CEI):
      name: portfolio_cei_anomaly
      dimension: accuracy
```

---

### SLOs

| SLO Name | Table(s) | Threshold | Business Commitment |
|---|---|---|---|
| `ar_fact_dim_grain_integrity` | DIMARDETAILS + FACTARDETAILS | 0 orphan fact rows with OPENAMOUNT > 0 | No financial exposure is invisible in dashboards |
| `lob_coverage_99pct` | DIMARDETAILS | < 1% null LOB on open invoices | LOB-level CEI dashboards cover ≥99% of open AR |
| `dispute_co_population` | DIMARDETAILS | 0 partial dispute records | Dispute Resolution Rate KPI is accurate |
| `cash_application_sanity` | FACTARCOLLECTION | 0 rows CASHAPPLIED > TOTALRECEIPTS × 1.005 | CEI is not inflated by mispostings |
| `period_company_completeness` | FACTARCOLLECTION | 0 companies missing from current period | Period-end CEI report covers all legal entities |
| `payment_term_reference_coverage` | DIMARDETAILS + ARPAYMENTTERM | 0 open invoices with unmapped PAYMENTTERMCODE | Payment term compliance analysis covers 100% of open AR |
| `data_freshness` | All 6 RL_JDE external tables | INSERTDATE/MODIFYDATE ≤ 48h old | Daily dashboard consumers have same-day data |

### Coverage Gaps (address at build time)

- **HIGH — Reserve Threshold Calibration**: All `[Estimated threshold]` and `[Threshold: X]` values in DQ rules (1% null LOB, $5,000 open amount, $10,000 hold flag, 20% unapplied cash, 20% reserve change, CEI range 0-1.5) must be replaced with values derived from `vulcan evaluate` output after the first 30-day deployment baseline. Do NOT use these estimates for production alerts.
- **HIGH — Amount Reconciliation vs JDE Source**: No audit currently compares FACTARDETAILS.SUM(OPENAMOUNT) against `pl_jde.F03B11` source totals (DQ1 in design doc). This requires `pl_jde.*` to be accessible at Vulcan runtime. Work with Data Engineering to either: (a) expose a `pl_jde_control_totals` summary view, or (b) implement a prior-period snapshot comparison model.
- **MEDIUM — Workday Email Coverage**: Add `missing_percent(WORKDAYEMAIL) < 20` rule to `dq/DIMARDETAILS.yml` once the Workday reference table schema is confirmed. Currently excluded because the table name/schema is an open question.
- **LOW — FACTARCOLLECTION ↔ DIMARDETAILS Customer Referential Integrity**: Add a `failed rows` consistency check in `dq/FACTARCOLLECTION.yml` verifying every CUSTOMERNUMBER in FACTARCOLLECTION has at least one row in DIMARDETAILS. Deferred until both tables are confirmed stable post-deployment.
---

## 15.5 AI Context (for semantic layer)

### Semantic Model — DIMARDETAILS (Invoice Dimension)

```yaml
ai_context:
  instructions:
    - >
      Use this model when the question involves describing an invoice — who owns it,
      what status it is in, whether it is disputed, whether the customer is on credit hold,
      what LOB it belongs to, or what the latest collection comment says.
    - >
      One row = one invoice / pay-item. The grain key is COMPANYID + DOCUMENTCOMPANY +
      DOCNO + DOCTYPE + PAYITM. Group by COLLECTOR for performance attribution;
      group by LOB for line-of-business analysis.
    - >
      For financial amounts and aging numbers, JOIN to FACTARDETAILS on the same grain key.
      This model carries attributes only — not amounts.
  synonyms:
    - invoice details
    - AR dimension
    - invoice attributes
    - DIMARDETAILS
    - invoice master
  examples:
    - description: "Which customers have overdue invoices with no dispute?"
      format: sql
      query: |
        SELECT d.CUSTOMERNUMBER, d.COLLECTOR, COUNT(*) AS overdue_count
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
          ON d.COMPANYID = f.COMPANYID AND d.DOCNO = f.DOCNO
          AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        WHERE f.AGINGDAYS > 30
          AND d.DISPUTESTATUS IS NULL
        GROUP BY d.CUSTOMERNUMBER, d.COLLECTOR
        ORDER BY overdue_count DESC

    - description: "Which invoices are on credit hold with outstanding balance?"
      format: sql
      query: |
        SELECT d.CUSTOMERNUMBER, d.COMPANYID, d.DOCNO, d.HOLDFLAG, f.OPENAMOUNT
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
          ON d.COMPANYID = f.COMPANYID AND d.DOCNO = f.DOCNO
          AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        WHERE d.HOLDFLAG = 'Y'
          AND f.OPENAMOUNT > 0

    - description: "Show open disputes by LOB and resolver"
      format: sql
      query: |
        SELECT d.LOB, d.RESOLVERNAME, COUNT(*) AS open_dispute_count,
               SUM(f.OPENAMOUNT) AS total_disputed_amount
        FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
        JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
          ON d.COMPANYID = f.COMPANYID AND d.DOCNO = f.DOCNO
          AND d.DOCTYPE = f.DOCTYPE AND d.PAYITM = f.PAYITM
        WHERE d.DISPUTESTATUS = 'Open'
        GROUP BY d.LOB, d.RESOLVERNAME
        ORDER BY total_disputed_amount DESC
```

### Dimensions — DIMARDETAILS

- **CUSTOMERNUMBER**:
  - `synonyms`: ["customer", "customer ID", "account number", "customer no"]
- **COLLECTOR**:
  - `synonyms`: ["collections rep", "AR collector", "collections person"]
  - `caveats`: ["COLLECTOR is the individual responsible for chasing payment; COLLECTIONMANAGER is their manager — do not confuse the two when grouping for performance reports"]
- **LOB**:
  - `synonyms`: ["line of business", "business line", "division", "segment"]
  - `caveats`: ["LOB is derived from GLOFFSET via the DIMARCOLLECTIONLOB reference table — a null LOB means the GL Offset was unrecognised at load time; exclude these rows from LOB-level KPIs"]
- **DISPUTESTATUS**:
  - `synonyms`: ["dispute", "dispute flag", "dispute state"]
  - `caveats`: ["A null DISPUTESTATUS means the invoice has no recorded dispute — treat null as 'not disputed', not as unknown"]
- **HOLDFLAG**:
  - `synonyms`: ["credit hold", "hold", "on hold"]
  - `caveats`: ["Y = on credit hold, N = not on hold, null = unknown; filter to HOLDFLAG = 'Y' to identify credit hold exposure"]
- **DUEDATE**:
  - `synonyms`: ["payment due", "due", "payment deadline"]
  - `caveats`: ["DUEDATE is the contractual payment deadline; PROMISETOPAY is the customer-committed date — they differ for disputed/negotiated invoices"]
- **FISCALPERIODID**:
  - `synonyms`: ["fiscal period", "period", "accounting period", "month"]
  - `caveats`: ["FISCALPERIODID is an integer key computed as ((Century * 100 + Year) * 100) + Month. Do not sum or average this field — use it for filtering and grouping only. Example: 20260800 = August 2026"]

---

### Semantic Model — FACTARDETAILS (Invoice Measures)

```yaml
ai_context:
  instructions:
    - >
      Use this model for questions about invoice amounts, reserves, forecasts, and aging.
      One row = one invoice / pay-item. This is where all financial KPIs live.
    - >
      For leakage detection, the key signals are: CHANGEINRESERVE (sudden reserve
      movements), FORECASTRESERVE30/60/90 (future exposure), and RESERVECASHAPPLIED
      (whether reserve cash has been utilised).
    - >
      JOIN to DIMARDETAILS on COMPANYID + DOCNO + DOCTYPE + PAYITM for collector,
      customer, LOB, and dispute attributes.
  synonyms:
    - AR facts
    - invoice measures
    - FACTARDETAILS
    - invoice financials
    - AR amounts
  examples:
    - description: "Show reserve vs forecast gap by LOB for this period"
      format: sql
      query: |
        SELECT d.LOB,
               SUM(f.CURRENTRESERVE) AS total_reserve,
               SUM(f.FORECASTRESERVE30) AS total_forecast_30,
               SUM(f.CURRENTRESERVE - f.FORECASTRESERVE30) AS reserve_vs_forecast_gap
        FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
        JOIN JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
          ON f.COMPANYID = d.COMPANYID AND f.DOCNO = d.DOCNO
          AND f.DOCTYPE = d.DOCTYPE AND f.PAYITM = d.PAYITM
        GROUP BY d.LOB
        ORDER BY reserve_vs_forecast_gap DESC

    - description: "Which invoices have the highest change in reserve (top leakage risk)?"
      format: sql
      query: |
        SELECT f.COMPANYID, f.DOCNO, f.CHANGEINRESERVE, f.FORECASTRESERVE30,
               d.CUSTOMERNUMBER, d.COLLECTOR,
               ABS(f.CHANGEINRESERVE) / NULLIF(f.FORECASTRESERVE30, 0) AS reserve_change_ratio
        FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
        JOIN JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
          ON f.COMPANYID = d.COMPANYID AND f.DOCNO = d.DOCNO
          AND f.DOCTYPE = d.DOCTYPE AND f.PAYITM = d.PAYITM
        WHERE f.FORECASTRESERVE30 > 0
          AND ABS(f.CHANGEINRESERVE) / f.FORECASTRESERVE30 > 0.20
        ORDER BY reserve_change_ratio DESC
        LIMIT 50
```

### Measures — FACTARDETAILS

- **OPEN_AMOUNT**:
  - `synonyms`: ["open balance", "outstanding", "AR balance", "amount due", "receivable"]
  - `behavior`: flow — accumulates per period
  - `caveats`: ["OPENAMOUNT is the current outstanding amount as of AGEASOFDATE — it changes as payments are received and adjustments are posted"]
- **CURRENT_RESERVE**:
  - `synonyms`: ["reserve", "doubtful debt reserve", "bad debt reserve"]
  - `behavior`: stock — point-in-time value; do not sum across periods
  - `caveats`: ["CURRENTRESERVE is a point-in-time balance. Do not SUM across multiple fiscal periods — use the latest FISCALPERIODID snapshot"]
- **CHANGE_IN_RESERVE**:
  - `synonyms`: ["reserve movement", "reserve change", "delta reserve"]
  - `caveats`: ["A positive CHANGEINRESERVE means reserve increased (more doubtful debt provisioned). A negative value means reserve was released (improvement). This is the primary leakage signal L2"]
- **COLLECTION_EFFICIENCY** (in FACTARCOLLECTION):
  - `synonyms`: ["CEI", "collection efficiency index", "collection rate", "efficiency"]
  - `behavior`: ratio — numerator: CASHAPPLIED, denominator: (OPENAMOUNT + TOTALRECEIPTS)
  - `caveats`: ["CEI = CASHAPPLIED / (OPENAMOUNT + TOTALRECEIPTS). Do not average pre-computed CEI values across time periods — query CASHAPPLIED, OPENAMOUNT, and TOTALRECEIPTS separately and divide the sums"]
- **UNAPPLIED_CASH_PCT**:
  - `synonyms`: ["unapplied cash", "unapplied receipts", "cash not applied"]
  - `behavior`: ratio
  - `caveats`: ["Query numerator (TOTALRECEIPTS - CASHAPPLIED) and denominator (TOTALRECEIPTS) separately when grouping by time; averaging pre-computed percentages across periods is mathematically incorrect"]
- **RESERVE_ACCURACY_PCT**:
  - `synonyms`: ["reserve accuracy", "forecast accuracy", "reserve vs forecast"]
  - `behavior`: ratio
  - `caveats`: ["Reserve accuracy = 1 - ABS(CHANGEINRESERVE / FORECASTRESERVE30). Values close to 1.0 = accurate forecasting. Values significantly below 1.0 = reserve was mis-estimated. Do not sum this across invoices — it is an invoice-level ratio"]

---

### Semantic Model — FACTARCOLLECTION (Collection Facts)

```yaml
ai_context:
  instructions:
    - >
      Use this model for questions about collection performance — CEI, receipts, cash
      applied, and unapplied cash. One row = one customer × fiscal period × LOB.
    - >
      This is the primary model for answering "how are we collecting?" questions.
      For invoice-level detail or dispute context, JOIN to DIMARDETAILS.
    - >
      FISCALPERIODID is the time dimension — filter to a specific period for
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
               SUM(CASHAPPLIED) AS total_cash_applied,
               SUM(TOTALRECEIPTS) AS total_receipts,
               SUM(CASHAPPLIED) / NULLIF(SUM(TOTALRECEIPTS), 0) AS collection_efficiency
        FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
        WHERE FISCALPERIODID = (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION)
        GROUP BY LOB
        ORDER BY collection_efficiency ASC

    - description: "Who are the top 10 collectors by cash collected this quarter?"
      format: sql
      query: |
        SELECT d.COLLECTOR,
               SUM(c.CASHAPPLIED) AS total_cash_applied,
               SUM(c.TOTALRECEIPTS) AS total_receipts
        FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION c
        JOIN JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
          ON c.COMPANYID = d.COMPANYID AND c.CUSTOMERNUMBER = d.CUSTOMERNUMBER
        WHERE c.FISCALPERIODID >= (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION) - 2
        GROUP BY d.COLLECTOR
        ORDER BY total_cash_applied DESC
        LIMIT 10

    - description: "Show unapplied cash percentage by customer this month"
      format: sql
      query: |
        SELECT CUSTOMERNUMBER, LOB,
               TOTALRECEIPTS,
               CASHAPPLIED,
               TOTALRECEIPTS - CASHAPPLIED AS unapplied_cash,
               ROUND((TOTALRECEIPTS - CASHAPPLIED) / NULLIF(TOTALRECEIPTS, 0) * 100, 2) AS unapplied_pct
        FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
        WHERE FISCALPERIODID = (SELECT MAX(FISCALPERIODID) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION)
          AND TOTALRECEIPTS > 0
        ORDER BY unapplied_cash DESC
```

### Segments (for FACTARDETAILS and DIMARDETAILS)

```yaml
# On FACTARDETAILS semantic model:
segments:
  - name: high_leakage_risk
    expression: >
      {FACTARDETAILS.AGINGDAYS} > 30
      AND {FACTARDETAILS.RESERVECASHAPPLIED} = 0
      AND {FACTARDETAILS.CURRENTRESERVE} > 0
    description: >
      Invoices overdue >30 days with reserve held but no reserve cash applied —
      the highest-value leakage signal in the portfolio (Signal L6)
    ai_context:
      synonyms: ["at-risk invoices", "leakage risk", "write-off candidates"]

  - name: reserve_movement_alert
    expression: >
      ABS({FACTARDETAILS.CHANGEINRESERVE}) / NULLIF({FACTARDETAILS.FORECASTRESERVE30}, 0) > 0.20
    description: >
      Invoices where reserve changed by more than 20% vs 30-day forecast —
      signals potential reserve mis-estimation (Signal L7)

# On DIMARDETAILS semantic model:
segments:
  - name: credit_hold_with_open_balance
    expression: >
      {DIMARDETAILS.HOLDFLAG} = 'Y'
    description: Customers on credit hold — join to FACTARDETAILS to see open exposure (Signal L8)

  - name: overdue_no_dispute
    expression: "{DIMARDETAILS.DISPUTESTATUS} IS NULL"
    description: >
      Invoices with no active dispute — combine with AGINGDAYS > 30 in FACTARDETAILS
      for the "overdue without action" leakage signal (Signal L4)
```

---

## 15.6 Behavior (typed dimensions and measures)

### Dimensions

```yaml
# DIMARDETAILS semantic model
- COMPANYID:
    behavior:
      type: identifier
- DOCUMENTCOMPANY:
    behavior:
      type: identifier
- DOCNO:
    behavior:
      type: identifier
- DOCTYPE:
    behavior:
      type: identifier
- PAYITM:
    behavior:
      type: identifier
- CUSTOMERNUMBER:
    behavior:
      type: identifier
- PARENTCUSTOMER:
    behavior:
      type: identifier
- COLLECTOR:
    behavior:
      type: categorical
- COLLECTIONMANAGER:
    behavior:
      type: categorical
- SALESREP:
    behavior:
      type: categorical
- LOB:
    behavior:
      type: categorical
- BUSINESSUNIT:
    behavior:
      type: categorical
- PAYMENTTERMCODE:
    behavior:
      type: categorical
- DISPUTESTATUS:
    behavior:
      type: categorical
- DISPUTEREASONCODE:
    behavior:
      type: categorical
- RESOLVERCODE:
    behavior:
      type: categorical
- HOLDFLAG:
    behavior:
      type: categorical
- CURRENCYCODE:
    behavior:
      type: categorical
# FISCALPERIODID — integer key used as categorical time bucket, NOT summed
- FISCALPERIODID:
    behavior:
      type: categorical
```

### Measures

```yaml
# FACTARDETAILS measures
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
      time_dimension: FISCALPERIODID
      period_treatment: last
      period_grain: month

- FORECAST_RESERVE_30:
    behavior:
      type: stock
      time_dimension: FISCALPERIODID
      period_treatment: last
      period_grain: month

- FORECAST_RESERVE_60:
    behavior:
      type: stock
      time_dimension: FISCALPERIODID
      period_treatment: last
      period_grain: month

- FORECAST_RESERVE_90:
    behavior:
      type: stock
      time_dimension: FISCALPERIODID
      period_treatment: last
      period_grain: month

# FACTARCOLLECTION measures
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
    # SUM(CASHAPPLIED) / NULLIF(SUM(OPENAMOUNT) + SUM(TOTALRECEIPTS), 0)

- UNAPPLIED_CASH_PCT:
    behavior:
      type: ratio
      numerator: UNAPPLIED_CASH
      denominator: TOTAL_RECEIPTS
    # Fallback expression: (SUM(TOTALRECEIPTS) - SUM(CASHAPPLIED)) / NULLIF(SUM(TOTALRECEIPTS), 0)

- RESERVE_ACCURACY_PCT:
    behavior:
      type: ratio
      numerator: ABS_CHANGE_IN_RESERVE
      denominator: FORECAST_RESERVE_30
    # Fallback expression: 1 - ABS(SUM(CHANGEINRESERVE)) / NULLIF(SUM(FORECASTRESERVE30), 0)

- DISPUTE_RESOLUTION_RATE:
    behavior:
      type: ratio
      numerator: RESOLVED_DISPUTE_COUNT
      denominator: TOTAL_DISPUTE_COUNT
    # Helper measures (define as filtered count measures):
    # RESOLVED_DISPUTE_COUNT: count with filter DISPUTESTATUS = 'Resolved'
    # TOTAL_DISPUTE_COUNT: count with filter DISPUTESTATUS IS NOT NULL

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
    # OVERDUE_COUNT: count with filter AGINGDAYS > 30
    # OVERDUE_NO_DISPUTE_COUNT: count with filter AGINGDAYS > 30 AND DISPUTESTATUS IS NULL
```

---

## 16. Validation Checklist

- [x] Goal and consumers confirmed by stakeholder — extracted from design document, confirmed
- [x] Data sources verified accessible — RL_JDE tables confirmed existing by user; pl_jde sources documented
- [x] Grain explicitly defined (not UNKNOWN) — DIMARDETAILS/FACTARDETAILS: COMPANYID+DOCUMENTCOMPANY+DOCNO+DOCTYPE+PAYITM; FACTARCOLLECTION: COMPANYID+CUSTOMERNUMBER+FISCALPERIODID+LOB; **FACTDSO: COMPANYID+FISCALYEAR+FISCALMONTH+COLLECTIONPRIORITY**
- [x] Measures vs Metrics distinction clear — FACTDSO-native measures in Section 6; 14 primary metrics in Section 7 (proxy DSO/dispute recovery removed)
- [x] Entity relationships and joins documented — 8 joins documented in Section 4 (includes FACTDSO)
- [x] Measure/metric reasoning documented — Section 9 rationale chain complete (FACTDSO-native DSO, dispute recovery, prioritization)
- [x] Model architecture decided and documented — EXTERNAL (6 RL_JDE tables) + SEMANTIC + METRIC + DQ
- [x] All EXTERNAL models identified, ownership confirmed, and documented in Section 13 — 6 RL_JDE tables are EXTERNAL (owned by JDE pipeline)
- [x] All [Assumption] tags reviewed with stakeholder — assumptions listed in Section 11 including D2b resolved, D10–D11 updated
- [ ] Open questions resolved or documented as out-of-scope — FACTDSO refresh cadence, DISPUTERECOVERYRATIO wording in Section 12 — non-blocking for build
- [x] YAML contract parseable and complete — Section 14 complete
- [x] Quality rules reviewed and updated per stakeholder feedback (Section 15) — COLLECTIONPRIORITY collector rules, FACTDSO DSO/gross spike anomalies, GROSSAMOUNT > 0; consolidated CEI on FACTDSO
- [x] AI context drafted and confirmed (Section 15.5) — all 6 semantic models + key measures/dimensions covered
- [x] Semantic types (behavior) drafted and confirmed (Section 15.6) — all dimensions typed; all measures typed with stock/flow/ratio behavior
- [x] "Is it a right fit for me?" guidance documented in Section 1 and `usage.yml`
- [x] Ready for implementation → proceed to semantic artifact updates
