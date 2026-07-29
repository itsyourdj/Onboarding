-- Source: design spec > Section 13 Model Architecture (gold_contract_compliance)
MODEL (
  name analytics.gold_contract_compliance,
  kind FULL,
  grains [CONTRACT_ID, UNIT_ID],
  tags ('gold', 'contract_compliance', 'service', 'fact'),
  terms ('service.contract_compliance', 'metric.visit_compliance'),
  description 'Contract-per-unit trailing-12-month visit compliance fact, joined to the contract dimension. CAVEAT: ACTUALVISITS12MONTHS may be a mislabeled timestamp column upstream — see data-product-plan.md Section 15 Coverage Gaps',
  assertions (
    not_null(columns := (CONTRACT_ID, UNIT_ID)),
    unique_combination_of_columns(columns := (CONTRACT_ID, UNIT_ID))
  ),
  column_descriptions (
    CONTRACT_ID = 'Contract governing the required visits',
    UNIT_ID = 'Unit the compliance row is for',
    CUSTOMER_ID = 'Owning customer for the unit/contract',
    REGION = 'Region the unit belongs to',
    ACTUALVISITS12MONTHS = 'Actual maintenance visits completed in the trailing 12 months (CAVEAT: source docs describe this as a timestamp, not a count)',
    VISITS12MONTHS = 'Contracted/required visits in the trailing 12 months',
    GBO = 'Global business organization / branch grouping',
    CONTRACTTYPE = 'Contract type (full-service / parts-only / ...)'
  )
);

SELECT DISTINCT
  sc.CONTRACT_ID::VARCHAR AS CONTRACT_ID,
  sc.UNIT_ID::VARCHAR AS UNIT_ID,
  sc.CUSTOMER_ID::VARCHAR AS CUSTOMER_ID,
  sc.REGION::VARCHAR AS REGION,
  sc.ACTUALVISITS12MONTHS::DECIMAL AS ACTUALVISITS12MONTHS,
  sc.VISITS12MONTHS::DECIMAL AS VISITS12MONTHS,
  sc.GBO::VARCHAR AS GBO,
  ct.CONTRACTTYPE::VARCHAR AS CONTRACTTYPE
FROM "NAABO_PROD"."REPORTING"."SVC_COMPLIANCE" AS sc
LEFT JOIN "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_CONTRACT_MASTER" AS ct
  ON sc.CONTRACT_ID = ct.CONTRACT_ID
