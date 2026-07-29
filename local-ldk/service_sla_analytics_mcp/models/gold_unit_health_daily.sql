-- Source: design spec > Section 13 Model Architecture (gold_unit_health_daily)
MODEL (
  name analytics.gold_unit_health_daily,
  kind FULL,
  grains [UNIT_ID, SNAPSHOT_DATE],
  tags ('gold', 'unit_health', 'service', 'fact', 'iot'),
  terms ('service.unit_health', 'metric.fault_trend'),
  description 'Unit-per-snapshot grain fact for IoT-detected fault/alarm trending, joined to the unit dimension',
  assertions (
    not_null(columns := (UNIT_ID, SNAPSHOT_DATE)),
    unique_combination_of_columns(columns := (UNIT_ID, SNAPSHOT_DATE))
  ),
  column_descriptions (
    UNIT_ID = 'Unit the telemetry snapshot is for',
    CONTRACT_ID = 'Service contract covering the unit',
    CUSTOMER_ID = 'Owning customer for the unit',
    SNAPSHOT_DATE = 'Timestamp of the telemetry snapshot',
    FAULT_COUNT = 'Total faults recorded in the snapshot period',
    DOOR_FAULTS = 'Door-related faults in the snapshot period',
    ALARM_COUNT = 'Alarms raised in the snapshot period',
    HEALTH_SCORE = 'Composite unit health score 0-1',
    RUN_HOURS = 'Unit run hours in the snapshot period',
    GBO = 'Global business organization / branch grouping',
    PRODUCT_CLASS = 'Product class of the unit (elevator/escalator/...)'
  )
);

SELECT
  h.UNIT_ID::VARCHAR AS UNIT_ID,
  h.CONTRACT_ID::VARCHAR AS CONTRACT_ID,
  h.CUSTOMER_ID::VARCHAR AS CUSTOMER_ID,
  h.SNAPSHOT_DATE::TIMESTAMP AS SNAPSHOT_DATE,
  h.FAULT_COUNT::DECIMAL AS FAULT_COUNT,
  h.DOOR_FAULTS::DECIMAL AS DOOR_FAULTS,
  h.ALARM_COUNT::DECIMAL AS ALARM_COUNT,
  h.HEALTH_SCORE::DECIMAL AS HEALTH_SCORE,
  h.RUN_HOURS::DECIMAL AS RUN_HOURS,
  h.GBO::VARCHAR AS GBO,
  u.PRODUCT_CLASS::VARCHAR AS PRODUCT_CLASS
FROM "NAABO_PROD"."REPORTING"."OTISONEOXP" AS h
LEFT JOIN "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_UNIT_MASTER" AS u
  ON h.UNIT_ID = u.UNIT_ID
