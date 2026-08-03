-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: A PAYMENTTERMCODE on an invoice that has no row in ARPAYMENTTERM means
-- NETDAYS is unknown for that invoice. Payment Term Compliance analysis (AGINGDAYS > NETDAYS)
-- will silently exclude those invoices — they will never appear in "breaching payment terms"
-- reports even when genuinely overdue.
-- Root cause: New payment term added to JDE but not yet loaded to ARPAYMENTTERM.
-- Run: vulcan audit --select ar_payment_term_orphan
AUDIT (name ar_payment_term_orphan, dialect snowflake);

SELECT
    d.COMPANYID,
    d.DOCNO,
    d.DOCTYPE,
    d.PAYITM,
    d.CUSTOMERNUMBER,
    d.PAYMENTTERMCODE     AS unmapped_payment_term,
    f.AGINGDAYS,
    f.OPENAMOUNT
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS d
JOIN JDE_PRODUCTION.RL_JDE.FACTARDETAILS f
    ON  d.COMPANYID       = f.COMPANYID
    AND d.DOCUMENTCOMPANY = f.DOCUMENTCOMPANY
    AND d.DOCNO           = f.DOCNO
    AND d.DOCTYPE         = f.DOCTYPE
    AND d.PAYITM          = f.PAYITM
LEFT JOIN JDE_PRODUCTION.RL_JDE.ARPAYMENTTERM pt
    ON d.PAYMENTTERMCODE  = pt.PAYMENTTERMCODE
WHERE d.PAYMENTTERMCODE IS NOT NULL
  AND pt.PAYMENTTERMCODE IS NULL
  AND f.OPENAMOUNT        > 0;
