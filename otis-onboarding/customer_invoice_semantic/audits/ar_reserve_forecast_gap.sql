-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: Active open invoices with all three forecast buckets at zero indicate the
-- JDE reserve calculation process was NOT run for those invoices (DQ6). Finance cannot
-- provision for these invoices — they represent untracked credit risk on the balance sheet.
-- Run: vulcan audit --select ar_reserve_forecast_gap
AUDIT (name ar_reserve_forecast_gap, dialect snowflake);

SELECT
    COMPANYID,
    DOCNO,
    DOCTYPE,
    PAYITM,
    OPENAMOUNT,
    AGINGDAYS,
    FISCALPERIODID,
    FORECASTRESERVE30,
    FORECASTRESERVE60,
    FORECASTRESERVE90
FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS
WHERE OPENAMOUNT         > 1000
  AND AGINGDAYS          > 0
  AND FORECASTRESERVE30  = 0
  AND FORECASTRESERVE60  = 0
  AND FORECASTRESERVE90  = 0
ORDER BY OPENAMOUNT DESC;
