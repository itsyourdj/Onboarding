-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: A PaymentTermCode on an invoice that has no row in ARPaymentTerm means
-- NetDays is unknown for that invoice. Payment Term Compliance analysis (AgingDays > NetDays)
-- will silently exclude those invoices — they will never appear in "breaching payment terms"
-- reports even when genuinely overdue.
-- Root cause: New payment term added to JDE but not yet loaded to ARPaymentTerm.
-- Run: vulcan audit --select ar_payment_term_orphan
AUDIT (name ar_payment_term_orphan, dialect snowflake);

SELECT
    d.CompanyId,
    d.DocNo,
    d.DocType,
    d.PayItm,
    d.CustomerNumber,
    d.PaymentTermCode     AS unmapped_payment_term,
    f.AgingDays,
    f.OpenAmount
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.CompanyId       = f.CompanyId
    AND d.DocumentCompany = f.DocumentCompany
    AND d.DocNo           = f.DocNo
    AND d.DocType         = f.DocType
    AND d.PayItm          = f.PayItm
LEFT JOIN JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM pt
    ON d.PaymentTermCode  = pt.PaymentTermCode
WHERE d.PaymentTermCode IS NOT NULL
  AND pt.PaymentTermCode IS NULL
  AND f.OpenAmount        > 0;
