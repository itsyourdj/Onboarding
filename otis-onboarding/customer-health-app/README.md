# Customer Health Dashboard

A modern dashboard for Sales & Service to spot at-risk customers, understand *why* they're satisfied or unhappy, and act proactively. Supports both live Otis semantic APIs and local CSV/Postgres mode.

- **Frontend:** React + Vite + TypeScript, Tailwind, Recharts, React Query. Dark/light mode, Inter + Sora fonts.
- **Backend:** Node.js + Express + TypeScript. Computes health scores, ARR, CLV, tenure, equipment age.
- **Database:** PostgreSQL (CSVs are ingested locally).
- **Pluggable data source:** the backend reads through a `DataAdapter` (`SemanticLayerAdapter` for live DataOS, `PostgresAdapter` for local CSVs). API and UI remain unchanged across both modes.

## At a glance

Pulse helps teams move from reactive support to proactive customer risk management:

- **Overview:** portfolio health, at-risk counts, ARR exposure, trend signals.
- **Customers:** searchable/filterable accounts with health, NPS, service, and financial context.
- **Customer Detail:** deep drilldown into drivers, contracts, visits, feedback, AR, and open issues.
- **Satisfaction Insights:** promoter/detractor themes and detractor concentration analysis.

## Authentication and access (short)

- If the user is not logged in to DataOS, the app redirects to DataOS login/home.
- After login, app checks roles from platform tags.
- Users get **full access** when they have any one of:
  - `roles:id:tenant-admin`
  - `roles:id:app-user`
  - `roles:id:<tenant>-tenant-admin`
  - `roles:id:<tenant>-app-user`
- Other users can open `Overview`; restricted tabs show an **Access Denied** message with contact guidance (tenant admin or app owner).

## Architecture

```
CSVs ──► PostgreSQL (raw_* tables + typed v_* views)
            │
            ▼
      DataAdapter  ──►  SemanticLayerAdapter   (live DataOS endpoint)
            │           PostgresAdapter        (local/offline fallback)
            ▼
   Express API (health score, ARR/CLV, filters, insights)  ──►  /api/*
            │
            ▼
      React dashboard (Overview · Customers · Insights)
```

## Prerequisites

- Node.js 18+
- For semantic mode: valid `SEMANTIC_API_URL` + `SEMANTIC_API_TOKEN`
- For local CSV mode only: PostgreSQL running locally (database `customer_health`)

## Setup

### 1. Backend (semantic mode, recommended)

```bash
cd backend
npm install
cp .env.example .env        # set DATA_SOURCE=semantic + SEMANTIC_API_URL + SEMANTIC_API_TOKEN
npm run dev                 # API on http://localhost:4000
```

### 1b. Backend (optional CSV/Postgres mode)

```bash
cd backend
cp .env.example .env        # set DATA_SOURCE=postgres + PG* + DATA_DIR
npm run load                # ingest CSVs into Postgres + build typed views
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                 # app on http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173.

## Health score

Each customer gets a 0–100 score from seven weighted drivers (see `backend/src/services/health.ts`):

| Driver | Weight | Source |
|---|---|---|
| NPS score | 24% | `nps_surveys` |
| Missed visits / PM compliance | 15% | `mcp_compliance` |
| Service response & downtime | 15% | `callbacks` |
| Negative feedback | 10% | `nps_surveys` |
| Equipment health / age | 14% | `units`, `otis_one_unit_health` |
| AR / financial health | 12% | `ar_openar` |
| Contract renewal status | 10% | `contracts` |

Bands: **Healthy ≥ 70**, **Watch 55–69**, **At Risk < 55**.
Derived KPIs: **ARR** = gross monthly billing × 12; **CLV** = ARR × (tenure + health-weighted expected lifetime); tenure & equipment age from contract/install dates.

## Docker

Use Compose profiles:

```bash
# semantic mode (recommended)
docker compose --profile semantic up --build

# local CSV + Postgres mode
docker compose --profile postgres up --build
```

The Docker image does **not** hardcode semantic credentials. Provide
`SEMANTIC_API_URL` and `SEMANTIC_API_TOKEN` at runtime from your deployment
manifest (for example `container.yaml` envs/secret injection).

### Build and push for Linux (DataOS/K8s)

If you build from Apple Silicon (M1/M2/M3) without setting platform, you may
push an ARM-only image, which can fail on AMD64 clusters with
`ImagePullBackOff`.

Build and push an AMD64 image explicitly:

```bash
docker buildx build \
  --platform linux/amd64 \
  --no-cache \
  -t deepak2407/customer-health-app:0.0.5 \
  --push .
```

Verify architecture:

```bash
docker buildx imagetools inspect deepak2407/customer-health-app:0.0.5
```

Expected platform includes `linux/amd64`.

## DataOS deployment

1. Apply image-pull secret first (for private Docker Hub images):

```bash
ds2 rs apply -f docker_secrets.yaml
```

2. Set image tag in `container.yaml`:
   - `image: deepak2407/customer-health-app:0.0.5`

3. Ensure runtime envs are injected via `container.yaml` (or secret refs):
   - `SEMANTIC_API_URL`
   - `SEMANTIC_API_TOKEN`
   - `DATA_SOURCE=semantic`

4. Apply app:

```bash
ds2 rs apply -f container.yaml
```

### Troubleshooting `ImagePullBackOff`

- Tag not found: verify image/tag exists on Docker Hub.
- Wrong architecture: ensure image has `linux/amd64`.
- Secret mismatch: `imagePullSecret` in `container.yaml` must match secret name.
- Secret missing/invalid: re-apply `docker_secrets.yaml` with valid credentials/token.
- Private repo access denied: confirm Docker Hub user/token has pull access.

## Security hygiene

- Do not commit real credentials/tokens in `container.yaml`, `.env`, or
  `docker_secrets.yaml`.
- Keep local secrets in untracked files only; use platform secret injection for
  deployed environments.
- Rotate Docker Hub/DataOS tokens immediately if they were ever committed.

## Semantic mode notes

1. Set `DATA_SOURCE=semantic`, `SEMANTIC_API_URL`, and `SEMANTIC_API_TOKEN` in `backend/.env`.
2. Restart the backend.
3. Validate connectivity with:

```bash
cd backend
node --env-file=.env scripts/probe-semantic.mjs
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/overview` | Portfolio KPIs, distribution, segment/region roll-ups, top at-risk |
| `GET /api/customers` | Filterable, sortable customer list (`category`, `nps`, `region`, `gbo`, `segment`, `classification`, `search`, `sort`) |
| `GET /api/customers/:id` | Full customer profile: NPS trend, satisfaction history, visits, contracts, equipment, AR, open issues, feedback, notes |
| `GET /api/insights` | Sentiment/category mix, why satisfied/dissatisfied, common themes, detractor concentration |
| `GET /api/filters` | Available filter values |
```
