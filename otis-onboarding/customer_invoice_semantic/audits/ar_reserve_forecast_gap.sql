-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: Active open invoices with all three forecast buckets at zero indicate the
-- JDE reserve calculation process was NOT run for those invoices (DQ6). Finance cannot
-- provision for these invoices — they represent untracked credit risk on the balance sheet.
-- Run: vulcan audit --select ar_reserve_forecast_gap
AUDIT (name ar_reserve_forecast_gap, dialect snowflake);

SELECT
    CompanyId,
    DocNo,
    DocType,
    PayItm,
    OpenAmount,
    AgingDays,
    FiscalPeriodId,
    ForecastReserve30,
    ForecastReserve60,
    ForecastReserve90
FROM JDE_PRODUCTION.RL_JDE.FACTARDETAILS
WHERE OpenAmount         > 1000
  AND AgingDays          > 0
  AND ForecastReserve30  = 0
  AND ForecastReserve60  = 0
  AND ForecastReserve90  = 0
ORDER BY OpenAmount DESC;
