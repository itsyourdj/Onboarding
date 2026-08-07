-- Source: design spec > Section 13 Model Architecture (gold_callback_facts)
-- UPDATED (2026-07-29): FLAT_CALLBACK_EVENT has 39 total columns; the initial
-- build only selected the 20 the discovery tool exposed. A live DESCRIBE TABLE
-- surfaced EMP_NUMBER ("bridge to TBL_MECHANIC", 97% match rate) resolving the
-- technician-join gap, plus real dispatch/arrival/close timestamps resolving
-- the "no SLA timestamp" coverage gap from the design spec (Section 12/15).
MODEL (
  name analytics.gold_callback_facts,
  kind FULL,
  grain CALLBACKID,
  tags ('gold', 'callbacks', 'service', 'fact'),
  terms ('service.callback', 'metric.callback_volume', 'metric.response_time', 'metric.resolution_time'),
  description 'Callback-event grain fact joining raw callback events to unit, contract, customer, and technician dimensions. Carries real dispatch/arrival/close timestamps for response-time and resolution-time SLA measures.',
  assertions (
    not_null(columns := (CALLBACKID, UNIT_ID)),
    unique_values(columns := (CALLBACKID)),
    accepted_values(column := TCB_FLAG, is_in := ('Y', 'N')),
    accepted_values(column := FTFR_FLAG, is_in := ('Y', 'N')),
    accepted_values(column := OUT_OF_SERVICE_FLAG, is_in := ('Y', 'N')),
    accepted_values(column := TRAPPED_PASSENGER_FLAG, is_in := ('Y', 'N'))
    -- assert_orphaned_callback_units intentionally NOT attached here as a blocking
    -- assertion: real data shows 13k+ callbacks referencing units not yet in the
    -- MDM golden-record UNIT_MASTER (historical/legacy coverage gap, not a bug).
    -- Monitored instead as a non-blocking DQ rule — see dq/gold_callback_facts.yml.
  ),
  column_descriptions (
    CALLBACKID = 'Unique callback event identifier',
    CALLBACK_DATE = 'Calendar date of the callback (cast to TIMESTAMP for metric ts use)',
    CALLBACK_DATE_TIME = 'Timestamp the callback was logged',
    CALLBACK_TYPE = 'Reconciled callback type',
    CONTRACT_ID = 'Contract associated with the callback',
    CUSTOMER_ID = 'Customer associated with the callback',
    UNIT_ID = 'Unit that generated the callback',
    TCB_FLAG = 'Trouble-callback flag (Y/N)',
    TRAPPED_PASSENGER_FLAG = 'Entrapment / trapped-passenger flag (Y/N)',
    OUT_OF_SERVICE_FLAG = 'Unit-out-of-service flag (Y/N)',
    FTFR_FLAG = 'First-time-fix-resolved flag (Y/N)',
    GBO = 'Global business organization / branch grouping',
    PRODUCT_CLASS = 'Product class of the unit (elevator/escalator/...)',
    REGION_DESC = 'Sales region description',
    SALES_SEGMENT = 'Sales segment',
    CUSTOMER_CLASSIFICATION = 'Customer classification code',
    EMP_NUMBER = 'Attending mechanic employee number (bridge to technicians)',
    TECHNICIAN_ID = 'Attending technician surrogate key (via EMP_NUMBER bridge, ~97% match rate)',
    DISPATCHED_AT = 'Dispatch timestamp for this callback',
    ARRIVED_AT = 'On-site arrival timestamp',
    CLOSED_AT = 'Callback close timestamp',
    RESPONSE_TIME_MINUTES = 'Minutes between dispatch and on-site arrival — real SLA response-time measure',
    RESOLUTION_TIME_MINUTES = 'Minutes between dispatch and callback close — real SLA resolution-time measure'
  )
);

SELECT
  cb.CALLBACKID::VARCHAR AS CALLBACKID,
  cb.CALLBACK_DATE::TIMESTAMP AS CALLBACK_DATE,
  cb.CALLBACK_DATE_TIME::TIMESTAMP AS CALLBACK_DATE_TIME,
  cb.CALLBACK_TYPE::VARCHAR AS CALLBACK_TYPE,
  cb.CONTRACT_ID::VARCHAR AS CONTRACT_ID,
  cb.CUSTOMER_ID::VARCHAR AS CUSTOMER_ID,
  cb.UNIT_ID::VARCHAR AS UNIT_ID,
  cb.TCB_FLAG::VARCHAR AS TCB_FLAG,
  cb.TRAPPED_PASSENGER_FLAG::VARCHAR AS TRAPPED_PASSENGER_FLAG,
  cb.OUT_OF_SERVICE_FLAG::VARCHAR AS OUT_OF_SERVICE_FLAG,
  cb.FTFR_FLAG::VARCHAR AS FTFR_FLAG,
  cb.GBO::VARCHAR AS GBO,
  u.PRODUCT_CLASS::VARCHAR AS PRODUCT_CLASS,
  c.REGION_DESC::VARCHAR AS REGION_DESC,
  c.SALES_SEGMENT::VARCHAR AS SALES_SEGMENT,
  c.CUSTOMER_CLASSIFICATION::VARCHAR AS CUSTOMER_CLASSIFICATION,
  cb.EMP_NUMBER::VARCHAR AS EMP_NUMBER,
  m.TECHNICIAN_ID::VARCHAR AS TECHNICIAN_ID,
  cb.NAA_DISPATCHED_DATE::TIMESTAMP AS DISPATCHED_AT,
  cb.ARRIVED_SITE::TIMESTAMP AS ARRIVED_AT,
  cb.CLOSED_ON::TIMESTAMP AS CLOSED_AT,
  DATEDIFF('minute', cb.NAA_DISPATCHED_DATE, cb.ARRIVED_SITE)::DECIMAL AS RESPONSE_TIME_MINUTES,
  DATEDIFF('minute', cb.NAA_DISPATCHED_DATE, cb.CLOSED_ON)::DECIMAL AS RESOLUTION_TIME_MINUTES
FROM "SSD_NAA_PROD"."RL_AMERICA"."FLAT_CALLBACK_EVENT" AS cb
LEFT JOIN "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_UNIT_MASTER" AS u
  ON cb.UNIT_ID = u.UNIT_ID
LEFT JOIN "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_CUSTOMER_MASTER" AS c
  ON cb.CUSTOMER_ID = c.CUSTOMER_ID
LEFT JOIN "NAABO_PROD"."REPORTING"."TBL_MECHANIC" AS m
  ON cb.EMP_NUMBER = m.EMP_NUMBER
