MODEL (
  name JDE_PRODUCTION.RL_JDE_VULCAN.ARPAYMENTTERM,
  kind INCREMENTAL_BY_UNIQUE_KEY (
    unique_key PAYMENTTERMKEY
  ),
  grains (PAYMENTTERMKEY),
  tags ('ACCOUNTS_RECEIVABLE', 'REFERENCE', 'PAYMENT_TERMS', 'GOLD'),
  column_descriptions (
    PAYMENTTERMKEY = 'Surrogate key for payment term.',
    COMPANYID = 'Company identifier.',
    PAYMENTTERMCODE = 'Payment term code.',
    DESCRIPTION = 'Payment term description.',
    NETDAYS = 'Net days allowed for payment.',
    DISCOUNTPERCENT = 'Early payment discount percent when available.',
    DISCOUNTDAYS = 'Number of days where discount applies.',
    INSERTDATE = 'Row creation timestamp.',
    MODIFYDATE = 'Row modification timestamp.'
  ),
  column_tags (
    PAYMENTTERMKEY = ('GRAIN', 'PRIMARY_KEY'),
    COMPANYID = ('IDENTIFIER', 'JOIN_KEY'),
    PAYMENTTERMCODE = ('DIMENSION', 'JOIN_KEY'),
    NETDAYS = ('DIMENSION', 'THRESHOLD'),
    DISCOUNTPERCENT = ('DIMENSION', 'DISCOUNT'),
    DISCOUNTDAYS = ('DIMENSION', 'DISCOUNT')
  ),
  assertions (
    not_null(columns := (PAYMENTTERMKEY, PAYMENTTERMCODE)),
    unique_values(columns := (PAYMENTTERMKEY))
  )
);

SELECT
  ABS(HASH(COALESCE(PTCOMP, ''), COALESCE(PTC, ''))) AS PAYMENTTERMKEY,
  @normalize_key(PTCOMP) AS COMPANYID,
  @normalize_key(PTC) AS PAYMENTTERMCODE,
  TRIM(PTDSC) AS DESCRIPTION,
  CAST(PTNDDY AS BIGINT) AS NETDAYS,
  CAST(PTDP AS DECIMAL(5, 2)) AS DISCOUNTPERCENT,
  CAST(PTDDDY AS BIGINT) AS DISCOUNTDAYS,
  CURRENT_TIMESTAMP() AS INSERTDATE,
  CURRENT_TIMESTAMP() AS MODIFYDATE
FROM STAGING.F0014;
