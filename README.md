# CCC Event Registry

Internal contact directory + per-event guest/status tracker for CCC. Full
design rationale, data model, and open items live in [PLAN.md](./PLAN.md) —
this file is just "how do I run it."

Two independent apps, deployed as two separate Vercel projects:

```
backend/    Express + TypeScript + Prisma + Postgres — REST API
frontend/   React + Vite + TypeScript + Tailwind — talks to the API over fetch
```

## Local development

**Prerequisites:** Node 20+, Docker Desktop (for local Postgres).

```bash
# 1. Database
docker compose up -d          # starts Postgres on localhost:5433

# 2. Backend
cd backend
cp .env.example .env          # already points at the docker-compose DB
npm install
npm run prisma:migrate        # creates the schema
npm run seed:admin            # interactive — creates your first ADMIN account
npm run dev                   # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api to :4000
```

Open http://localhost:5173, sign in with the account you just seeded.

### Running tests

```bash
cd backend && npm test        # normalize.ts against the real dirty guest-list data
cd frontend && npx tsc -b --noEmit
```

## Branding

`frontend/public/brand/` currently holds **placeholders** — see the
`README.md` inside that folder for the exact filenames to replace.

## Deploying to Vercel

Two Vercel projects, both pointed at this same repo with different **Root
Directory** settings.

### Backend project — Root Directory: `backend`

1. Add **Neon Postgres** from the Vercel Marketplace (injects `DATABASE_URL`
   / a direct URL automatically).
2. Environment variables (Production + Preview):
   ```
   DATABASE_URL              # from the Neon integration, add ?pgbouncer=true&connection_limit=1
   DIRECT_URL                # Neon's unpooled URL — migrations only
   AUTH_SECRET                # openssl rand -base64 32
   FRONTEND_ORIGIN           # https://<your-frontend-project>.vercel.app
   DEFAULT_PHONE_REGION=IN
   NODE_ENV=production
   ```
3. Deploy. `vercel.json` routes every request through `api/index.ts`, which
   wraps the whole Express app as one serverless function — proportionate
   for two staff users and under 100 contacts (see PLAN.md section 1).
4. Once live, seed the first admin **locally against production**:
   ```bash
   DATABASE_URL="<prod pooled url>" DIRECT_URL="<prod direct url>" npm run seed:admin
   ```
   There is no HTTP bootstrap endpoint — this is deliberate, see PLAN.md
   section 6.1.

### Frontend project — Root Directory: `frontend`

1. Environment variable: `VITE_API_URL=https://<your-backend-project>.vercel.app/api`
2. Deploy. Vercel auto-detects the Vite build.

### Why cookies need care here

Because frontend and backend are on different Vercel domains, the session
cookie is genuinely cross-site in production. `backend/src/lib/auth.ts`
switches it to `SameSite=None; Secure` only when `NODE_ENV=production` —
dev stays `Lax` over the same-origin Vite proxy. If you ever merge the two
into one deployment, this can revert to `Lax` everywhere.

## What's still a placeholder

See PLAN.md section 11 — branding assets, and anything under
`frontend/public/brand/`.
