# Onboarding

This repository supports customer and partner onboarding with a business-focused semantic modeling workflow for OTIS service analytics.

## Current Business Scope

- Build and maintain OTIS service-domain semantic assets.
- Provide aligned approaches for the same service-analytics domain:
  - `semantic_views`: core semantic layer for standardized reporting.
  - `semantic_views_enhanced`: enhanced semantic layer with richer AI context, business metadata, and trend-ready metric models.
  - `service_sla_analytics_mcp`: SLA-focused data product for elevator/escalator service callbacks — response-time and resolution-time trending, callback/incident volume and quality rates (trouble-callback, entrapment, out-of-service, first-time-fix), repair-job/open-order financial trending, equipment fault trending, and contract visit-compliance monitoring, exposed via an MCP-driven semantic model for natural-language analytics.

## What We Are Implementing

- Business-specific table and column documentation in `inputs.yaml`.
- Selective `column_tags` and `column_terms` for meaningful governance metadata (customer, contract, unit, compliance, finance, ingestion, etc.).
- Semantic model enrichment with `ai_context` for measures and relevant dimensions to improve natural-language analytics usage.
- Metric-level `ai_context` with practical SQL/REST/GraphQL examples for business users.
- True-timestamp precision for time-series metrics: trend metrics reference genuine `TIMESTAMP` columns (e.g. `CALLBACK_DATE_TIME`) as their `ts` field wherever the source data supports it, rather than date-only columns, enabling intraday as well as daily/monthly rollups. Applied to the callback-based trend metrics in `service_sla_analytics_mcp`, with a matching `daily_callback_volume_trend` metric added in `semantic_views_enhanced` for parity.

## Local Development Hygiene

- Local runtime artifacts under `local-ldk` are environment-specific and are intentionally ignored from version control.
- Mac OS metadata files are also ignored.
