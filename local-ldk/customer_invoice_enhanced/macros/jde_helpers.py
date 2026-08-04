from vulcan import macro


@macro()
def jde_decimal(evaluator, amount_sql, scale=2):
    return f"({amount_sql}) / POW(10, {scale})"


@macro()
def safe_ratio(evaluator, numerator_sql, denominator_sql):
    return f"({numerator_sql}) / NULLIF(({denominator_sql}), 0)"


@macro()
def fiscal_period_id(evaluator, century_sql, year_sql, month_sql):
    return f"((({century_sql}) * 100 + ({year_sql})) * 100) + ({month_sql})"


@macro()
def normalize_key(evaluator, col_sql):
    return f"TRIM({col_sql})"


@macro()
def jde_to_date(evaluator, jde_sql):
    s = f"TRIM(CAST({jde_sql} AS VARCHAR))"
    return (
        "CASE "
        f"WHEN {jde_sql} IS NULL OR {s} = '' THEN NULL "
        # Standard date strings when present (e.g. YYYY-MM-DD / YYYYMMDD)
        f"WHEN TRY_TO_DATE({s}) IS NOT NULL THEN TRY_TO_DATE({s}) "
        # 7-digit Julian-like value already in YYYYDDD (e.g. 2025001)
        f"WHEN REGEXP_LIKE({s}, '^[0-9]{{7}}$') THEN "
        f"DATEADD(DAY, CAST(SUBSTR({s}, 5, 3) AS INT) - 1, TO_DATE(SUBSTR({s}, 1, 4) || '0101', 'YYYYMMDD')) "
        # 6-digit JDE CYYDDD -> convert to YYYYDDD semantics
        f"WHEN REGEXP_LIKE({s}, '^[0-9]{{6}}$') THEN "
        f"DATEADD(DAY, CAST(SUBSTR({s}, 4, 3) AS INT) - 1, TO_DATE(CAST(1900 + CAST(SUBSTR({s}, 1, 3) AS INT) AS VARCHAR) || '0101', 'YYYYMMDD')) "
        "ELSE NULL "
        "END"
    )


@macro()
def jde_fiscal_period_id(evaluator, date_sql):
    return (
        f"(YEAR({date_sql}) * 100) + MONTH({date_sql})"
    )
