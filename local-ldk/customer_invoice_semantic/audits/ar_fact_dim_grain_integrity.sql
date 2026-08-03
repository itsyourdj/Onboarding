-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: FactARDetails rows without a matching DimARDetails row are invisible
-- financial exposures. OpenAmount for those invoices cannot appear in any Collector,
-- LOB, or Dispute dashboard — they are hidden AR.
-- This is the most critical integrity check in the Customer Invoices data product.
-- Run: vulcan audit --select ar_fact_dim_grain_integrity
AUDIT (name ar_fact_dim_grain_integrity, dialect snowflake);

SELECT
    f.CompanyId,
    f.DocumentCompany,
    f.DocNo,
    f.DocType,
    f.PayItm,
    f.OpenAmount          AS orphan_open_amount,
    f.CurrentReserve      AS orphan_reserve,
    f.FiscalPeriodId
FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
LEFT JOIN JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
    ON  f.CompanyId       = d.CompanyId
    AND f.DocumentCompany = d.DocumentCompany
    AND f.DocNo           = d.DocNo
    AND f.DocType         = d.DocType
    AND f.PayItm          = d.PayItm
WHERE d.DocNo IS NULL
  AND f.OpenAmount > 0;
