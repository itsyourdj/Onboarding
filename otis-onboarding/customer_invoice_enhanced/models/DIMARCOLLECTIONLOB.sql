MODEL (
  name JDE_PRODUCTION.RL_JDE_VULCAN.DIMARCOLLECTIONLOB,
  kind INCREMENTAL_BY_UNIQUE_KEY (
    unique_key LOBKEY
  ),
  grains (LOBKEY),
  tags ('ACCOUNTS_RECEIVABLE', 'REFERENCE', 'LOB', 'GOLD'),
  column_descriptions (
    LOBKEY = 'Surrogate key for LOB mapping record.',
    COMPANYID = 'Company identifier.',
    LOBCODE = 'Line of business code.',
    LOBDESCRIPTION = 'Line of business description.',
    GLOFFSET = 'General ledger offset used for LOB derivation.',
    GLOBJECTACCOUNT = 'GL object account number when available.',
    REVENUECATEGORY = 'Derived revenue category from LOB description.',
    INSERTDATE = 'Row creation timestamp.',
    MODIFYDATE = 'Row modification timestamp.'
  ),
  column_tags (
    LOBKEY = ('GRAIN', 'PRIMARY_KEY'),
    COMPANYID = ('IDENTIFIER', 'JOIN_KEY'),
    LOBCODE = ('DIMENSION', 'LOB'),
    GLOFFSET = ('DIMENSION', 'JOIN_KEY'),
    GLOBJECTACCOUNT = ('DIMENSION', 'GL_ACCOUNT'),
    REVENUECATEGORY = ('DIMENSION', 'REPORTING_CATEGORY')
  ),
  assertions (
    not_null(columns := (LOBKEY, COMPANYID)),
    unique_values(columns := (LOBKEY))
  )
);

SELECT
  ABS(HASH(COALESCE(GACO, ''), COALESCE(GAID, ''))) AS LOBKEY,
  @normalize_key(GACO) AS COMPANYID,
  @normalize_key(GAID) AS LOBCODE,
  TRIM(GADL01) AS LOBDESCRIPTION,
  @normalize_key(GAID) AS GLOFFSET,
  @normalize_key(GAOBJ) AS GLOBJECTACCOUNT,
  CASE
    WHEN GADL01 ILIKE '%equipment%' THEN 'NEW EQUIPMENT'
    WHEN GADL01 ILIKE '%modernization%' THEN 'MODERNIZATION'
    WHEN GADL01 ILIKE '%service%' THEN 'SERVICE'
    WHEN GADL01 ILIKE '%repair%' THEN 'REPAIR'
    WHEN GADL01 ILIKE '%parts%' THEN 'PARTS'
    WHEN GADL01 ILIKE '%lease%' OR GADL01 ILIKE '%rental%' THEN 'LEASING & RENTAL'
    WHEN GADL01 ILIKE '%install%' THEN 'INSTALLATION'
    WHEN GADL01 ILIKE '%consult%' OR GADL01 ILIKE '%engineer%' THEN 'PROFESSIONAL SERVICES'
    WHEN GADL01 ILIKE '%digital%' OR GADL01 ILIKE '%subscription%' THEN 'DIGITAL & SUBSCRIPTION'
    WHEN GADL01 ILIKE '%government%' THEN 'GOVERNMENT'
    WHEN GADL01 ILIKE '%intercompany%' THEN 'INTERCOMPANY'
    ELSE 'OTHER REVENUE'
  END AS REVENUECATEGORY,
  CURRENT_TIMESTAMP() AS INSERTDATE,
  CURRENT_TIMESTAMP() AS MODIFYDATE
FROM STAGING.F0012;
