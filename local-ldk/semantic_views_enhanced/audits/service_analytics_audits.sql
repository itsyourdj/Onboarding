
AUDIT (
  name otisoneoxp_empty
);
SELECT 1 AS empty_violation
WHERE (SELECT COUNT(*) FROM @this_model) = 0;


AUDIT (
  name otisoneoxp_duplicate_unit_snapshot
);
SELECT UNIT_ID, SNAPSHOT_DATE
FROM @this_model
GROUP BY UNIT_ID, SNAPSHOT_DATE
HAVING COUNT(*) > 1;


AUDIT (
  name otisoneoxp_health_score_in_range
);
SELECT *
FROM @this_model
WHERE HEALTH_SCORE IS NOT NULL
  AND (HEALTH_SCORE < 0 OR HEALTH_SCORE > 1);


-- ---------------------------------------------------------------------------
-- TBL_AR_OPENAR (grain: CONTRACT_ID, AR_MONTH)
-- ---------------------------------------------------------------------------
AUDIT (
  name ar_openar_empty
);
SELECT 1 AS empty_violation
WHERE (SELECT COUNT(*) FROM @this_model) = 0;


AUDIT (
  name ar_openar_duplicate_contract_month
);
SELECT CONTRACT_ID, AR_MONTH
FROM @this_model
GROUP BY CONTRACT_ID, AR_MONTH
HAVING COUNT(*) > 1;


-- ---------------------------------------------------------------------------
-- GLOBAL_CUSTOMER_MASTER (grain: CUSTOMER_ID)
-- ---------------------------------------------------------------------------
AUDIT (
  name customer_master_empty
);
SELECT 1 AS empty_violation
WHERE (SELECT COUNT(*) FROM @this_model) = 0;


AUDIT (
  name customer_master_duplicate_customer_id
);
SELECT CUSTOMER_ID
FROM @this_model
GROUP BY CUSTOMER_ID
HAVING COUNT(*) > 1;


-- ---------------------------------------------------------------------------
-- GLOBAL_UNIT_MASTER (grain: UNIT_ID)
-- ---------------------------------------------------------------------------
AUDIT (
  name unit_master_empty
);
SELECT 1 AS empty_violation
WHERE (SELECT COUNT(*) FROM @this_model) = 0;


AUDIT (
  name unit_master_duplicate_unit_id
);
SELECT UNIT_ID
FROM @this_model
GROUP BY UNIT_ID
HAVING COUNT(*) > 1;


AUDIT (
  name unit_master_health_score_in_range
);
SELECT *
FROM @this_model
WHERE CURRENT_HEALTH_SCORE IS NOT NULL
  AND (CURRENT_HEALTH_SCORE < 0 OR CURRENT_HEALTH_SCORE > 1);


-- ---------------------------------------------------------------------------
-- GLOBAL_CONTRACT_MASTER (grain: CONTRACT_ID)
-- ---------------------------------------------------------------------------
AUDIT (
  name contract_master_empty
);
SELECT 1 AS empty_violation
WHERE (SELECT COUNT(*) FROM @this_model) = 0;


AUDIT (
  name contract_master_duplicate_contract_id
);
SELECT CONTRACT_ID
FROM @this_model
GROUP BY CONTRACT_ID
HAVING COUNT(*) > 1;


-- ---------------------------------------------------------------------------
-- GLOBAL_BUILDING_MASTER (grain: BUILDING_ID)
-- ---------------------------------------------------------------------------
AUDIT (
  name building_master_empty
);
SELECT 1 AS empty_violation
WHERE (SELECT COUNT(*) FROM @this_model) = 0;


AUDIT (
  name building_master_duplicate_building_id
);
SELECT BUILDING_ID
FROM @this_model
GROUP BY BUILDING_ID
HAVING COUNT(*) > 1;


-- ---------------------------------------------------------------------------
-- QUALTRICS_RESPONSE (grain: RESPONSEID)
-- ---------------------------------------------------------------------------
AUDIT (
  name qualtrics_response_empty
);
SELECT 1 AS empty_violation
WHERE (SELECT COUNT(*) FROM @this_model) = 0;


AUDIT (
  name qualtrics_response_duplicate_responseid
);
SELECT RESPONSEID
FROM @this_model
GROUP BY RESPONSEID
HAVING COUNT(*) > 1;
