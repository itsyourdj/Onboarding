-- Source: build follow-up (2026-07-29) — bridge/dimension model for many-to-many
-- resolution. One row per CONTRACT_ID lets callbacks, open_orders, and
-- contract_compliance all join here on a simpler single-column key (vs. the
-- composite CONTRACT_ID+UNIT_ID key required for the contract_compliance join).
MODEL (
  name analytics.gold_contracts,
  kind FULL,
  grain CONTRACT_ID,
  tags ('gold', 'contracts', 'service', 'dimension', 'bridge'),
  terms ('service.contract'),
  description 'Golden service-contract dimension — one row per contract. Bridge model connecting callback, open-order, and contract-compliance facts to each other via a shared dimension.',
  assertions (
    not_null(columns := (CONTRACT_ID)),
    unique_values(columns := (CONTRACT_ID))
  ),
  column_descriptions (
    CONTRACT_ID = 'Surrogate service-contract key',
    CUSTOMER_ID = 'Customer holding the contract',
    BUILDING_ID = 'Building the contract covers',
    CONTRACTTYPE = 'Contract type (full-service / parts-only / ...)',
    SERVICETYPE = 'Service type code',
    CONTRACTSTATUS = 'Contract status code',
    ISACTIVE = 'Boolean active flag',
    GBO = 'Global business organization / branch grouping'
  )
);

SELECT DISTINCT
  CONTRACT_ID::VARCHAR AS CONTRACT_ID,
  CUSTOMER_ID::VARCHAR AS CUSTOMER_ID,
  BUILDING_ID::VARCHAR AS BUILDING_ID,
  CONTRACTTYPE::VARCHAR AS CONTRACTTYPE,
  SERVICETYPE::VARCHAR AS SERVICETYPE,
  CONTRACTSTATUS::VARCHAR AS CONTRACTSTATUS,
  ISACTIVE::BOOLEAN AS ISACTIVE,
  GBO::VARCHAR AS GBO
FROM "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_CONTRACT_MASTER"
