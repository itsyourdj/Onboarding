-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: If any company is missing from FactARCollection for the current fiscal period,
-- that company's entire collection performance is absent from the period-end CEI report and
-- Exec KPI dashboard (DQ4). Finance will produce an incomplete period-end AR summary.
-- Root cause: JDE collection pipeline failed for that company, or the period has not yet been
-- closed/processed for that entity.
-- Run: vulcan audit --select ar_period_all_companies_present
AUDIT (name ar_period_all_companies_present, dialect snowflake);

WITH companies_with_recent_history AS (
    SELECT DISTINCT CompanyId
    FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
    WHERE FiscalPeriodId >= (SELECT MAX(FiscalPeriodId) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION) - 3
),
latest_period_companies AS (
    SELECT DISTINCT CompanyId
    FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION
    WHERE FiscalPeriodId = (SELECT MAX(FiscalPeriodId) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION)
)
SELECT
    h.CompanyId                                                     AS missing_company,
    (SELECT MAX(FiscalPeriodId) FROM JDE_PRODUCTION.RL_JDE.FACTARCOLLECTION)
                                                                    AS current_period,
    'Company had collection data in recent periods but is absent in current period'
                                                                    AS impact_description
FROM companies_with_recent_history h
LEFT JOIN latest_period_companies l ON h.CompanyId = l.CompanyId
WHERE l.CompanyId IS NULL;
