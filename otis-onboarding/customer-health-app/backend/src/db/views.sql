-- Typed, clean views over the raw text tables. All casting happens here so the
-- rest of the app reads well-typed, conveniently-named columns.

CREATE OR REPLACE VIEW v_customers AS
SELECT
  customer_id,
  customer_name,
  customer_classification              AS classification,
  sales_segment,
  nsa_code,
  nsa_name,
  region_desc                          AS region,
  subregion_desc                       AS subregion,
  gbo,
  country_cd                           AS country,
  billing_currency_cd                  AS currency
FROM raw_customers;

CREATE OR REPLACE VIEW v_contracts AS
SELECT
  contract_id,
  customer_id,
  building_id,
  contracttype,
  contracttypedescription              AS contract_type_desc,
  servicepackagedesc                   AS service_package,
  servicetype,
  contractstatus                       AS status,
  isactive,
  NULLIF(contractstartdate,'')::date         AS start_date,
  NULLIF(originalcontractexpdate,'')::date   AS exp_date,
  NULLIF(renewaldate,'')::date               AS renewal_date,
  NULLIF(canceldate,'')::date                AS cancel_date,
  cancellationreason                   AS cancel_reason,
  NULLIF(contractvalue,'')::numeric          AS contract_value,
  NULLIF(grossmonthlybilling,'')::numeric    AS gross_monthly_billing,
  NULLIF(netmonthlybilling,'')::numeric      AS net_monthly_billing,
  renewalflag,
  currency_cd                          AS currency,
  salesrepname                         AS sales_rep,
  gbo
FROM raw_contracts;

CREATE OR REPLACE VIEW v_nps AS
SELECT
  surveyid,
  responseid,
  customer_id,
  contract_id,
  building_id,
  customer_name,
  gbo,
  NULLIF(response_date,'')::date             AS response_date,
  NULLIF(nps_score,'')::numeric              AS nps_score,
  nps_category,
  nps_verbatim,
  nps_driver_topics,
  nps_sentiment,
  NULLIF(nps_sentiment_score,'')::numeric    AS sentiment_score,
  risk_color,
  NULLIF(risk_score,'')::numeric             AS risk_score,
  NULLIF(satisfaction_rating,'')::numeric    AS satisfaction_rating,
  finished
FROM raw_nps_surveys;

CREATE OR REPLACE VIEW v_callbacks AS
SELECT
  callbackid,
  NULLIF(callback_date,'')::date             AS callback_date,
  NULLIF(callback_date_time,'')::timestamp   AS callback_ts,
  unit_id,
  contract_id,
  customer_id,
  building_id,
  building_name,
  bldg_city,
  callback_type,
  callbackcodename                     AS callback_code,
  component_description                AS component,
  tcb_flag,
  trapped_passenger_flag,
  out_of_service_flag,
  NULLIF(arrived_site,'')::timestamp         AS arrived_ts,
  NULLIF(left_site_bisdate,'')::timestamp    AS left_ts,
  NULLIF(closed_on,'')::timestamp            AS closed_ts,
  productclass                         AS product_class,
  gbo,
  additional_complaint,
  ftfr_flag
FROM raw_callbacks;

CREATE OR REPLACE VIEW v_mcp AS
SELECT
  region,
  subregion,
  gbo,
  office,
  buildingid                           AS building_id,
  unit_id,
  contract_id,
  customer_id,
  NULLIF(report_month,'')::date              AS report_month,
  NULLIF(scheduled_visits,'')::numeric       AS scheduled_visits,
  NULLIF(completed_visits,'')::numeric       AS completed_visits,
  NULLIF(missed_visits,'')::numeric          AS missed_visits,
  NULLIF(compliance_pct,'')::numeric         AS compliance_pct,
  NULLIF(last_visit_date,'')::date           AS last_visit_date,
  productclass                         AS product_class
FROM raw_mcp_compliance;

CREATE OR REPLACE VIEW v_ar AS
SELECT
  contract_id,
  customer_id,
  NULLIF(ar_month,'')::date                  AS ar_month,
  contractstatus                       AS status,
  region_desc                          AS region,
  gbo,
  NULLIF(grossmonthlybilling,'')::numeric    AS gross_monthly_billing,
  NULLIF(open_ar,'')::numeric                AS open_ar,
  NULLIF(ar_over_60_days,'')::numeric        AS ar_over_60,
  NULLIF(ar_over_90_days,'')::numeric        AS ar_over_90,
  NULLIF(ar_over_120_days,'')::numeric       AS ar_over_120,
  NULLIF(disputedamount,'')::numeric         AS disputed,
  delinquent
FROM raw_ar_openar;

CREATE OR REPLACE VIEW v_units AS
SELECT
  unit_id,
  building_id,
  customer_id,
  contract_id,
  product_class,
  product_subclass,
  product_name,
  NULLIF(installation_date,'')::date         AS installation_date,
  is_connected,
  otis_one_enrolled,
  NULLIF(current_health_score,'')::numeric   AS current_health_score,
  unit_status,
  gbo
FROM raw_units;

CREATE OR REPLACE VIEW v_orders AS
SELECT
  order_key,
  unit_id,
  contract_id,
  customer_id,
  order_type,
  order_status,
  NULLIF(order_date,'')::date                AS order_date,
  NULLIF(job_revenue,'')::numeric            AS job_revenue,
  NULLIF(job_cost,'')::numeric               AS job_cost,
  NULLIF(job_margin,'')::numeric             AS job_margin,
  NULLIF(margin_pct,'')::numeric             AS margin_pct,
  gbo
FROM raw_open_orders;

CREATE OR REPLACE VIEW v_unit_health AS
SELECT
  unit_id,
  customer_id,
  contract_id,
  NULLIF(snapshot_date,'')::date             AS snapshot_date,
  NULLIF(fault_count,'')::numeric            AS fault_count,
  NULLIF(alarm_count,'')::numeric            AS alarm_count,
  NULLIF(health_score,'')::numeric           AS health_score,
  predicted_failure_flag,
  connectivity_status
FROM raw_otis_one_unit_health;

CREATE OR REPLACE VIEW v_svc AS
SELECT
  unit_id,
  contract_id,
  customer_id,
  region,
  gbo,
  buildingname                         AS building_name,
  lastdoneprocedure                    AS last_procedure,
  NULLIF(actualvisits12months,'')::timestamp AS last_visit_ts,
  NULLIF(visits12months,'')::numeric         AS visits_12m
FROM raw_svc_contract_compliance;

CREATE OR REPLACE VIEW v_notes AS
SELECT
  uniqueid,
  customer_id,
  unit_id,
  contract_id,
  NULLIF(workcompletiondate,'')::date        AS work_date,
  messagenotes                         AS notes
FROM raw_mechanic_notes;

-- Indexes on join keys of the raw tables to keep the customer roll-up fast.
CREATE INDEX IF NOT EXISTS idx_contracts_cust ON raw_contracts (customer_id);
CREATE INDEX IF NOT EXISTS idx_nps_cust       ON raw_nps_surveys (customer_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_cust ON raw_callbacks (customer_id);
CREATE INDEX IF NOT EXISTS idx_mcp_cust        ON raw_mcp_compliance (customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_cust         ON raw_ar_openar (customer_id);
CREATE INDEX IF NOT EXISTS idx_units_cust      ON raw_units (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_cust     ON raw_open_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_uh_cust         ON raw_otis_one_unit_health (customer_id);
CREATE INDEX IF NOT EXISTS idx_svc_cust        ON raw_svc_contract_compliance (customer_id);
CREATE INDEX IF NOT EXISTS idx_notes_cust      ON raw_mechanic_notes (customer_id);
