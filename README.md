# Onboarding

Repository for OTIS onboarding data products and semantic assets, including cloud deployment bundles and local LDK workspaces.

## Repository Layout

- `otis-onboarding/` - deployable onboarding projects.
- `local-ldk/` - local development copies and experiments.

## Active Projects

- `otis-onboarding/customer_invoice_enhanced` - enhanced AR data product (models, semantics, audits, DQ, tests, deploy config).
- `otis-onboarding/customer_invoice_semantic` - semantic-focused AR variant.
- `otis-onboarding/semantic_views` - base semantic views.
- `otis-onboarding/semantic_views_enhanced` - semantic views with richer business/AI context.
- `otis-onboarding/service_sla_analytics_mcp` - SLA analytics data product with MCP-oriented semantic experience.
- `otis-onboarding/customer-health-app` - customer-facing app workspace.

## Typical Work In This Repo

- Maintain `inputs.yaml`, model SQL, semantics, metrics, audits, and DQ specs.
- Keep deploy artifacts (`deploy.yaml`, `config.yaml`, `usage.yml`) in sync with model behavior.
- Add/update unit tests in `tests/*.yml` with correct fully qualified input tables and source-column mappings.

## Testing Notes

- Unit tests for onboarding data products live under each project `tests/` directory.
- For `customer_invoice_enhanced`, tests should mock `JDE_PRODUCTION.STAGING.*` sources using raw JDE column names expected by model SQL.
- Keep expected outputs aligned with key normalization behavior used in model macros.

## Git Ignore Policy

- Root `.gitignore` contains centralized recursive rules for local runtime, cache, temp, secret, and build artifacts across all subdirectories.
- Project-level ignore files can still exist for project-specific exceptions, but duplicated common patterns are now handled at the root.
