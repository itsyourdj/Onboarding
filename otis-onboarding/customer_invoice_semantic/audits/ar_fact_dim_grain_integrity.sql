-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: FACTARDETAILS rows without a matching DIMARDETAILS row are invisible
-- financial exposures. OPENAMOUNT for those invoices cannot appear in any COLLECTOR,
-- LOB, or Dispute dashboard — they are hidden AR.
-- This is the most critical integrity check in the Customer Invoices data product.
-- Run: vulcan audit --select ar_fact_dim_grain_integrity
AUDIT (name ar_fact_dim_grain_integrity, dialect snowflake);

SELECT
    f.COMPANYID,
    f.DOCUMENTCOMPANY,
    f.DOCNO,
    f.DOCTYPE,
    f.PAYITM,
    f.OPENAMOUNT          AS orphan_open_amount,
    f.CURRENTRESERVE      AS orphan_reserve,
    f.FISCALPERIODID
FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
LEFT JOIN JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
    ON  f.COMPANYID       = d.COMPANYID
    AND f.DOCUMENTCOMPANY = d.DOCUMENTCOMPANY
    AND f.DOCNO           = d.DOCNO
    AND f.DOCTYPE         = d.DOCTYPE
    AND f.PAYITM          = d.PAYITM
WHERE d.DOCNO IS NULL
  AND f.OPENAMOUNT > 0;
