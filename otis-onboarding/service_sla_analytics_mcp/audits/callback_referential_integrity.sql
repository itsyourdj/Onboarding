-- Source: design spec > Section 15 Custom Audit Files (orphaned_callback_units)
AUDIT (name assert_orphaned_callback_units);
SELECT cb.CALLBACKID
FROM analytics.gold_callback_facts AS cb
LEFT JOIN "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_UNIT_MASTER" AS u
  ON cb.UNIT_ID = u.UNIT_ID
WHERE cb.UNIT_ID IS NOT NULL
  AND u.UNIT_ID IS NULL;
