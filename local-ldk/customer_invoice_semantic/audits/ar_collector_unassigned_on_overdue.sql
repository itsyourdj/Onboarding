-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: An overdue invoice (AgingDays > 30) with no Collector assigned has no owner
-- for follow-up. It cannot appear in any Collector Performance report, and no email action trigger
-- will fire for it. This is a direct collection governance gap — unmanaged AR.
-- Root cause: New invoice raised for a customer not yet assigned to a collector in F0101.
-- Run: vulcan audit --select ar_collector_unassigned_on_overdue
AUDIT (name ar_collector_unassigned_on_overdue, dialect snowflake);

SELECT
    d.CompanyId,
    d.DocNo,
    d.DocType,
    d.PayItm,
    d.CustomerNumber,
    d.LOB,
    d.DueDate,
    f.AgingDays,
    f.OpenAmount,
    d.DisputeStatus
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.CompanyId       = f.CompanyId
    AND d.DocumentCompany = f.DocumentCompany
    AND d.DocNo           = f.DocNo
    AND d.DocType         = f.DocType
    AND d.PayItm          = f.PayItm
WHERE (d.Collector IS NULL OR d.Collector = '')
  AND f.AgingDays  > 30
  AND f.OpenAmount > 0
ORDER BY f.OpenAmount DESC;
