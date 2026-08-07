-- Source: design spec > Section 13 Model Architecture (gold_open_order_facts)
MODEL (
  name analytics.gold_open_order_facts,
  kind FULL,
  grain WORK_ORDER_ID,
  tags ('gold', 'open_orders', 'service', 'fact'),
  terms ('service.open_order', 'metric.repair_job_financials'),
  description 'Open-order / repair-job grain fact joining raw repair-job financial facts to unit and contract dimensions',
  assertions (
    not_null(columns := (WORK_ORDER_ID, UNIT_ID)),
    unique_values(columns := (WORK_ORDER_ID))
    -- assert_orphaned_order_contracts intentionally NOT attached here as a blocking
    -- assertion: real data shows 145 orders referencing contracts not yet in the
    -- MDM golden-record CONTRACT_MASTER (coverage gap, not a bug). Monitored
    -- instead as a non-blocking DQ rule — see dq/gold_open_order_facts.yml.
  ),
  column_descriptions (
    WORK_ORDER_ID = 'Unique open-order / repair-job key',
    ORDER_DATE = 'Date the order was opened (cast to TIMESTAMP for metric ts use)',
    ORDER_STATUS = 'Order status (open / closed / ...)',
    ORDER_TYPE = 'Order type (repair / modernization / ...)',
    CONTRACT_ID = 'Contract the order relates to',
    UNIT_ID = 'Unit the order relates to',
    CUSTOMER_ID = 'Customer the order relates to',
    JOB_REVENUE = 'Revenue booked for the job',
    JOB_COST = 'Cost incurred for the job',
    JOB_MARGIN = 'Job margin (revenue minus cost)',
    MARGIN_PCT = 'Job margin as a percent of revenue',
    GBO = 'Global business organization / branch grouping',
    PRODUCT_CLASS = 'Product class of the unit (elevator/escalator/...)'
  )
);

SELECT
  oo.ORDER_KEY::VARCHAR AS WORK_ORDER_ID,
  oo.ORDER_DATE::TIMESTAMP AS ORDER_DATE,
  oo.ORDER_STATUS::VARCHAR AS ORDER_STATUS,
  oo.ORDER_TYPE::VARCHAR AS ORDER_TYPE,
  oo.CONTRACT_ID::VARCHAR AS CONTRACT_ID,
  oo.UNIT_ID::VARCHAR AS UNIT_ID,
  oo.CUSTOMER_ID::VARCHAR AS CUSTOMER_ID,
  oo.JOB_REVENUE::DECIMAL AS JOB_REVENUE,
  oo.JOB_COST::DECIMAL AS JOB_COST,
  oo.JOB_MARGIN::DECIMAL AS JOB_MARGIN,
  oo.MARGIN_PCT::DECIMAL AS MARGIN_PCT,
  oo.GBO::VARCHAR AS GBO,
  u.PRODUCT_CLASS::VARCHAR AS PRODUCT_CLASS
FROM "NAABO_PROD"."REPORTING"."OPORD_CNRCT_FCT" AS oo
LEFT JOIN "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_UNIT_MASTER" AS u
  ON oo.UNIT_ID = u.UNIT_ID
