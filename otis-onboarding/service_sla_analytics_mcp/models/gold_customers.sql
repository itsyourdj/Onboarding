-- Source: build follow-up (2026-07-29) — bridge/dimension model for many-to-many
-- resolution. One row per CUSTOMER_ID lets callbacks, open_orders, unit_health_daily,
-- and contract_compliance all join here via a shared dimension.
MODEL (
  name analytics.gold_customers,
  kind FULL,
  grain CUSTOMER_ID,
  tags ('gold', 'customers', 'service', 'dimension', 'bridge'),
  terms ('service.customer'),
  description 'Golden customer dimension — one row per customer. Bridge model connecting callback, open-order, unit-health, and contract-compliance facts to each other via a shared dimension.',
  assertions (
    not_null(columns := (CUSTOMER_ID)),
    unique_values(columns := (CUSTOMER_ID))
  ),
  column_mask_expressions (
    customer_name = SHA1(CUSTOMER_NAME)
  ),
  column_descriptions (
    CUSTOMER_ID = 'Surrogate customer key',
    CUSTOMER_NAME = 'Customer legal name (PII)',
    CUSTOMER_CLASSIFICATION = 'Customer classification code',
    SALES_SEGMENT = 'Sales segment',
    REGION_DESC = 'Sales region description',
    GBO = 'Global business organization / branch grouping',
    COUNTRY_CD = '2-char country code',
    BILLING_CURRENCY_CD = 'ISO billing currency code'
  )
);

SELECT DISTINCT
  CUSTOMER_ID::VARCHAR AS CUSTOMER_ID,
  CUSTOMER_NAME::VARCHAR AS CUSTOMER_NAME,
  CUSTOMER_CLASSIFICATION::VARCHAR AS CUSTOMER_CLASSIFICATION,
  SALES_SEGMENT::VARCHAR AS SALES_SEGMENT,
  REGION_DESC::VARCHAR AS REGION_DESC,
  GBO::VARCHAR AS GBO,
  COUNTRY_CD::VARCHAR AS COUNTRY_CD,
  BILLING_CURRENCY_CD::VARCHAR AS BILLING_CURRENCY_CD
FROM "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_CUSTOMER_MASTER"
