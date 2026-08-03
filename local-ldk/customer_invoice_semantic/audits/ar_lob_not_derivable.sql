-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: A null or empty LOB on an invoice means that invoice is excluded from
-- ALL LOB-level CEI calculations, Exec KPI dashboards, and LOB performance reports (DQ3).
-- Root cause: GLOffset in F03B11 has no matching row in DimARCollectionLOB.
-- Fix: Add the missing GLOffset to the DimARCollectionLOB reference table.
-- Run: vulcan audit --select ar_lob_not_derivable
AUDIT (name ar_lob_not_derivable, dialect snowflake);

SELECT
    d.CompanyId,
    d.DocNo,
    d.DocType,
    d.PayItm,
    d.GLOffset                 AS unmapped_gl_offset,
    f.OpenAmount               AS open_amount_excluded_from_lob_reports
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.CompanyId       = f.CompanyId
    AND d.DocumentCompany = f.DocumentCompany
    AND d.DocNo           = f.DocNo
    AND d.DocType         = f.DocType
    AND d.PayItm          = f.PayItm
WHERE (d.LOB IS NULL OR d.LOB = '')
  AND f.OpenAmount > 0;
