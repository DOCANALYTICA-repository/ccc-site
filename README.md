# CCC Event Registry

CCC's internal event registry and authenticated community platform: guest
invitations, POC-run gate check-in, professional connections and messaging,
Commerce course catalogs and syllabi, and end-of-event questionnaires.

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
npm run seed:syllabi          # publishes the Commerce syllabi (idempotent)
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

## Gate check-in

Attendance is marked by student point-of-contacts, not by guests. From an
event, **POC check-in QR** starts a session and shows two things:

* a **QR poster** to print and leave at the registration desk, and
* a **six-digit passcode**, displayed once and never again.

A POC scans the QR, enters the passcode, and gets a roster with one action per
row. The portal lives at `/poc`, outside every route guard and outside the app
shell: it has no link back into the application, and its token can do exactly
two things — read that one event's roster and move a guest to *Arrived*.

The split matters. The QR is a bearer credential the moment it is printed, so
it opens nothing on its own; the passcode is what unlocks the portal, and it is
stored only as an argon2 hash. **End session** revokes every POC's access
immediately, including tokens that are still cryptographically valid.

The portal roster deliberately exposes only name, organisation and designation
— never phone numbers or emails. Anyone who learns the passcode gets a check-in
list, not the contact details of every guest at the event.

`FRONTEND_ORIGIN` must be correct in production: the first origin in that list
is what the printed QR points at.

## Course syllabi

`backend/assets/syllabus/` holds the Commerce programme syllabi as PDFs, and
`npm run seed:syllabi` publishes each one as a department-wide catalog that
every signed-in account can read without a grant. They render inside the
Courses tab rather than downloading.

These ship with the deployment rather than living in Supabase Storage, so they
work without storage credentials — `vercel.json` copies `assets/**` into the
serverless function. Admin-uploaded resources still go to Supabase. Per-account
catalog grants are unchanged and still apply to every catalog that isn't marked
public.

To re-generate the PDFs from the `.docx` sources:

```bash
soffice --headless --convert-to pdf --outdir backend/assets/syllabus "Syllabus/<file>.docx"
```

## Resetting for a fresh event

`npm run reset:launch` clears everything the app has *done* — accounts,
invitations, check-in sessions, connections, messages, responses, audit trail —
while keeping the event, its questionnaire, the imported guest list and the
published catalogs. It re-seeds one admin and puts the guest list back on the
roster.

It refuses to run without `CCC_ADMIN_PASSWORD`, and without `--confirm` it only
prints what it would delete:

```bash
cd backend
CCC_ADMIN_PASSWORD='…' npm run reset:launch            # dry run
CCC_ADMIN_PASSWORD='…' npm run reset:launch -- --confirm
```

## Guest onboarding

Each provisioned guest gets its **own** one-time code, not a shared bootstrap
password — a guest's phone number is not a secret, so a constant like `1234`
across every account would make the whole guest list trivially impersonable.
The codes are readable in exactly one place, the **Guest setup list** CSV on an
event, and each stops working the moment that guest sets their own password.

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
6. Publish the syllabi the same way:
   ```bash
   DATABASE_URL="<prod pooled url>" DIRECT_URL="<prod direct url>" npm run seed:syllabi
   ```

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
