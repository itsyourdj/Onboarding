-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: A null or empty LOB on an invoice means that invoice is excluded from
-- ALL LOB-level CEI calculations, Exec KPI dashboards, and LOB performance reports (DQ3).
-- Root cause: GLOFFSET in F03B11 has no matching row in DIMARCOLLECTIONLOB.
-- Fix: Add the missing GLOFFSET to the DIMARCOLLECTIONLOB reference table.
-- Run: vulcan audit --select ar_lob_not_derivable
AUDIT (name ar_lob_not_derivable, dialect snowflake);

SELECT
    d.COMPANYID,
    d.DOCNO,
    d.DOCTYPE,
    d.PAYITM,
    d.GLOFFSET                 AS unmapped_gl_offset,
    f.OPENAMOUNT               AS open_amount_excluded_from_lob_reports
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.COMPANYID       = f.COMPANYID
    AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
    AND d.DOCNO           = f.DOCNO
    AND d.DOCTYPE         = f.DOCTYPE
    AND d.PAYITM          = f.PAYITM
WHERE (d.LOB IS NULL OR d.LOB = '')
  AND f.OPENAMOUNT > 0;
