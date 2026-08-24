# CCC Event Guest Registry — Development Plan

Internal web app for CCC: a master contact directory of individuals, plus per-event invitation lists with arrival times and live attendance status. Staff-only login, no public signup. Hosted on Vercel.

**Status:** plan v3 — design, branding, real Excel schema, and scale all locked.

---

## 1. Scale — and what it lets us delete

Confirmed: **2 staff accounts, fewer than 100 contacts in year one.**

This is a small app. Three things in the previous plan were built for a scale that will not arrive, and are now cut:

| Cut | Was | Now | Saves |
|---|---|---|---|
| Upstash Redis | External rate-limit store | A `login_attempts` table in Postgres. Two users generate no contention. | One vendor, one integration, two env vars |
| Resend / transactional email | Emailed invite and reset links | Admin generates a single-use link and **copies it to the clipboard**, hands it over directly. Email stays an optional later add. | One vendor, DNS records, sender-domain verification, ~1 day |
| Server-side pagination and search | Paginated queries, debounced search | Load the whole directory once, filter and sort in memory. 100 contacts is roughly 40 KB of JSON. | Instant search with no spinners, no debounce, simpler code |

The security posture is unchanged — see section 5. Single-use hashed tokens still expire; only the delivery mechanism changes from email to clipboard.

**Break-glass with two accounts:** both users are `ADMIN`, so either can issue a reset link for the other. If both are locked out, `scripts/seed-admin.ts` run locally against production restores access. No self-service reset endpoint is ever deployed.

Neon Free (0.5 GB, ~191 compute-hours/month) is now enormously over-provisioned. 100 contacts is well under 1 MB.

---

## 2. Decisions locked

| Area | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Vercel-native, Server Actions remove most API boilerplate |
| Database | Neon Postgres (Vercel Marketplace integration) | Free tier is far more than enough at this scale |
| ORM | Prisma | Type-safe, good migration story, Neon-supported |
| Auth | Auth.js v5, Credentials provider | Real server-side sessions, no third-party vendor, no bypass paths |
| Password hash | `@node-rs/argon2` (argon2id) | Runs on Vercel serverless without native build issues |
| Rate limit | `login_attempts` table in Postgres | No Redis needed for two users |
| UI | Tailwind CSS + shadcn/ui | Composable primitives, easy to re-skin to the reference design |
| Tables | TanStack Table, client-side model | Sort and filter ergonomics without server round-trips |
| Excel | ExcelJS | Maintained; avoids the prototype-pollution advisories on `xlsx` |
| Phone parsing | `libphonenumber-js` | The source data needs real E.164 normalisation (see 4.2) |
| Validation | Zod + react-hook-form | One schema shared by form, Server Action, and import parser |
| Email | *None in v1* | Invite and reset links are copied to clipboard by an admin |

**Vercel Hobby is non-commercial-use-only.** If CCC counts as an organisation under Vercel's terms, budget for Pro ($20/mo) before go-live.

---

## 3. Source data — what the real spreadsheet actually contains

Analysed from `Copy of Confirmed Guest List.xlsx`. **These seven headers are the canonical import template.**

| Sheet header | Maps to | Filled | Notes |
|---|---|---|---|
| `NAME` | `full_name` | 45/45 (100%) | The only required field |
| `COMPANY NAME` | `organization` | 45/45 (100%) | |
| `POSITION` | `designation` | 45/45 (100%) | |
| `Profile` | `profile_url` | 43/45 (96%) | 100% LinkedIn URLs |
| `Phone No.` | `phone` / `alt_phone` | 27/45 (60%) | Dirtiest column, see below |
| `Mail ID` | `email` / `alt_email` | 43/45 (96%) | |
| `Food Pref.` | `dietary_notes` | 1/45 (2%) | Only value present: "No gluten" |

45 real data rows. **The sheet reports 989 rows** because of stray formatting — the importer must scan to the last row containing data, never trust `worksheet.rowCount`.

### Data quality issues the importer must handle

| Issue | Occurrences | Example |
|---|---|---|
| Phone stored as a **number**, so it stringifies with a `.0` | 18 of 27 | `9845627437.0` |
| Phone with an internal space | 7 | `98197 85146` |
| Two phone numbers in one cell | 1 | `+971552017503, +916238893787` |
| Literal `"Na"` text where the cell should be empty | 1 | row 40 |
| Two email addresses in one cell, space-separated | 1 | `harsha.reddy@nslinfratech.com harshavardhanareddy@gmail.com` |
| Leading / trailing whitespace | 29 cells | `"Sourabh jain "`, `"Citi bank "` |
| Inconsistent company casing | several | `bosch`, `Citi bank`, `Milennium` |

Zero duplicate names and zero duplicate emails in this file. But **40% of rows have no phone and 4% have no email**, so deduplication cannot key on contact details alone — see 4.2.

---

## 4. Data model

Only `contacts.full_name` is NOT NULL among the guest fields.

### `users` — staff accounts (never guests)
```
id            uuid pk
email         citext unique
name          text
password_hash text
role          enum ADMIN | STAFF
is_active     bool default true
token_version int  default 0     -- bump to invalidate all live sessions
last_login_at timestamptz
created_at / updated_at
```

### `user_invites` — admin-created account bootstrap
```
id, email, role, token_hash, expires_at, accepted_at, created_by
```

### `login_attempts` — replaces Redis rate limiting
```
id, email_attempted citext, ip inet, succeeded bool, at timestamptz
```
Indexed on `(email_attempted, at)` and `(ip, at)`. Rows older than 24 h pruned on write.

### `contacts` — the master directory
```
id             uuid pk
full_name      text NOT NULL          -- only required field
organization   text NULL              -- "COMPANY NAME"
designation    text NULL              -- "POSITION"
profile_url    text NULL              -- LinkedIn
email          citext NULL            -- "Mail ID"
alt_email      citext NULL            -- second address when one cell held two
phone          text NULL              -- E.164, normalised
alt_phone      text NULL              -- second number when one cell held two
phone_raw      text NULL              -- original cell text, kept for audit
dietary_notes  text NULL              -- "Food Pref."
notes          text NULL              -- app-only free text
source         enum MANUAL | IMPORT | WALK_IN
created_by     uuid -> users
created_at / updated_at
deleted_at     timestamptz NULL       -- soft delete, keeps event history intact
```
Indexes: unique partial index on `lower(email)` where not null, index on `phone`. At 100 rows a trigram index is pointless — plain `ILIKE` is fine, and search happens client-side anyway.

`phone_raw` exists because normalisation is lossy and the source is messy — when a number looks wrong later, you can see what the spreadsheet actually said.

### `tags` + `contact_tags`
Free-form labels (`speaker`, `investor`, `alumni`, `vip`). Enables bulk "invite everyone tagged X".

### `events`
```
id, name NOT NULL, description, venue,
start_at, end_at (timestamptz), timezone (IANA string),
status enum DRAFT | ACTIVE | COMPLETED | CANCELLED,
created_by, created_at / updated_at
```

### `event_invitations` — the core join table
```
id                 uuid pk
event_id           -> events (cascade delete)
contact_id         -> contacts (restrict)
UNIQUE (event_id, contact_id)

arrival_at         timestamptz NULL     -- "day and time they will arrive"
departure_at       timestamptz NULL
status             enum UNCONFIRMED | CONFIRMED | ARRIVED_IN_CAMPUS
                        default UNCONFIRMED
status_updated_at  timestamptz
status_updated_by  -> users
added_during_event bool default false   -- walk-in flag
travel_mode        text NULL
accommodation      text NULL
notes              text NULL
added_by, created_at / updated_at
```

### `invitation_status_history` — audit trail
```
id, invitation_id, from_status, to_status, changed_by, changed_at
```
Answers "who changed this person's status, and when".

### `import_batches`
```
id, filename, uploaded_by, event_id NULL, total_rows,
created_count, updated_count, skipped_count, error_count,
errors jsonb, created_at
```

### `audit_log`
`actor_id, action, entity_type, entity_id, diff jsonb, ip, user_agent, at`. Covers logins, failed logins, deletes, exports, bulk operations.

---

## 5. Feature specs

### 5.1 Contacts directory
- Whole directory loaded once, searched and filtered in memory. Search hits name / email / phone / organization / designation, updating on every keystroke.
- Filters: tag, organization, has-email, has-phone.
- Add contact: single form, only Name required.
- Edit / soft-delete. Soft-deleted contacts stay visible on past event rosters.
- Duplicate warning on save (never a block) when email, phone, or name+organization matches.
- Export the current filtered view to `.xlsx` using the same seven headers, so exports round-trip back through the importer.

### 5.2 Excel import

Flow: **Upload → auto-detect headers → map columns → normalise + preview → commit.**

- Accepts `.xlsx`, `.xls`, `.csv`.
- Parsed **in the browser** with ExcelJS, then POSTed. Rows are chunked at 500 as a guard against the 4.5 MB Vercel body cap, though a file this size is a single request.
- Column mapping auto-matches the seven known headers case- and space-insensitively (`NAME`, `Name`, `full name` all resolve to `full_name`). Unknown columns can be mapped manually or ignored. Saved mappings are reusable.
- **Scan to the last row containing data**, not the declared row count.

**Normalisation rules, derived from the real file:**

*Every cell*
- Trim, then collapse runs of internal whitespace.
- Treat `""`, `-`, `na`, `n/a`, `nil`, `none` (case-insensitive) as `NULL`, not as text.

*Phone*
- If the cell's underlying type is numeric, format it as an integer. Never `String(value)` — that is what produces `9845627437.0`.
- Strip spaces, hyphens, parentheses.
- Split on `,` `/` `&` or the word `and`. First number to `phone`, the rest to `alt_phone`.
- Parse with `libphonenumber-js` against a configurable default region (**IN** for this data). A bare 10-digit number becomes `+91XXXXXXXXXX`; a number already carrying `+` keeps its own country code.
- Unparseable values are **not** discarded — they land in `phone_raw` and the row is flagged for review rather than failed.

*Email*
- Lowercase and trim. Split on whitespace, `,`, or `;`. First to `email`, second to `alt_email`.
- Malformed addresses are flagged for review, not rejected — the contact is still worth having.

*Profile*
- Validate as a URL, prefix `https://` when missing. Non-LinkedIn URLs are accepted.

*Organization / Designation*
- Trim only. Casing is **not** auto-corrected — the preview surfaces likely variants (`bosch` vs `Bosch`) as a suggestion the user can accept, so no silent rewriting of real company names.

**Deduplication.** Match cascade: `email` → `phone` → `lower(full_name) + lower(organization)`. Because 40% of rows have no phone and 4% no email, the name+organization tier does real work here. Strategy chosen per import: **Skip / Update existing / Create anyway**. Name+organization matches are always surfaced for confirmation rather than merged automatically.

**Result screen.** Created / updated / skipped / flagged / failed counts, plus a downloadable `errors.xlsx` containing only the problem rows with a reason column — fix and re-upload that file directly. A row missing a name is the only hard failure.

Optional checkbox: "also invite all imported contacts to event ___".
A blank template `.xlsx` with the exact seven headers is downloadable from the import screen.

### 5.3 Events
- Create / edit: name, description, venue, start, end, timezone.
- Event detail page is the roster.
- Delete guarded by a confirm dialog naming the invitation count.

### 5.4 Linking members to an event
- "Invite members" drawer: searchable multi-select over the directory, same filters as the contacts view.
- **Select-all-matching-filter**, so inviting everyone tagged `speaker` is two clicks.
- Bulk-set an arrival date and time across the selection; override per person afterwards.
- Already-invited contacts show greyed out rather than duplicating; the unique constraint is the backstop.

### 5.5 Status board (the day-of screen)
- Three views over the roster: **Unconfirmed / Confirmed / Arrived in Campus**, with live counts.
- One tap changes status. Optimistic UI, rollback plus toast on server error.
- Bulk status change on multi-select.
- Every change writes `invitation_status_history`.
- Export roster to `.xlsx` with statuses and arrival times.
- **Mobile-first** — see 7.6.

### 5.6 Mid-event walk-in registration
- "Add guest" button on the event page, available regardless of event status.
- Two paths in one dialog:
  1. **Search existing** contact, link to the event immediately.
  2. **New person**, name-only quick form, creates the contact (`source = WALK_IN`) and the invitation in one transaction.
- Walk-ins default to `ARRIVED_IN_CAMPUS` (they are standing in front of you), overridable. Flagged `added_during_event = true`.

### 5.7 Dashboard
Per-event tiles: total invited, confirmed, arrived, arrival histogram for today, and an "arriving in the next 2 hours" list.

---

## 6. Authentication — "no workarounds"

Threat model: two staff accounts; the app holds personal contact data — names, direct mobile numbers, personal email addresses, employers — for real senior professionals. Treat it as PII.

1. **No public signup route exists.** Not hidden — absent from the router.
2. Admin creates a user; the server issues a single-use invite token (32 random bytes, only the SHA-256 hash stored, 48 h expiry) and returns a **copy-to-clipboard link**. The invitee sets their own password. The admin never sees or sets it.
3. Passwords: argon2id via `@node-rs/argon2`. Minimum 12 characters, scored with `zxcvbn`, common-password list rejected.
4. Sessions: Auth.js v5 Credentials provider. Credentials forces the JWT strategy, so revocability is added explicitly — the JWT carries `token_version` and the `jwt` callback re-checks it against the DB on each request. Deactivating a user or changing a password bumps `token_version` and kills every live session immediately.
5. Cookies: `httpOnly`, `secure`, `sameSite=lax`. Session 8 h, rolling refresh.
6. **Login rate limiting** via the `login_attempts` table: 5 failures per email and per IP within 15 minutes locks that pair for 15 minutes. Every attempt, successful or not, is recorded.
7. Generic error text on failed login. No "user not found" versus "wrong password" distinction — that is an account-enumeration leak.
8. `middleware.ts` denies by default. The public allowlist is exactly `/login`, `/invite/[token]`, `/api/auth/*`.
9. **Every Server Action and Route Handler re-checks the session server-side.** Middleware is defence-in-depth, never the only gate.
10. Role checks (`ADMIN` for user management, imports, deletes) enforced in the action, not just hidden in the UI.
11. Security headers via `next.config.ts`: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, restrictive CSP, `Referrer-Policy`.
12. Password reset uses the same single-use hashed-token mechanism, 1 h expiry, invalidated on use, bumps `token_version`. Generated by the other admin, handed over out-of-band.
13. Contact exports are logged to `audit_log` with row counts — a full directory dump is the highest-value action in the app.
14. Phase 2 option: TOTP 2FA.

---

## 7. Visual design

Reference: the Dynamics 365 "Sales Hub" concept redesign, re-skinned to the CCC orange / black brand palette.

### 7.1 Structure taken from the reference

A **three-column shell** on desktop, every region a floating rounded panel on a light grey page, separated by background tone and soft shadow rather than borders.

```
┌──────────┬─────────────────┬──────────────────────────────────┐
│  Menu    │  List column    │  Detail panel                    │
│  rail    │  (date-grouped) │  toolbar / header / stepper /    │
│          │                 │  tabs / card grid                │
└──────────┴─────────────────┴──────────────────────────────────┘
```

The reference maps onto this app unusually cleanly:

| Reference element | Becomes |
|---|---|
| Left rail, grouped nav with a filled pill for the active item | Home · Contacts · Events · Import · Users · Settings |
| "My Work" list, grouped by `Today` / `3 weeks ago` | **Arrival schedule grouped by day** — `Today`, `Tomorrow`, `Fri 12 Sep` |
| Card rows: avatar, name, subtitle, chip, timestamp | Guest rows: initials avatar, name, company, status chip, arrival time |
| Circular score badge on each row | Status indicator — icon and tint, not a number |
| Business-process stepper with locked future stages | **Unconfirmed → Confirmed → Arrived in Campus.** Already a three-stage pipeline; a direct one-to-one mapping |
| Toolbar of ghost icon+label buttons | Save · Add Guest · Import · Export · Delete |
| "Contact" card, stacked label-over-value with hairline rules | Guest detail: Company, Position, Phone, Email, LinkedIn, Food Pref. |
| "Up Next" card with a highlighted current step | **Arriving in the next 2 hours** |
| "Lead Score" gauge, big number + ring + grade chip | **Attendance gauge** — arrived / total invited |
| "Timeline" card | `invitation_status_history` feed |
| Pill tabs, active one filled solid black | Summary · Events attended · Activity |

Detail: generous corner radius (cards ~24px, controls ~12px, chips fully rounded), soft diffuse shadows, no hard 1px borders, micro-labels in small grey caps above bold values, and a subtle diagonal gradient wash behind the detail-panel header.

### 7.2 Palette

Brand colours as supplied:

```
Branding Orange   #E85002
Primary Black     #000000
Light Gray        #A7A7A7
White             #F9F9F9
Gray              #646464
Dark Gray         #333333
Gradient stops    #000000 → #C10801 → #F16001 → #D9C3AB
```

**Contrast constraint, measured.** `#E85002` scores **3.76:1** against white. That passes the 3:1 bar for large text and UI boundaries but **fails the 4.5:1 bar for body text**, in either direction. So the palette needs a split:

| Token | Value | Use |
|---|---|---|
| `--accent` | `#E85002` | Large fills, chips, gauges, charts, active tints, the gradient. Never small text. |
| `--accent-ink` | `#C10801` | Any orange **text** or icon on a light surface. **6.36:1** on white — passes AA. |
| `--accent-ink-dark` | `#FF8C52` | Orange text in dark mode. **5.49:1** on `#333333` — passes AA. |
| `--ink` | `#000000` | Primary text, primary buttons |
| `--ink-muted` | `#646464` | Secondary text |
| `--hairline` | `#A7A7A7` | Rules, dividers, disabled |
| `--surface` | `#F9F9F9` | Cards |
| `--page` | `#EDEDED` | Page background behind the floating panels |

Following the reference, the **primary action button is black with white text**, not orange — exactly as its "Call" button is. Orange stays an accent: active nav pill tint, gauge arc, chips, the header gradient wash, the selected-row tint. This both matches the reference's restraint and sidesteps the contrast problem entirely.

Dark mode inverts the surface ramp — `--page #000000`, `--surface #333333`, `--ink #F9F9F9` — and swaps `--accent-ink` for `--accent-ink-dark`. Every colour is defined once on `:root`; only the tokens are redefined under the dark selector.

The four-stop gradient (`#000000 → #C10801 → #F16001 → #D9C3AB`) is used once per screen at most — behind the detail-panel header — at low opacity. Anything sitting on it needs its own solid backing.

### 7.3 Status colours

Three statuses, and the brand is already orange, so a conventional amber "pending" would collide with it. The ramp escalates in weight instead, which stays legible in greyscale and prints correctly:

| Status | Treatment | Icon |
|---|---|---|
| **Unconfirmed** | Light grey fill `#A7A7A7` at low opacity, `#646464` text | Dashed circle |
| **Confirmed** | Orange tint fill, `#C10801` text | Check circle |
| **Arrived in Campus** | Solid black fill, white text | Pin with check |

Grey → orange → black reads as progression and never relies on hue alone.

### 7.4 Branding assets

Three logos, four required variants.

**CCC — the product logo.** Appears in the nav rail header, the login page, and the favicon.

Supplied as a white mark on a solid black square, with a green `1%` in the tagline `FOR THE TOP 1%`.

Required variants:
- **Dark mode:** the supplied artwork with the black background removed (transparent), so the white mark sits on `--page`.
- **Light mode:** the same mark filled `#000000` on transparent, tagline in `#000000`, `1%` kept green.

Production approach: get the **source SVG** from whoever made it. If only the PNG exists, the mark is pure white on pure black and separates cleanly by luminance — but the green `1%` must be isolated *before* any inversion, or it flips to magenta. A blanket `filter: invert(1)` is not usable for this reason.

Preferred delivery is a single SVG whose mark uses `fill="currentColor"`, so one file serves both themes and the tagline green stays a fixed fill.

Note on the tagline green (~`#00A94F`): it scores about **3.09:1** on white. WCAG explicitly exempts logotypes from contrast minimums, so this is not a violation and no change is required. If you would rather the tagline read as text, `#00803C` scores 5.06:1 and is visually close.

**Doc Analytica — the "made by" credit.** Footer, bottom of every page.

Two issues with the supplied files, both worth fixing before build:

1. **The version marked for dark mode has a dark navy wordmark** (`#343A4A`). Against a near-black page that is roughly **1.85:1** — effectively invisible. The dark-mode variant needs the wordmark recoloured to `#F9F9F9`. This is legibility, not compliance; logos are exempt from the contrast rule, but nobody will be able to read it.
2. **The two files are different lockups, not two colourways of one lockup.** One is mark-only; the other is mark plus wordmark. The footer will change shape and width when the theme is toggled.

Recommendation: pick one lockup — mark plus wordmark reads better as an attribution — and produce two colourways of it, identical in geometry, differing only in the wordmark colour.

**Asset handling**
- Everything lives in `/public/brand/`, SVG preferred, PNG at 1x/2x/3x as fallback.
- Also required: `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` (180×180), and an OG image (1200×630) — all from the CCC mark.
- Theme swapping uses **two `<img>` elements toggled by a CSS class on `<html>`**, not a `prefers-color-scheme` media query alone. The app has an explicit theme toggle, and a bare media query ignores a manual override.
- Both variants must be preloaded or inlined, otherwise the logo flashes on theme change.
- Footer credit is deliberately quiet: logo height 24px on mobile / 28px desktop, `--ink-muted` label text, generous whitespace above, linked to Doc Analytica.

### 7.5 Responsive behaviour

The reference layout is desktop-first and dense. It is **adapted** at each breakpoint, not shrunk.

| Width | Layout |
|---|---|
| `< 640px` — phone | Single column. Nav becomes a bottom tab bar (Home · Contacts · Events · More). The list is the home screen; tapping a guest pushes a full-screen detail view with a back button. Detail cards stack one-up. Tables become card stacks. |
| `640–1024px` — tablet | Two columns: list + detail. Nav collapses to a 64px icon-only rail. Detail cards two-up. |
| `1024–1440px` — laptop | Full three-column shell, nav rail with icons and labels. Detail cards two-up. |
| `> 1440px` — desktop | Three columns inside a max-width container so lines never over-run. Detail cards three-up, as in the reference. |

Rules that apply everywhere:
- **Test at 320px.** That is the narrowest phone still in real use; nothing may break or overflow there.
- **No horizontal page scroll, ever.** Wide content — tables, the status stepper — gets its own `overflow-x: auto` container.
- Tap targets **minimum 48×48px** on touch, with at least 8px between adjacent ones.
- Use `dvh`, not `vh`, so mobile browser chrome does not clip the viewport.
- Respect `env(safe-area-inset-*)` for notched phones — the bottom tab bar especially.
- Fluid type via `clamp()` between the breakpoints; no fixed pixel font sizes on headings.
- Layout in Grid and Flexbox with `minmax()` and `auto-fit`, so intermediate widths behave without extra breakpoints.
- Images and logos capped at `max-width: 100%`.
- Every screen verified at 320 / 375 / 768 / 1024 / 1440 / 1920 before its phase is closed.

### 7.6 The gate check-in screen

This is a separate layout, not a narrow version of the roster. It is used one-handed, standing, on a phone, possibly on bad wifi.

- Full-width guest rows, 56px tall, name and company only.
- Sticky search pinned to the top; a status filter as segmented control beneath it.
- One thumb tap cycles or sets status — no menus, no modals.
- Status changes queue locally and retry on reconnect, with a pending badge on unsynced rows.
- Bottom-anchored "Add walk-in" button, inside the safe-area inset.

### 7.7 Accessibility non-negotiables

- Every status carries an **icon or text label**, never colour alone.
- WCAG AA contrast on all text, verified against the tokens in 7.2.
- Visible focus rings on every interactive element; full keyboard operability.
- `prefers-reduced-motion` respected on the optimistic-update animations.

---

## 8. Build phases

| # | Phase | Deliverable | Est. |
|---|---|---|---|
| 0 | Scaffold | Next.js + TS + Tailwind + shadcn, design tokens from 7.2, brand assets in place, Neon provisioned, Prisma connected, hello-world deployed to Vercel | 1 d |
| 1 | Auth | Full schema, login page, middleware, clipboard invite and reset flows, DB-backed rate limiting, first admin seeded via script | 2 d |
| 2 | App shell | Three-column layout, nav rail, date-grouped list column, detail panel, light/dark tokens, logo swapping, footer credit, all four breakpoints | 2–3 d |
| 3 | Contacts | CRUD, in-memory search and filters, tags, soft delete, export | 1–2 d |
| 4 | Import | Upload, mapping, the normalisation rules in 5.2, dedupe cascade, preview, error report, template | 3 d |
| 5 | Events | Event CRUD, invite drawer, bulk arrival times | 2 d |
| 6 | Status board | Status stepper, three views, optimistic updates, walk-in dialog, history, roster export | 2 d |
| 7 | Gate screen | Separate mobile check-in layout, offline queueing | 1–2 d |
| 8 | Hardening | Audit log, Sentry, backup policy, seed data, responsive audit at every breakpoint, README and runbook | 1–2 d |

Roughly **15–18 working days** solo. Phases 3 through 6 each end in something usable.

Import stays at 3 days — its cost is data quality, not row count, so the small scale does not help there.

---

## 9. Vercel deployment

1. Push the repo to GitHub, import into Vercel.
2. Add Neon from the Vercel Marketplace — it injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` automatically.
3. Prisma needs both: `url` is the pooled connection with `?pgbouncer=true&connection_limit=1`, `directUrl` is the unpooled one, used only by `prisma migrate`.
4. Environment variables:
   ```
   DATABASE_URL             # pooled, from the Neon integration
   DIRECT_URL               # unpooled, for migrations
   AUTH_SECRET              # openssl rand -base64 32
   AUTH_URL                 # production URL
   DEFAULT_PHONE_REGION=IN  # for libphonenumber normalisation
   ```
   Set separately for Production / Preview / Development. Never commit `.env`.
5. Build command: `prisma generate && prisma migrate deploy && next build`.
6. Preview deployments point at a Neon **branch**, never production data.
7. Seed the first admin with a one-off local script run against production (`tsx scripts/seed-admin.ts`). No bootstrap HTTP endpoint is ever deployed.
8. Custom domain plus automatic HTTPS.
9. Backups: on Neon Free, a scheduled `pg_dump` via GitHub Actions to a private bucket. **Set this up before real data goes in.**

---

## 10. Known risks

| Risk | Mitigation |
|---|---|
| Phone numbers silently mangled on import | Normalise via `libphonenumber-js`, keep `phone_raw`, flag unparseable rather than dropping |
| Dedupe misfires because 40% of rows lack a phone | Three-tier match cascade; name+organization matches always need human confirmation |
| Timezone confusion on arrival times | Store UTC everywhere, render in the event's IANA timezone, label it in the UI |
| Brand orange fails AA for body text | Split `--accent` / `--accent-ink` tokens; primary buttons are black, per 7.2 |
| Maker logo unreadable in dark mode | Recoloured wordmark variant required before build, per 7.4 |
| CCC logo inverts badly if done with a CSS filter | Isolate the green `1%` first; ship two proper assets or one `currentColor` SVG |
| Both admins locked out | Either admin can reset the other; `seed-admin.ts` is the break-glass |
| Patchy venue wifi at the gate breaks status updates | Queue status changes locally, retry on reconnect, pending badge |
| Reference layout breaks on small phones | Adapt per breakpoint rather than shrink; verified at 320px, per 7.5 |
| Neon cold start ~500 ms after idle | Acceptable for internal use; a cron ping removes it |
| Vercel Hobby forbids commercial use | Move to Pro before launch if CCC counts as an organisation |
| Import mis-mapping silently corrupts records | Mandatory preview showing the first 10 normalised rows before commit |

---

## 11. Resolved and open

**Resolved**
- 2 staff accounts, both `ADMIN`, under 100 contacts in year one → scope cuts in section 1.
- Guest list is never shared outside the org → no export watermarking or redacted mode needed.
- `Arrived in Campus` stays black, not green.
- One person can be invited to multiple simultaneous events.
- No QR codes or badge printing in v1; manual status marking only.

**Still needed from you**
1. **Source files for all three logos** — SVG if they exist, otherwise the highest-resolution PNGs, dropped into `/public/brand/`.
2. A **dark-mode Doc Analytica variant with a light wordmark**, and a decision on which lockup to standardise on (see 7.4).
3. Confirmation of the exact CCC tagline green hex — sampled as roughly `#00A94F`, but the source file will be authoritative.
