-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: CASHAPPLIED > TOTALRECEIPTS is a JDE misposting error — mathematically
-- impossible in real operations. Each row directly inflates the CEI for that customer × period × LOB,
-- causing the KPI to show collection performance better than actuality.
-- Root cause: Duplicate receipts posted, reversed receipt not yet cleared, or cross-period posting
-- mismatch in F03B14.
-- Run: vulcan audit --select ar_cash_applied_exceeds_receipts
AUDIT (name ar_cash_applied_exceeds_receipts, dialect snowflake);

SELECT
    COMPANYID,
    CUSTOMERNUMBER,
    FISCALPERIODID,
    LOB,
    TOTALRECEIPTS,
    CASHAPPLIED,
    CASHAPPLIED - TOTALRECEIPTS                              AS over_application_amount,
    ROUND(CASHAPPLIED / NULLIF(TOTALRECEIPTS, 0) * 100, 2)  AS applied_pct
FROM JDE_PRODUCTION.RL_JDE_VULCAN.FACTARCOLLECTION
WHERE CASHAPPLIED > TOTALRECEIPTS * 1.005;
