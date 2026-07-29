-- Source: design spec > Section 13 Model Architecture (technicians — standalone reference)
MODEL (
  name analytics.gold_technicians,
  kind FULL,
  grain TECHNICIAN_ID,
  tags ('gold', 'technicians', 'service', 'reference'),
  terms ('service.technician'),
  description 'Field technician (mechanic) master — standalone reference table. NOT joined to any job/callback fact: no technician-to-job link exists in the available source tables (see data-product-plan.md Section 4 and Open Questions)',
  assertions (
    not_null(columns := (TECHNICIAN_ID)),
    unique_values(columns := (TECHNICIAN_ID))
  ),
  column_descriptions (
    TECHNICIAN_ID = 'Surrogate technician (mechanic) key',
    EMPLOYEE_FULL_NAME = 'Technician full name (PII)',
    OFFICE_CODE = 'Home office/branch code for the technician',
    GBO = 'Global business organization / branch grouping',
    STATUS = 'Employment/assignment status'
  )
);

SELECT
  TECHNICIAN_ID::VARCHAR AS TECHNICIAN_ID,
  EMPLOYEE_FULL_NAME::VARCHAR AS EMPLOYEE_FULL_NAME,
  OFFICE_CODE::VARCHAR AS OFFICE_CODE,
  GBO::VARCHAR AS GBO,
  STATUS::VARCHAR AS STATUS
FROM "NAABO_PROD"."REPORTING"."TBL_MECHANIC"
