# Onboarding

This repository supports customer and partner onboarding with a business-focused semantic modeling workflow for OTIS service analytics.

## Current Business Scope

- Build and maintain OTIS service-domain semantic assets.
- Provide two aligned approaches:
  - `semantic_views`: core semantic layer for standardized reporting.
  - `semantic_views_enhanced`: enhanced semantic layer with richer AI context, business metadata, and trend-ready metric models.

## What We Are Implementing

- Business-specific table and column documentation in `inputs.yaml`.
- Selective `column_tags` and `column_terms` for meaningful governance metadata (customer, contract, unit, compliance, finance, ingestion, etc.).
- Semantic model enrichment with `ai_context` for measures and relevant dimensions to improve natural-language analytics usage.
- Metric-level `ai_context` with practical SQL/REST/GraphQL examples for business users.

## Local Development Hygiene

- Local runtime artifacts under `local-ldk` are environment-specific and are intentionally ignored from version control.
- Mac OS metadata files are also ignored.
