# Customer Health Dashboard

A modern dashboard for Sales & Service to spot at-risk customers, understand *why* they're satisfied or unhappy, and act proactively. Supports both live Otis semantic APIs and local CSV/Postgres mode.

- **Frontend:** React + Vite + TypeScript, Tailwind, Recharts, React Query. Dark/light mode, Inter + Sora fonts.
- **Backend:** Node.js + Express + TypeScript. Computes health scores, ARR, CLV, tenure, equipment age.
- **Database:** PostgreSQL (CSVs are ingested locally).
- **Pluggable data source:** the backend reads through a `DataAdapter` (`SemanticLayerAdapter` for live DataOS, `PostgresAdapter` for local CSVs). API and UI remain unchanged across both modes.

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
