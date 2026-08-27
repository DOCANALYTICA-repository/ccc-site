# CCC Event Registry

CCC's internal event registry and authenticated community platform: guest
invitations/check-in, professional connections and messaging, restricted
Commerce course catalogs, and end-of-event questionnaires.

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

1. Create a Supabase project. Use its transaction-mode Supavisor URL for
   `DATABASE_URL` and session/direct URL for `DIRECT_URL`.
2. Environment variables (Production + Preview):
   ```
   DATABASE_URL              # Supavisor transaction-mode URL — runtime
   DIRECT_URL                # Supavisor session/direct URL — migrations
   AUTH_SECRET                # openssl rand -base64 32
   CHECKIN_SECRET             # separate secret for venue QR challenges
   SUPABASE_URL
   SUPABASE_SECRET_KEY
   SUPABASE_JWT_SECRET        # custom Realtime JWT signing
   SUPABASE_COURSE_BUCKET=course-resources
   FRONTEND_ORIGIN           # https://<your-frontend-project>.vercel.app
   DEFAULT_PHONE_REGION=IN
   NODE_ENV=production
   ```
3. Create a private Storage bucket named `course-resources`, disable public
   Realtime channels, and apply Prisma migrations.
4. Deploy. `vercel.json` routes every request through `api/index.ts`, which
   wraps the whole Express app as one serverless function — proportionate
   for two staff users and under 100 contacts (see PLAN.md section 1).
5. Once live, seed the first admin **locally against production**:
   ```bash
   DATABASE_URL="<prod pooled url>" DIRECT_URL="<prod direct url>" npm run seed:admin
   ```
   There is no HTTP bootstrap endpoint — this is deliberate, see PLAN.md
   section 6.1.

### Frontend project — Root Directory: `frontend`

1. Environment variables: `VITE_API_URL`, `VITE_SUPABASE_URL`, and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
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
