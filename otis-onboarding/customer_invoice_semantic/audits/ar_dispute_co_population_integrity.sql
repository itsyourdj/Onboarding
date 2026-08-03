-- Source: design spec > Section 15 Custom Audit Files
-- BUSINESS IMPACT: Partial dispute records (one field populated, the other null) corrupt the
-- Dispute Resolution Rate KPI (DQ5). DisputeStatus = 'Open' with no DisputeReasonCode means
-- the dispute cannot be categorised in Dispute Tracking reports.
-- Root cause: JDE data entry error or incomplete dispute posting in F03B11.
-- Run: vulcan audit --select ar_dispute_co_population_integrity
AUDIT (name ar_dispute_co_population_integrity, dialect snowflake);

SELECT
    CompanyId,
    DocNo,
    DocType,
    PayItm,
    CustomerNumber,
    Collector,
    DisputeStatus,
    DisputeReasonCode,
    CASE
        WHEN DisputeStatus IS NOT NULL AND DisputeReasonCode IS NULL
            THEN 'Status set, ReasonCode missing — dispute cannot be categorised'
        WHEN DisputeStatus IS NULL AND DisputeReasonCode IS NOT NULL
            THEN 'ReasonCode set, Status missing — dispute cannot be tracked'
    END AS integrity_violation_description
FROM JDE_PRODUCTION.RL_JDE.DIMARDETAILS
WHERE (DisputeStatus IS NOT NULL AND DisputeReasonCode IS NULL)
   OR (DisputeStatus IS NULL     AND DisputeReasonCode IS NOT NULL);
