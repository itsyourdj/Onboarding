-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: An overdue invoice (AGINGDAYS > 30) with no COLLECTOR assigned has no owner
-- for follow-up. It cannot appear in any COLLECTOR Performance report, and no email action trigger
-- will fire for it. This is a direct collection governance gap — unmanaged AR.
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
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.COMPANYID       = f.COMPANYID
    AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
    AND d.DOCNO           = f.DOCNO
    AND d.DOCTYPE         = f.DOCTYPE
    AND d.PAYITM          = f.PAYITM
WHERE (d.COLLECTOR IS NULL OR d.COLLECTOR = '')
  AND f.AGINGDAYS  > 30
  AND f.OPENAMOUNT > 0
ORDER BY f.OPENAMOUNT DESC;
