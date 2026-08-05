-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: Prioritized invoices (COLLECTIONPRIORITY != 'NONE') that are way-overdue
-- (AGINGDAYS > 90) with no COLLECTOR assigned have no owner for follow-up.
-- Monitor-only tiers at 61–90 and 31–60 days are enforced via DQ rules.
-- Root cause: New invoice raised for a customer not yet assigned to a collector in F0101.
-- Run: vulcan audit --select ar_collector_unassigned_on_overdue
AUDIT (name ar_collector_unassigned_on_overdue, dialect snowflake);

SELECT
    d.COMPANYID,
    d.DOCNO,
    d.DOCTYPE,
    d.PAYITM,
    d.CUSTOMERNUMBER,
    d.LOB,
    d.DUEDATE,
    f.AGINGDAYS,
    f.OPENAMOUNT,
    d.DISPUTESTATUS
FROM JDE_PRODUCTION.RL_JDE_VULCAN.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE_VULCAN.FACTARDETAILS f
    ON  d.COMPANYID       = f.COMPANYID
    AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
    AND d.DOCNO           = f.DOCNO
    AND d.DOCTYPE         = f.DOCTYPE
    AND d.PAYITM          = f.PAYITM
WHERE (d.COLLECTOR IS NULL OR d.COLLECTOR = '')
  AND d.COLLECTIONPRIORITY IS NOT NULL AND d.COLLECTIONPRIORITY <> 'NONE'
  AND f.AGINGDAYS  > 90
  AND f.OPENAMOUNT > 0
ORDER BY f.OPENAMOUNT DESC;
