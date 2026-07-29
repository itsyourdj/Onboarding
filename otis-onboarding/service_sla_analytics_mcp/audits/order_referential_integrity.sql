-- Source: design spec > Section 15 Custom Audit Files (orphaned_order_contracts)
AUDIT (name assert_orphaned_order_contracts);
SELECT oo.ORDER_KEY
FROM analytics.gold_open_order_facts AS oo
LEFT JOIN "MDM_NAA_PROD"."MDM_OUTBOUND"."GLOBAL_CONTRACT_MASTER" AS ct
  ON oo.CONTRACT_ID = ct.CONTRACT_ID
WHERE oo.CONTRACT_ID IS NOT NULL
  AND ct.CONTRACT_ID IS NULL;
