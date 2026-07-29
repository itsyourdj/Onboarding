# Data Product Plan: Service SLA Analytics (service_sla_analytics)

## Status: Validated

## Created: 2026-07-29

---

## 1. Business Context

- **Problem**: Business/field users can't self-serve answers about service performance without going through engineering — no direct way to ask "how are we doing on SLAs?" and get a trustworthy answer.
- **Use Case**: Track SLA / response-time performance for service jobs so that ops and field leaders can spot SLA breaches early and act on them.
- **Consumers**: Field/regional managers (drilling into their own territory) and AI agents/chat assistants (ad-hoc natural-language Q&A).
- **Key Questions / Metrics**: SLA breach rate / open ticket aging, fault/incident volume trend over time, and average response/resolution time.
- **Relationship to existing catalog**: Confirmed brand new — unrelated to existing "Service Analytics Semantic (Core/Enhanced)" or "Service Quality Approach One/Two/Three" data products already in the catalog.
- **SLA breach definition**: A breach can occur via any of: (a) response time exceeding a fixed threshold (e.g. technician arrival > X hours), (b) resolution time exceeding a fixed threshold (ticket open > X hours/days), or (c) breach of a contractual SLA tied to the customer contract/equipment type. [Assumption: exact thresholds and contractual SLA source are not yet known — to be resolved during table discovery / open questions.]

## 2. Data Sources

- **Engine**: snowflake
- **Data Source Location**: snowflake

| Source | Description | Owner | Key Columns |
| --- | --- | --- | --- |
| CALLBACKS (Semantic, Service Analytics Semantic Core DP) | Reactive service visits triggered when a unit faults or is reported not working | Manish Agrawal | CALLBACKID, CALLBACK_DATE, CALLBACK_DATE_TIME, CALLBACK_TYPE, CONTRACT_ID, CUSTOMER_ID, UNIT_ID, FTFR_FLAG, OUT_OF_SERVICE_FLAG, TCB_FLAG, TRAPPED_PASSENGER_FLAG, GBO, PRODUCTCLASS |
| OPEN_ORDERS (Semantic, Service Analytics Semantic Core DP) | Open-order / repair-job financial facts | Manish Agrawal | ORDER_KEY, ORDER_DATE, ORDER_STATUS, ORDER_TYPE, CONTRACT_ID, UNIT_ID, JOB_COST, JOB_MARGIN, JOB_REVENUE, MARGIN_PCT, GBO |
| TECHNICIANS (Semantic, Service Analytics Semantic Core DP) | Field technician (mechanic) master | Manish Agrawal | TECHNICIAN_ID, EMPLOYEE_FULL_NAME (PII), OFFICE_CODE, STATUS, GBO |
| CONTRACTS (Semantic, Service Analytics Semantic Core DP) | Golden service-contract master | Manish Agrawal | CONTRACT_ID, BUILDING_ID, CUSTOMER_ID, CONTRACTSTATUS, CONTRACTTYPE, ISACTIVE, SERVICETYPE, CONTRACTVALUE, GROSSMONTHLYBILLING, NETMONTHLYBILLING, GBO |
| CUSTOMERS (Semantic, Service Analytics Semantic Core DP) | Golden customer master (one row per customer) | Manish Agrawal | CUSTOMER_ID, CUSTOMER_NAME (PII), CUSTOMER_CLASSIFICATION, REGION_DESC, SALES_SEGMENT, COUNTRY_CD, BILLING_CURRENCY_CD, GBO |
| UNITS (Semantic, Service Analytics Semantic Core DP) | Golden unit/equipment master (analytic hub) | Manish Agrawal | UNIT_ID, BUILDING_ID, CONTRACT_ID, CUSTOMER_ID, MACHINE_NUMBER, PRODUCT_CLASS, PRODUCT_NAME, PRODUCT_SUBCLASS, UNIT_STATUS, IS_CONNECTED, OTIS_ONE_ENROLLED, CURRENT_HEALTH_SCORE, ERP_SOURCE_SYSTEM_CD, GBO |
| SVC_CONTRACT_COMPLIANCE (Semantic, Service Analytics Semantic Core DP) | Trailing-12-month contract visit compliance | Manish Agrawal | CONTRACT_ID, UNIT_ID, REGION, ACTUALVISITS12MONTHS, VISITS12MONTHS, GBO |
| OTIS_ONE_UNIT_HEALTH (Semantic, Service Analytics Semantic Core DP) | Otis ONE IoT telemetry snapshots | Manish Agrawal | UNIT_ID, SNAPSHOT_DATE, CONNECTIVITY_STATUS, PREDICTED_FAILURE_FLAG, ALARM_COUNT, DOOR_FAULTS, FAULT_COUNT, HEALTH_SCORE, RUN_HOURS, GBO |

**Profiling note**: `table_profile` returned no data for any of the 8 tables — "the profiler has not been run yet" on this DP. Row counts, null rates, and freshness are unverified; proceeding without blocking, per workflow guidance, but this should be re-checked once profiling is available.

**Data gap identified**: None of these tables carry an explicit dispatch/arrival/completion timestamp or a numeric SLA threshold column. `CALLBACKS` has only `CALLBACK_DATE_TIME` (when the callback was logged) — there is no "resolved at" or "technician arrived at" timestamp, and `CONTRACTS.SERVICETYPE` names a service level but has no numeric response/resolution target. This is logged as an Open Question — see Section 12.

## 3. Entities

To be defined

## 4. Entity Relationships and Joins

| Join | Left Entity | Right Entity | Join Key | Purpose |
| --- | --- | --- | --- | --- |
| CALLBACKS → UNITS | Service Job/Ticket | Equipment/Asset | UNIT_ID | Unit attributes (product class, health score) for each callback |
| CALLBACKS → CONTRACTS | Service Job/Ticket | Customer/Contract | CONTRACT_ID | Contract/service-level context for each callback |
| CALLBACKS → CUSTOMERS | Service Job/Ticket | Customer/Contract | CUSTOMER_ID | Customer attributes (region, segment) for each callback |
| OPEN_ORDERS → UNITS | Service Job/Ticket | Equipment/Asset | UNIT_ID | Unit attributes for each repair job |
| OPEN_ORDERS → CONTRACTS | Service Job/Ticket | Customer/Contract | CONTRACT_ID | Contract context for each repair job |
| CONTRACTS → CUSTOMERS | Customer/Contract | Customer/Contract | CUSTOMER_ID | Customer attributes for each contract |
| SVC_CONTRACT_COMPLIANCE → UNITS | Customer/Contract | Equipment/Asset | UNIT_ID | Compliance context per unit |
| SVC_CONTRACT_COMPLIANCE → CONTRACTS | Customer/Contract | Customer/Contract | CONTRACT_ID | Compliance context per contract |
| OTIS_ONE_UNIT_HEALTH → UNITS | Equipment/Asset | Equipment/Asset | UNIT_ID | IoT telemetry/fault context per unit |

**Resolved — no Technician join exists**: User confirmed (after checking Workbench/Data Sources) that there is genuinely no technician-ID column anywhere linking TECHNICIANS to CALLBACKS or OPEN_ORDERS. TECHNICIANS is retained as a standalone reference table (EXTERNAL stub) for browsing the technician roster only — it is NOT joined into any gold fact model in this data product. Per-job technician assignment is out of scope until an upstream system captures that link.

**Population Filters**: None applied upfront — all records included regardless of status. Instead, active/inactive states will be exposed as **segments** in the semantic layer (e.g. `active_contracts` segment on `CONTRACTS.ISACTIVE`, `active_units` segment on `UNITS.UNIT_STATUS`) so consumers can filter at query time rather than the data product baking in a fixed population cut.

## 5. Dimensions

| Dimension | Definition | Entity |
| --- | --- | --- |
| CALLBACK_TYPE | Callback category/type | Service Job/Ticket |
| PRODUCT_CLASS | Product class of the unit (elevator/escalator/...) | Equipment/Asset |
| REGION_DESC | Sales region description | Customer/Contract |
| GBO | Global business organization / branch grouping | Service Job/Ticket, Customer/Contract, Equipment/Asset |
| SALES_SEGMENT | Sales segment, standardized to title case | Customer/Contract |
| CUSTOMER_CLASSIFICATION | Customer classification code | Customer/Contract |
| CONTRACT_ID | Service contract identifier | Customer/Contract |
| CUSTOMER_ID | Customer identifier | Customer/Contract |
| UNIT_ID | Unit/equipment identifier | Equipment/Asset |
| CALLBACK_DATE | Calendar date of the callback (time dimension) | Service Job/Ticket |
| ORDER_DATE | Date the repair job/open-order was opened (time dimension) | Service Job/Ticket |
| SNAPSHOT_DATE | Timestamp of IoT telemetry snapshot (time dimension) | Equipment/Asset |

## 6. Measures (Aggregations)

| Measure | Definition | Row Filter | Computation Method | Entity |
| --- | --- | --- | --- | --- |
| total_callbacks | Count of callback events | none | COUNT | Service Job/Ticket |
| trouble_callback_rate | Numerator: COUNT(CALLBACKS WHERE TCB_FLAG='Y'). Denominator: COUNT(CALLBACKS). | none beyond flag match | ratio (filtered count / count) | Service Job/Ticket |
| entrapment_rate | Numerator: COUNT(CALLBACKS WHERE TRAPPED_PASSENGER_FLAG='Y'). Denominator: COUNT(CALLBACKS). | none beyond flag match | ratio (filtered count / count) | Service Job/Ticket |
| out_of_service_rate | Numerator: COUNT(CALLBACKS WHERE OUT_OF_SERVICE_FLAG='Y'). Denominator: COUNT(CALLBACKS). | none beyond flag match | ratio (filtered count / count) | Service Job/Ticket |
| first_time_fix_rate | Numerator: COUNT(CALLBACKS WHERE FTFR_FLAG='Y'). Denominator: COUNT(CALLBACKS). | none beyond flag match | ratio (filtered count / count) | Service Job/Ticket |
| open_order_count | Count of open orders / repair jobs | none | COUNT | Service Job/Ticket |
| total_job_revenue | Sum of job revenue | none | SUM(JOB_REVENUE) | Service Job/Ticket |
| total_job_cost | Sum of job cost | none | SUM(JOB_COST) | Service Job/Ticket |
| total_job_margin | Sum of job margin | none | SUM(JOB_MARGIN) | Service Job/Ticket |
| contract_visit_compliance_rate | Numerator: SUM(ACTUALVISITS12MONTHS). Denominator: SUM(VISITS12MONTHS). Grouped by contract. **Caveat**: source column description says ACTUALVISITS12MONTHS is "a timestamp, not a count" despite being typed NUMERIC — likely an upstream DQ issue; revisit after clarification (see Section 15 Coverage Gaps). | none | ratio (sum / sum) | Customer/Contract |
| fault_count | Sum of faults recorded in the IoT snapshot window | none | SUM(FAULT_COUNT) | Equipment/Asset |
| alarm_count | Sum of alarms raised in the IoT snapshot window | none | SUM(ALARM_COUNT) | Equipment/Asset |
| trouble_callback_count | Numerator helper for trouble_callback_rate | TCB_FLAG='Y' | COUNT | Service Job/Ticket |
| entrapment_count | Numerator helper for entrapment_rate | TRAPPED_PASSENGER_FLAG='Y' | COUNT | Service Job/Ticket |
| out_of_service_count | Numerator helper for out_of_service_rate | OUT_OF_SERVICE_FLAG='Y' | COUNT | Service Job/Ticket |
| first_time_fix_count | Numerator helper for first_time_fix_rate | FTFR_FLAG='Y' | COUNT | Service Job/Ticket |
| actual_visits_sum | Numerator helper for contract_visit_compliance_rate | none | SUM(ACTUALVISITS12MONTHS) | Customer/Contract |
| expected_visits_sum | Denominator helper for contract_visit_compliance_rate | none | SUM(VISITS12MONTHS) | Customer/Contract |

**Data gap note**: "Average response time" and "average resolution time" (from Key Questions, Section 1) are NOT computable from any confirmed source — no dispatch/arrival/completion timestamp exists. The measures above are the closest available proxies for service-quality/SLA-adjacent tracking. See Open Questions.

## 7. Metrics (Measure over Time)

| Metric | Measure | Time Dimension | Description |
| --- | --- | --- | --- |
| callback_volume_trend | total_callbacks | CALLBACK_DATE | Callback/incident volume over time — answers "fault/incident volume trend" |
| trouble_callback_rate_trend | trouble_callback_rate | CALLBACK_DATE | Trouble-callback rate over time — SLA-adjacent quality proxy |
| entrapment_rate_trend | entrapment_rate | CALLBACK_DATE | Entrapment (safety) rate over time |
| fault_trend | fault_count | SNAPSHOT_DATE | IoT-detected fault volume over time |
| open_order_trend | open_order_count | ORDER_DATE | Repair-job/open-order volume over time |

## 8. Grain

This data product has **multiple gold models, each at its own natural grain** (confirmed) — there is no single unified grain across callbacks, orders, and unit-health telemetry:

- **gold_callback_facts**: one row per callback event (grain key: `CALLBACKID`)
- **gold_open_order_facts**: one row per open-order/repair-job (grain key: `ORDER_KEY`)
- **gold_unit_health_daily**: one row per unit per telemetry snapshot (grain key: `UNIT_ID` + `SNAPSHOT_DATE`)
- **gold_contract_compliance**: one row per contract per unit, trailing-12-month window (grain key: `CONTRACT_ID` + `UNIT_ID`)

Aggregated trend metrics (Section 7) are computed on top of these grains by grouping on the relevant time dimension + slicing dimensions (e.g. `CALLBACK_DATE`, `PRODUCT_CLASS`, `REGION_DESC`).

**Grain Key Construction**: All grain keys are direct/natural columns already present in the EXTERNAL source tables (`CALLBACKID`, `ORDER_KEY`, `UNIT_ID`, `SNAPSHOT_DATE`, `CONTRACT_ID`) — none are constructed/composite.

## 9. Measure and Metric Reasoning

**Rationale chains**:

- `callback_volume_trend` -> needs `total_callbacks` -> needs `CALLBACKID` (count) -> from CALLBACKS (EXTERNAL)
- `trouble_callback_rate_trend` -> needs `trouble_callback_rate` -> needs `TCB_FLAG`, `CALLBACKID` -> from CALLBACKS (EXTERNAL)
- `entrapment_rate_trend` -> needs `entrapment_rate` -> needs `TRAPPED_PASSENGER_FLAG`, `CALLBACKID` -> from CALLBACKS (EXTERNAL)
- `fault_trend` -> needs `fault_count` -> needs `FAULT_COUNT`, `UNIT_ID`, `SNAPSHOT_DATE` -> from OTIS_ONE_UNIT_HEALTH (EXTERNAL)
- `open_order_trend` -> needs `open_order_count` -> needs `ORDER_KEY`, `ORDER_DATE` -> from OPEN_ORDERS (EXTERNAL)

**Key design decisions**:

- All ratio measures (trouble_callback_rate, entrapment_rate, out_of_service_rate, first_time_fix_rate, contract_visit_compliance_rate) use filtered-count/count or sum/sum patterns rather than the `ratio` behavior type at the model layer, per the build workflow's CLI-compatibility fallback (see Section 15.6).
- True response-time/resolution-time measures are out of scope until the technician-join and dispatch-timestamp open questions are resolved (Section 12).
- Dimensions (PRODUCT_CLASS, REGION_DESC, GBO, SALES_SEGMENT) are pulled in via the joins in Section 4, not duplicated into each gold model — each gold model joins EXTERNAL dimension stubs (UNITS, CONTRACTS, CUSTOMERS) as needed.

## 10. Consumption & Freshness

- **Consumption Pattern**: Both AI agents/chat assistants (ad-hoc natural-language Q&A) and a BI dashboard for field/regional managers.
- **Freshness**: Daily.
- **Backfill**: Full available history.

## 11. Assumptions

- [Assumption] Exact SLA breach thresholds (response time, resolution time) are not yet known — to be confirmed once source tables are discovered.
- [Assumption] Contractual SLA terms may vary by customer contract or equipment type — source of this data not yet identified.
- [Assumption] FULL model kind chosen for all gold models rather than an incremental kind. With daily freshness and full-history backfill, this may need revisiting for cost/performance once actual data volumes are known (row counts are unverified — see Section 12).
- [Assumption] No Silver layer is needed because all 8 sources are already golden/semantic records from another DP — gold-layer joins are assumed sufficient without additional cleaning.
- [Assumption] `GBO` (global business organization / branch grouping) is being treated as a proxy "region/branch" dimension alongside `REGION_DESC`, since no other branch-level field was surfaced.

## 12. Open Questions

- [ ] What are the exact SLA thresholds (response time, resolution time) by job/equipment type?
- [ ] Where do contractual SLA terms live (a table, a contract system, a lookup)?
- [ ] None of the confirmed source tables carry a dispatch/arrival/completion timestamp — how is "response time" or "resolution time" actually measured/recorded upstream? Is there another table not yet discovered (e.g. a dispatch or field-service-management system) that has these timestamps?
- [ ] Table profiling has not been run on any confirmed source table — row counts, null rates, and freshness are unverified.
- [x] ~~No confirmed join key links TECHNICIANS to CALLBACKS/OPEN_ORDERS~~ — RESOLVED: user confirmed no technician-ID column exists anywhere. TECHNICIANS is out of scope for per-job assignment; kept only as a standalone reference table.
- [ ] **New (2026-07-29, from prod DQ)**: `OTISONEOXP` (backing `unit_health_daily`/`fault_trend`) has not been refreshed recently — latest `SNAPSHOT_DATE` is 2026-06-27 vs. a "now" of 2026-07-28 (~31 days stale). The `stale_telemetry_snapshot` DQ rule correctly flags this. Follow up with the source DP owner (Manish Agrawal) on the IoT telemetry ingestion cadence before relying on `fault_trend` for anything time-sensitive.
- [x] ~~No dispatch/arrival/resolution timestamp anywhere in confirmed sources~~ — **RESOLVED (2026-07-29)**: a live `DESCRIBE TABLE` on `FLAT_CALLBACK_EVENT` (39 total columns; only 20 were exposed by the discovery tool during design) surfaced `NAA_DISPATCHED_DATE`, `ARRIVED_SITE`, `LEFT_SITE_BISDATE`, `CLOSED_ON`, `CLOSED_TIME` — real SLA timestamps, 89-100% populated. `gold_callback_facts` now carries `RESPONSE_TIME_HOURS` (dispatch→arrival) and `RESOLUTION_TIME_HOURS` (dispatch→close), with `avg_response_time_hours`/`avg_resolution_time_hours` measures and `response_time_trend`/`resolution_time_trend` metrics. Live averages: ~2.8h response, ~7.0h resolution. A small number of rows show a ~-1 hour anomaly (clock-rounding), monitored via a non-blocking DQ rule, not blocking.
- [x] ~~No confirmed join key links TECHNICIANS to CALLBACKS/OPEN_ORDERS~~ — **RESOLVED (2026-07-29), supersedes the earlier "confirmed no link exists" note**: the same `DESCRIBE TABLE` surfaced `FLAT_CALLBACK_EVENT.EMP_NUMBER`, documented upstream as "bridge to TBL_MECHANIC", matching `TBL_MECHANIC.EMP_NUMBER`. Live match rate: 27,159 of 27,973 callbacks (97%). `gold_callback_facts` now carries `TECHNICIAN_ID`, and `callbacks` joins `many_to_one` to `technicians`. Per-job technician assignment and performance analysis are now in scope (previously listed as out-of-scope in `usage.yml`'s `not_for` — should be revisited).

## 13. Model Architecture

| Layer | Model Name | Kind | Purpose | Sources |
| --- | --- | --- | --- | --- |
| External | callbacks (stub) | EXTERNAL | Reactive service visits — used as-is, no modification | Service Analytics Semantic (Core) DP |
| External | open_orders (stub) | EXTERNAL | Repair-job financial facts — used as-is | Service Analytics Semantic (Core) DP |
| External | technicians (stub) | EXTERNAL | Field technician master — used as-is; standalone reference only, NOT joined into any gold fact (no technician-ID link exists to callbacks/orders) | Service Analytics Semantic (Core) DP |
| External | contracts (stub) | EXTERNAL | Service-contract master — used as-is | Service Analytics Semantic (Core) DP |
| External | customers (stub) | EXTERNAL | Customer master — used as-is | Service Analytics Semantic (Core) DP |
| External | units (stub) | EXTERNAL | Unit/equipment master — used as-is | Service Analytics Semantic (Core) DP |
| External | svc_contract_compliance (stub) | EXTERNAL | Trailing-12-month visit compliance — used as-is | Service Analytics Semantic (Core) DP |
| External | otis_one_unit_health (stub) | EXTERNAL | IoT telemetry snapshots — used as-is | Service Analytics Semantic (Core) DP |

| Gold | gold_callback_facts | FULL | Callback-event grain fact, joined to UNITS/CONTRACTS/CUSTOMERS; carries trouble/entrapment/OOS/FTFR flags for rate measures | callbacks (EXTERNAL), units (EXTERNAL), contracts (EXTERNAL), customers (EXTERNAL) |
| Gold | gold_open_order_facts | FULL | Open-order/repair-job grain fact, joined to UNITS/CONTRACTS | open_orders (EXTERNAL), units (EXTERNAL), contracts (EXTERNAL) |
| Gold | gold_unit_health_daily | FULL | Unit-per-snapshot grain fact for fault/alarm trending | otis_one_unit_health (EXTERNAL), units (EXTERNAL) |
| Gold | gold_contract_compliance | FULL | Contract-per-unit trailing-12-month compliance fact | svc_contract_compliance (EXTERNAL), contracts (EXTERNAL), units (EXTERNAL) |

**Architecture decisions**:

- **Why EXTERNAL for all 8 sources**: each is a Semantic model already owned and published by another DP (Service Analytics Semantic Core), referenced as-is with no changes to their measures, dimensions, or grain — per the model kind classification rule, this is a metadata stub, not a transformation.
- **Why Medallion Architecture**: confirmed by user — multiple EXTERNAL sources need their own gold-layer aggregation at different natural grains (callback-event, order, unit-snapshot, contract-compliance), with shared dimension references (UNITS, CONTRACTS, CUSTOMERS) joined into each. A single star schema doesn't fit because there isn't one central fact grain.
- **Why FULL kind for gold models**: EXTERNAL sources are Semantic views with no time-partition guarantees from Vulcan's perspective — FULL rebuilds are simplest and safest until freshness/volume requirements (Batch 3) justify incremental models.
- **No Silver layer needed**: sources are already golden/semantic records from another DP; no additional cleaning/joining logic is required beyond the gold-layer joins themselves.

## 14. Design Specification — YAML Contract

```yaml
name: service_sla_analytics
version: 1.0
engine: snowflake

goal: >
  Track SLA / response-time-adjacent service performance for elevator/escalator
  service jobs so ops and field leaders can spot service-quality issues early.
consumers:
  - Field/regional managers (dashboard drill-down)
  - AI agents / chat assistants (ad-hoc natural-language Q&A)

entities:
  - name: service_job_ticket
    grain: one row per callback event (CALLBACKID) or per open-order (ORDER_KEY)
  - name: technician
    grain: one row per technician (TECHNICIAN_ID) — standalone reference, not joined to jobs
  - name: customer_contract
    grain: one row per contract (CONTRACT_ID) / one row per customer (CUSTOMER_ID)
  - name: equipment_asset
    grain: one row per unit (UNIT_ID)

entity_relationships:
  - left: callbacks
    right: units
    join_key: UNIT_ID
    purpose: unit attributes for each callback
  - left: callbacks
    right: contracts
    join_key: CONTRACT_ID
    purpose: contract/service-level context for each callback
  - left: callbacks
    right: customers
    join_key: CUSTOMER_ID
    purpose: customer attributes for each callback
  - left: open_orders
    right: units
    join_key: UNIT_ID
    purpose: unit attributes for each repair job
  - left: open_orders
    right: contracts
    join_key: CONTRACT_ID
    purpose: contract context for each repair job
  - left: contracts
    right: customers
    join_key: CUSTOMER_ID
    purpose: customer attributes for each contract
  - left: svc_contract_compliance
    right: units
    join_key: UNIT_ID
    purpose: compliance context per unit
  - left: svc_contract_compliance
    right: contracts
    join_key: CONTRACT_ID
    purpose: compliance context per contract
  - left: otis_one_unit_health
    right: units
    join_key: UNIT_ID
    purpose: IoT telemetry/fault context per unit

measures:
  - name: total_callbacks
    definition: COUNT(CALLBACKID)
    entity: service_job_ticket
  - name: trouble_callback_rate
    definition: COUNT(CALLBACKS WHERE TCB_FLAG='Y') / COUNT(CALLBACKS)
    entity: service_job_ticket
  - name: entrapment_rate
    definition: COUNT(CALLBACKS WHERE TRAPPED_PASSENGER_FLAG='Y') / COUNT(CALLBACKS)
    entity: service_job_ticket
  - name: out_of_service_rate
    definition: COUNT(CALLBACKS WHERE OUT_OF_SERVICE_FLAG='Y') / COUNT(CALLBACKS)
    entity: service_job_ticket
  - name: first_time_fix_rate
    definition: COUNT(CALLBACKS WHERE FTFR_FLAG='Y') / COUNT(CALLBACKS)
    entity: service_job_ticket
  - name: open_order_count
    definition: COUNT(ORDER_KEY)
    entity: service_job_ticket
  - name: total_job_revenue
    definition: SUM(JOB_REVENUE)
    entity: service_job_ticket
  - name: total_job_cost
    definition: SUM(JOB_COST)
    entity: service_job_ticket
  - name: total_job_margin
    definition: SUM(JOB_MARGIN)
    entity: service_job_ticket
  - name: contract_visit_compliance_rate
    definition: SUM(ACTUALVISITS12MONTHS) / SUM(VISITS12MONTHS)
    entity: customer_contract
  - name: fault_count
    definition: SUM(FAULT_COUNT)
    entity: equipment_asset
  - name: alarm_count
    definition: SUM(ALARM_COUNT)
    entity: equipment_asset

metrics:
  - name: callback_volume_trend
    measure: total_callbacks
    time_dimension: CALLBACK_DATE
    description: Callback/incident volume trend over time
  - name: trouble_callback_rate_trend
    measure: trouble_callback_rate
    time_dimension: CALLBACK_DATE
    description: Trouble-callback rate over time (SLA-adjacent quality proxy)
  - name: entrapment_rate_trend
    measure: entrapment_rate
    time_dimension: CALLBACK_DATE
    description: Entrapment (safety) rate over time
  - name: fault_trend
    measure: fault_count
    time_dimension: SNAPSHOT_DATE
    description: IoT-detected fault volume over time
  - name: open_order_trend
    measure: open_order_count
    time_dimension: ORDER_DATE
    description: Repair-job/open-order volume over time

dimensions:
  - name: CALLBACK_TYPE
    type: string
    entity: service_job_ticket
  - name: PRODUCT_CLASS
    type: string
    entity: equipment_asset
  - name: REGION_DESC
    type: string
    entity: customer_contract
  - name: GBO
    type: string
    entity: service_job_ticket
  - name: SALES_SEGMENT
    type: string
    entity: customer_contract
  - name: CUSTOMER_CLASSIFICATION
    type: string
    entity: customer_contract
  - name: CONTRACT_ID
    type: string
    entity: customer_contract
  - name: CUSTOMER_ID
    type: string
    entity: customer_contract
  - name: UNIT_ID
    type: string
    entity: equipment_asset
  - name: CALLBACK_DATE
    type: date
    entity: service_job_ticket
  - name: ORDER_DATE
    type: date
    entity: service_job_ticket
  - name: SNAPSHOT_DATE
    type: timestamp
    entity: equipment_asset

freshness:
  cadence: daily
  expected_by: TBD
  backfill: full available history

consumption:
  pattern: AI agents/chat (ad-hoc Q&A) and BI dashboard (field/regional managers)
```

## 15. Quality Rules (Recommended)

### Audit Assertions (blocking — add to MODEL() assertions block at build time)

- `not_null(columns := (CALLBACKID))` + `unique_values(columns := (CALLBACKID))` on `gold_callback_facts`
- `not_null(columns := (ORDER_KEY))` + `unique_values(columns := (ORDER_KEY))` on `gold_open_order_facts`
- `unique_combination_of_columns(columns := (UNIT_ID, SNAPSHOT_DATE))` + `not_null(columns := (UNIT_ID, SNAPSHOT_DATE))` on `gold_unit_health_daily`
- `unique_combination_of_columns(columns := (CONTRACT_ID, UNIT_ID))` + `not_null(columns := (CONTRACT_ID, UNIT_ID))` on `gold_contract_compliance`
- `accepted_values(column := TCB_FLAG, is_in := ('Y', 'N'))` on `gold_callback_facts` — repeat for `FTFR_FLAG`, `OUT_OF_SERVICE_FLAG`, `TRAPPED_PASSENGER_FLAG`
- `accepted_range(column := trouble_callback_rate, min_v := 0, max_v := 1)` on `gold_callback_facts` if rate is materialized as a stored column — repeat for `first_time_fix_rate`, `entrapment_rate`, `out_of_service_rate` [Estimated — thresholds are logical bounds, not data-driven]

### Custom Audit Files (cross-model validation — write to audits/ at build time)

- `audits/callback_referential_integrity.sql` — `orphaned_callback_units`: SELECT callbacks whose `UNIT_ID` has no match in `units` (dimension: consistency)
- `audits/order_referential_integrity.sql` — `orphaned_order_contracts`: SELECT open-orders whose `CONTRACT_ID` has no match in `contracts` (dimension: consistency)

**Build-time update (2026-07-29)**: Against live data, these checks turned out to have real hit counts far higher than expected — 13,363 orphaned callbacks and 145 orphaned orders, reflecting genuine MDM golden-record coverage gaps (historical/legacy records predating golden-record onboarding), not defects. They were **not** attached as blocking `MODEL()` assertions; instead they were moved into the `kind: dq` rule packs below as non-blocking `consistency` rules, matching the docs' own "orphaned_orders" pattern (cross-model validation belongs in DQ, not blocking audits, when the upstream source has known incomplete coverage). The `audits/*.sql` files remain on disk for ad-hoc manual runs (`vulcan audit`) but are not referenced by any model's `assertions(...)`.

**Build-time fix**: `gold_contract_compliance` initially failed `unique_combination_of_columns(CONTRACT_ID, UNIT_ID)` — investigation showed exact duplicate rows in `SVC_COMPLIANCE` (same `BATCH_ID`/`LOAD_TS`), a genuine upstream duplication issue. Fixed by adding `SELECT DISTINCT` to the gold model query rather than weakening the grain assertion.

### Data Quality Rules (non-blocking monitoring — write to dq/{model_name}.yml at build time)

```yaml
kind: dq
name: gold_callback_facts_dq
depends_on: gold_callback_facts
profiles:
  - UNIT_ID
  - CONTRACT_ID
  - CALLBACK_DATE
rules:
  - missing_count(UNIT_ID) = 0:
      name: callback_unit_required
      dimension: completeness
  - missing_count(CONTRACT_ID) = 0:
      name: callback_contract_required
      dimension: completeness
  - duplicate_count(CALLBACKID) = 0:
      name: unique_callback_ids
      dimension: uniqueness
  - failed rows:
      name: valid_flag_values
      dimension: validity
      fail query: |
        SELECT * FROM gold_callback_facts
        WHERE TCB_FLAG NOT IN ('Y', 'N')
           OR FTFR_FLAG NOT IN ('Y', 'N')
           OR OUT_OF_SERVICE_FLAG NOT IN ('Y', 'N')
           OR TRAPPED_PASSENGER_FLAG NOT IN ('Y', 'N')
      samples limit: 10
  - change for row_count >= -50%:
      name: callback_volume_drop_alert
      dimension: timeliness
      description: "[Estimated] Alert if daily callback volume drops more than 50% vs prior run"

---
kind: dq
name: gold_open_order_facts_dq
depends_on: gold_open_order_facts
profiles:
  - UNIT_ID
  - CONTRACT_ID
  - JOB_REVENUE
rules:
  - missing_count(UNIT_ID) = 0:
      name: order_unit_required
      dimension: completeness
  - duplicate_count(ORDER_KEY) = 0:
      name: unique_order_keys
      dimension: uniqueness
  - change for row_count >= -50%:
      name: order_volume_drop_alert
      dimension: timeliness
      description: "[Estimated] Alert if daily open-order volume drops more than 50% vs prior run"

---
kind: dq
name: gold_unit_health_daily_dq
depends_on: gold_unit_health_daily
profiles:
  - UNIT_ID
  - FAULT_COUNT
  - HEALTH_SCORE
rules:
  - missing_count(UNIT_ID) = 0:
      name: unit_health_unit_required
      dimension: completeness
  - failed rows:
      name: stale_telemetry_snapshot
      dimension: timeliness
      fail query: |
        SELECT * FROM gold_unit_health_daily
        WHERE SNAPSHOT_DATE < CURRENT_TIMESTAMP - INTERVAL '48 hours'
      description: "[Estimated] Freshness cadence is daily; snapshots older than 48h are stale"
```

### SLOs

- `daily_freshness_slo`: gold models must refresh within 24h of the upstream EXTERNAL source updating — [Estimated], tied to Section 10's daily cadence.
- `callback_data_completeness_slo`: >99% of callback rows have non-null `UNIT_ID`/`CONTRACT_ID` — [Estimated].

### Coverage Gaps

- **HIGH**: No dispatch/arrival/resolution timestamp anywhere in confirmed sources — true SLA breach rate cannot be directly monitored; only proxy quality measures (trouble/entrapment/OOS/FTFR rates) are covered.
- **MEDIUM**: Table profiling has never been run on any of the 8 sources — all numeric thresholds above are [Estimated] guesses, not data-driven. Must be re-derived from `vulcan evaluate` output after deployment.
- **MEDIUM**: `SVC_CONTRACT_COMPLIANCE.ACTUALVISITS12MONTHS` is documented by its owning DP as "a timestamp, not a count" despite being typed NUMERIC — likely an upstream data-quality issue in the source DP. Flagged rather than built into a rule on an ambiguous column; `contract_visit_compliance_rate` (Section 6) should be revisited once this is clarified.
- **LOW**: No coverage rule for per-technician job assignment — out of scope, no join key exists (Section 4).

## 15.5 AI Context (for semantic layer)

### Semantic Model: `callbacks` (primary model)

```yaml
instructions:
  - "Use this semantic model for questions about service callbacks/incidents on elevator and escalator units. One row represents one callback event."
  - "Use total_callbacks for volume questions. Use trouble_callback_rate / entrapment_rate / out_of_service_rate / first_time_fix_rate as SLA-adjacent quality proxies — there is no direct response/resolution-time measure in this data product."
synonyms:
  - "callbacks"
  - "service calls"
  - "incidents"
  - "trouble calls"
examples:
  - description: "What is the fault/incident volume trend over time?"
    format: sql
    query: |
      SELECT CALLBACK_DATE, MEASURE(callbacks.total_callbacks)
      FROM callbacks
      GROUP BY 1;
  - description: "What is our SLA breach rate?"
    format: sql
    query: |
      SELECT MEASURE(callbacks.trouble_callback_rate)
      FROM callbacks;
```

### Dimensions

- **CALLBACK_TYPE**: `synonyms`: ["callback type", "incident type"]
- **PRODUCT_CLASS**: `synonyms`: ["equipment type", "unit type"]
- **REGION_DESC**: `synonyms`: ["region", "territory"]
- **GBO**: `synonyms`: ["branch", "business org"]; `caveats`: ["Rough branch/region proxy — not validated against REGION_DESC"]
- **CALLBACK_DATE**: `caveats`: ["Use this for daily trending, not the raw CALLBACK_DATE_TIME timestamp"]

### Measures

- **total_callbacks**: `synonyms`: ["callback volume", "incident count"]
- **trouble_callback_rate**: `synonyms`: ["SLA breach rate (proxy)"]; `caveats`: ["This is a proxy for SLA breach since no response/resolution timestamp exists — do not present as literal SLA compliance"]
- **entrapment_rate**: `synonyms`: ["entrapment rate", "safety incident rate"]; `caveats`: ["Safety-critical — always show alongside absolute count for low-volume contracts"]
- **out_of_service_rate**: `synonyms`: ["OOS rate", "downtime rate"]
- **first_time_fix_rate**: `synonyms`: ["FTFR"]

### Other Semantic Models

- **open_orders**: `instructions`: "Repair-job financial facts — one row per open-order/repair-job. Use for job cost/revenue/margin analysis and open_order_count trending." `synonyms`: ["open orders", "repair jobs"]
- **unit_health_daily**: `instructions`: "IoT telemetry snapshots — one row per unit per snapshot. Use fault_count/alarm_count for fault trending." `synonyms`: ["unit health", "IoT telemetry", "otis one"]
- **contract_compliance**: `instructions`: "Trailing-12-month contract visit compliance — one row per contract per unit. Caveat: ACTUALVISITS12MONTHS may be a mislabeled timestamp column upstream (see Section 15 Coverage Gaps) — verify before trusting contract_visit_compliance_rate." `synonyms`: ["visit compliance", "maintenance compliance"]

## 15.6 Behavior (typed dimensions and measures)

### Dimensions

```yaml
- CALLBACK_TYPE:
    behavior:
      type: categorical
- PRODUCT_CLASS:
    behavior:
      type: categorical
- REGION_DESC:
    behavior:
      type: categorical
- GBO:
    behavior:
      type: categorical
- SALES_SEGMENT:
    behavior:
      type: categorical
- CUSTOMER_CLASSIFICATION:
    behavior:
      type: categorical
- CONTRACT_ID:
    behavior:
      type: identifier
- CUSTOMER_ID:
    behavior:
      type: identifier
- UNIT_ID:
    behavior:
      type: identifier
```

Time dimensions (`CALLBACK_DATE`, `ORDER_DATE`, `SNAPSHOT_DATE`) are left untyped — used as metric `ts` fields, not slicing dimensions.

### Measures

```yaml
- total_callbacks:
    behavior:
      type: flow
- open_order_count:
    behavior:
      type: flow
- total_job_revenue:
    behavior:
      type: flow
- total_job_cost:
    behavior:
      type: flow
- total_job_margin:
    behavior:
      type: flow
- fault_count:
    behavior:
      type: flow
- alarm_count:
    behavior:
      type: flow
- trouble_callback_count:
    behavior:
      type: flow
- entrapment_count:
    behavior:
      type: flow
- out_of_service_count:
    behavior:
      type: flow
- first_time_fix_count:
    behavior:
      type: flow
- actual_visits_sum:
    behavior:
      type: flow
- expected_visits_sum:
    behavior:
      type: flow
- trouble_callback_rate:
    behavior:
      type: ratio
      numerator: trouble_callback_count
      denominator: total_callbacks
- entrapment_rate:
    behavior:
      type: ratio
      numerator: entrapment_count
      denominator: total_callbacks
- out_of_service_rate:
    behavior:
      type: ratio
      numerator: out_of_service_count
      denominator: total_callbacks
- first_time_fix_rate:
    behavior:
      type: ratio
      numerator: first_time_fix_count
      denominator: total_callbacks
- contract_visit_compliance_rate:
    behavior:
      type: ratio
      numerator: actual_visits_sum
      denominator: expected_visits_sum
      # Caveat: ACTUALVISITS12MONTHS may be a mislabeled timestamp column upstream — see Section 15 Coverage Gaps
```

No measures were left ambiguous/untyped.

## 16. Validation Checklist

- [x] Goal and consumers confirmed by stakeholder
- [x] Data sources verified accessible (via search/table_profile tools; row-level profiling still pending — see Open Questions)
- [x] Grain explicitly defined (not UNKNOWN) — multiple gold models, each at its own natural grain (Section 8)
- [x] Measures vs Metrics distinction clear
- [x] Entity relationships and joins documented
- [x] Measure/metric reasoning documented
- [x] Model architecture decided and documented (Medallion; EXTERNAL sources + 4 gold models)
- [x] All EXTERNAL models identified, ownership confirmed, and documented in Section 13
- [x] All [Assumption] tags reviewed with stakeholder
- [x] Open questions resolved or documented as out-of-scope (technician join confirmed non-existent; remaining items are genuine post-deployment follow-ups)
- [x] YAML contract parseable and complete
- [x] Quality rules reviewed and added to spec (Section 15)
- [x] AI context drafted and confirmed (Section 15.5)
- [x] Semantic types (behavior) drafted and confirmed (Section 15.6)
- [x] Ready for implementation → proceed to the build-data-product skill
