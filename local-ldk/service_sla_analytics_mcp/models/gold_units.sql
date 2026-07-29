-- Source: build follow-up (2026-07-29) — bridge/dimension model for many-to-many
-- resolution. Vulcan rejects many_to_many joins directly; per docs this must be
-- modeled through an intermediate join model with chained many_to_one joins.
-- One row per UNIT_ID lets callbacks, open_orders, unit_health_daily, and
-- contract_compliance all join here, indirectly connecting them to each other.
MODEL (
  name analytics.gold_units,
  kind FULL,
  grain UNIT_ID,
  tags ('gold', 'units', 'service', 'dimension', 'bridge'),
  terms ('service.unit'),
  description 'Golden unit/equipment dimension — one row per unit. Bridge model connecting callback, open-order, unit-health, and contract-compliance facts to each other via a shared dimension.',
  assertions (
    not_null(columns := (UNIT_ID)),
    unique_values(columns := (UNIT_ID))
  ),
  column_descriptions (
    UNIT_ID = 'Surrogate unit/equipment key',
    CONTRACT_ID = 'Service contract covering the unit',
    CUSTOMER_ID = 'Owning customer surrogate key',
    BUILDING_ID = 'Building the unit is installed in',
    GBO = 'Global business organization / branch grouping',
    PRODUCT_CLASS = 'Product class (elevator / escalator / ...)',
    PRODUCT_NAME = 'Product/model name',
    PRODUCT_SUBCLASS = 'Product subclass within the product class',
    UNIT_STATUS = 'Unit lifecycle status (active / removed / ...)',
    MACHINE_NUMBER = 'Equipment/machine number'
  )
);

SELECT DISTINCT
  UNIT_ID::VARCHAR AS UNIT_ID,
  CONTRACT_ID::VARCHAR AS CONTRACT_ID,
  CUSTOMER_ID::VARCHAR AS CUSTOMER_ID,
  BUILDING_ID::VARCHAR AS BUILDING_ID,
  GBO::VARCHAR AS GBO,
  PRODUCT_CLASS::VARCHAR AS PRODUCT_CLASS,
  PRODUCT_NAME::VARCHAR AS PRODUCT_NAME,
  PRODUCT_SUBCLASS::VARCHAR AS PRODUCT_SUBCLASS,
  UNIT_STATUS::VARCHAR AS UNIT_STATUS,
  MACHINE_NUMBER::VARCHAR AS MACHINE_NUMBER
FROM "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_UNIT_MASTER"
