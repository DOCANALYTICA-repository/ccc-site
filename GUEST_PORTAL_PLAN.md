# Guest Portal — Planning Doc (draft v1)

Status: **decisions below are confirmed; still waiting on the full written spec.** Open questions from v0 are resolved inline. This will get one more revision pass once the complete plan arrives, but the shape of the feature and its schema are now locked enough to start against.

---

## 1. What's being asked for

A second, guest-facing login, separate from the existing staff login (`User` / `ADMIN` / `STAFF` in [PLAN.md](PLAN.md)). Once a guest logs in, they get two features:

1. **Networking** — see other guests (name + role/designation), send a "connect" request. If the other person accepts, both sides get shown the other's LinkedIn URL so they can follow each other there.
2. **Questionnaire** — a form guests fill in once, answers saved to the database for staff to review later.
3. **Course plans** — university course plans get uploaded, and select guests are granted access to select course plans (per-guest, per-plan — not all-or-nothing).

Staff/admin side needs small additions to support all three (see section 6).

---

## 2. Networking feature

### Guest-facing behavior
- Guest sees a directory of other guests — likely scoped to the event they're invited to, not the whole contact database.
- Directory shows **name + role/designation** only. No phone, no raw email, no LinkedIn — until connection is mutual.
- Guest can send a connect request to another guest.
- Target guest sees incoming requests, can accept or decline.
- On accept: both guests' LinkedIn URLs (`Contact.profileUrl`, already in the schema) become visible to each other.
- Declined/ignored requests presumably stay private (the requester probably shouldn't see "declined" plainly — needs a decision, see open questions).

### Data model (new)
```
model GuestAccount {
  id            String   @id @default(uuid())
  contactId     String   @unique @map("contact_id")   // one guest account per Contact
  contact       Contact  @relation(fields: [contactId], references: [id])
  passwordHash  String?  @map("password_hash")         // or magic-link only, no password — TBD
  tokenVersion  Int      @default(0)
  lastLoginAt   DateTime?
  createdAt     DateTime @default(now())
}

model ConnectionRequest {
  id            String   @id @default(uuid())
  eventId       String                                 // scoped per event
  requesterId   String   @map("requester_id")           // GuestAccount.id
  targetId      String   @map("target_id")              // GuestAccount.id
  status        ConnectionStatus @default(PENDING)      // PENDING | ACCEPTED | DECLINED
  createdAt     DateTime @default(now())
  respondedAt   DateTime?

  @@unique([eventId, requesterId, targetId])
}

enum ConnectionStatus {
  PENDING
  ACCEPTED
  DECLINED
}
```

### Decisions (confirmed)
- Directory scope: **same event only.** A guest sees other guests at the event they're invited to, not their whole attendance history.
- Decline is **silent** — requester never sees a "declined" state, just never hears back. Friendlier, standard pattern.
- **No un-connect / revoke** once accepted — accepting is final for both sides.
- **Rate limit connect requests** — stop one guest spamming the whole room. Reuse the existing `LoginAttempt`-style windowed-count pattern in [rateLimit.ts](backend/src/lib/rateLimit.ts) rather than adding new infra.
- Staff get **no visibility** into who connected with whom — this stays fully guest-private. Staff only ever sees questionnaire answers (section 3), never the connection graph.

---

## 3. Questionnaire feature

### Guest-facing behavior
- Guest fills in a form once per event.
- **Guests can go back and edit their answers** after submitting — not a one-shot lock.
- Submitted answers are saved to the DB, reviewed later by staff. No guest-facing "results" view implied.
- Questions are **mostly yes/no** (boolean). The schema keeps a `type` field so a stray non-boolean question doesn't force a migration, but the UI can default to a Yes/No toggle for now.

### The actual question set (from `CHRIST DOC + Coll.docx`)

Source doc lists 7 CHRIST DOC corporate-engagement areas, each pasted from what was originally a form field ("Top of Form" / "Bottom of Form" markers survived the copy — the original almost certainly had a Yes/No control per item). These become the 7 questionnaire questions, each asking whether the guest is interested in that collaboration area:

| # | Area | Description (context, not the question text) |
|---|---|---|
| 1 | Consultancy & Research Projects | Industry-focused consultancy and applied research — market research, business analysis, data analysis, subject-matter expertise on real-world business challenges. |
| 2 | Case Writing | Developing real-world business cases in collaboration with companies for teaching, executive learning, and industry knowledge creation. |
| 3 | CSR & ESG Projects | Partnering to design/implement CSR and ESG initiatives across communities, MSMEs, schools, and other sectors. |
| 4 | Knowledge Partnerships | Long-term industry–academia partnerships — knowledge sharing, expert interactions, joint initiatives, best-practice exchange. |
| 5 | Internships & Placements | Internships, placements, live projects, industry mentoring — connecting corporate talent needs with student capabilities. |
| 6 | Short-Term & Executive Courses | Industry-relevant short-term/executive education programmes to upskill professionals in business, finance, analytics, management. |
| 7 | Board of Studies & Academic Participation | Industry leaders contributing to curriculum development, academic planning, and programme enhancement. |

Exact question phrasing (e.g. "Would you be interested in participating in Consultancy & Research Projects?") still needs sign-off once the full spec lands — the doc gives the collaboration areas, not verbatim question text.

### Data model (new)
```
model QuestionnaireQuestion {
  id        String   @id @default(uuid())
  eventId   String
  prompt    String
  type      QuestionType   @default(YES_NO)   // YES_NO | TEXT | SINGLE_CHOICE | MULTI_CHOICE
  options   Json?                             // only used for non-YES_NO types
  order     Int
  required  Boolean @default(true)
}

model QuestionnaireResponse {
  id           String   @id @default(uuid())
  eventId      String
  guestId      String                     // GuestAccount.id
  questionId   String
  answer       Json                       // boolean for YES_NO; shape varies for other types
  submittedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt         // guests can revise, so track last edit

  @@unique([guestId, questionId])          // one row per guest per question — edits UPSERT, not append
}
```

Question set is **fixed content, seeded once** (from the 7 areas above), not staff-authored per event through the UI for v1 — matches how the questions were supplied. If per-event customization turns out to be needed later, `QuestionnaireQuestion.eventId` already makes that possible without a schema change.

---

## 4. Course plans feature

### Guest-facing behavior
- University course plans (documents) get uploaded to the system.
- Access is granted **per guest, per course plan** — a select subset of guests can see a select subset of plans. Not tied to event or role automatically; it's an explicit grant staff make.
- A guest only ever sees the course plans they've been individually granted — everything else in the library is invisible to them, not just locked-and-visible.
- Guest can view/download a plan they have access to. No editing, no comments — read-only.

### Data model (new)
```
model CoursePlan {
  id          String   @id @default(uuid())
  title       String
  fileUrl     String   @map("file_url")        // storage location — see storage note below
  fileName    String   @map("file_name")
  uploadedBy  String   @map("uploaded_by")      // User.id (staff)
  uploader    User     @relation(fields: [uploadedBy], references: [id])
  createdAt   DateTime @default(now())
  deletedAt   DateTime? @map("deleted_at")

  grants      CoursePlanAccess[]
}

model CoursePlanAccess {
  id            String     @id @default(uuid())
  coursePlanId  String     @map("course_plan_id")
  coursePlan    CoursePlan @relation(fields: [coursePlanId], references: [id])
  guestId       String     @map("guest_id")       // GuestAccount.id
  guest         GuestAccount @relation(fields: [guestId], references: [id])
  grantedBy     String     @map("granted_by")      // User.id (staff)
  grantedAt     DateTime   @default(now())

  @@unique([coursePlanId, guestId])
}
```

Revocable by design (unlike the networking connection, which is permanent once accepted) — staff should be able to pull a grant if a plan was shared by mistake. Deleting the `CoursePlanAccess` row is enough; no separate "revoked" state needed unless an audit trail is wanted later.

### File storage — needs a decision
The app has no file-upload path today (Excel import reads a spreadsheet in-memory and never persists the file — see PLAN.md section 1). Course plans are new: real files that need to persist and be served back out. Options:
- **Vercel Blob** — fits the existing Vercel-hosted, no-extra-infra approach the rest of this app follows. Signed URLs, no server disk involved (serverless functions can't rely on local disk anyway).
- Store in Postgres as `bytea` — works at this scale (few files, staff-only uploads) but bloats the DB and is a worse fit than blob storage for anything PDF-sized.

Recommendation: Vercel Blob, one new env var, matches the "add a vendor only when actually needed" pattern PLAN.md already uses elsewhere.

### Open questions
- File type — PDF only, or anything (docx, pptx)? Assuming PDF unless told otherwise (easiest to preview in-browser without a download step).
- Any file size cap?
- Does staff grant access one guest at a time, or bulk (e.g. "grant this plan to everyone in group X")? Affects whether the admin UI needs a multi-select.
- Is a course plan tied to a specific event, or fully independent of events (more likely, since this is about university courses, not event attendance)? Schema above assumes independent of events — flag if that's wrong.

---

## 5. Guest auth

Needs its own login surface, distinct from `User`/staff auth — a guest is a `Contact`, not a `User`, and shouldn't get staff permissions.

Options to decide between once the full plan lands:
- **Password-based**, like staff (`GuestAccount.passwordHash`) — staff sets/issues a temp password or reset link, same pattern as `UserInvite` today.
- **Magic-link only** (email a single-use signed link, no password to manage) — less to build, no password-reset flow, but requires guests to have a working email on file (currently 96% do, per PLAN.md section 3).

Either way: separate JWT/session cookie namespace, separate `requireGuestAuth` middleware, guest routes fully walled off from `/api/admin/*` and staff routes.

---

## 6. Likely admin-side changes

Now three features' worth, but still small per-feature:
- A way to **issue/reset a guest's login** (mirrors the existing staff invite-link flow in `scripts` / `UserInvite`).
- A way to **view questionnaire responses** per event (table/export, mirrors existing contact/event views) — this is the *only* new data staff get to see from networking+questionnaire. **No connection-graph view** — confirmed private, so nothing to build there.
- Possibly a toggle to **turn networking on/off per event** (e.g. don't want networking live for a small internal event) — not confirmed yet, kept as a maybe.
- **Upload a course plan** (file upload UI, new for this app — see section 4's storage note).
- **Grant/revoke course-plan access per guest** — a table or picker: pick a plan, pick guest(s), grant; pick an existing grant, revoke.

Confirm the per-event networking toggle and the course-plan open questions (section 4) once the full plan is in — everything else in this list is locked.

---

## 7. Rough effort estimate

Assumes the existing stack (Express/Prisma/Postgres backend, React/Vite frontend) and reusing existing patterns (JWT auth, Prisma migrations, admin table UI) rather than new infrastructure — plus one new vendor for file storage (section 4).

| Piece | Estimate |
|---|---|
| Schema + migration (`GuestAccount`, `ConnectionRequest`, `QuestionnaireQuestion`, `QuestionnaireResponse`, `CoursePlan`, `CoursePlanAccess`) + seed the 7 fixed questions | 0.5–1 day |
| Guest auth (login, session, guest-only middleware) — password-based | 1 day |
| Guest auth — magic-link instead | 0.5 day (simpler, no reset flow) |
| Guest directory (same-event scope) + connect/accept/silent-decline API + UI, incl. rate limiting | 2–2.5 days |
| Questionnaire — 7 fixed yes/no questions, submit + edit-in-place + store | 1–1.5 days |
| Course plans — file storage wiring (Vercel Blob), upload endpoint, guest-facing filtered list + view/download | 1.5–2 days |
| Admin: issue/reset guest logins | 0.5 day |
| Admin: view questionnaire responses (table/export) | 0.5–1 day |
| Admin: upload course plans + grant/revoke access per guest | 1–1.5 days |
| Admin: per-event networking toggle (unconfirmed, may not be needed) | 0.5 day |
| Testing + polish | 1–1.5 days |
| **Total (password auth, without the per-event toggle)** | **~9.5–11 days** |
| **Total (magic-link auth, with the per-event toggle)** | **~9–10.5 days** |

Course plans added roughly 3–4 days over the v1 estimate, mostly the new file-storage integration (nothing in this app persists an uploaded file today) and the grant/revoke admin UI. Solo-dev estimate against a small, already-familiar codebase; not padded for unknowns still open in the full written spec.

---

## 8. Next step

Still waiting on the full written plan before touching code. What's still open:
- Guest auth delivery: password vs magic-link, and how a guest gets their first credential (emailed? handed out at check-in?).
- Exact phrasing of the 7 questionnaire questions (doc gives the collaboration areas, not verbatim question text).
- Whether the per-event networking toggle is actually wanted.
- Course plans: file type/size limits, one-at-a-time vs bulk access grants, and whether plans are event-scoped or fully independent (section 4).

Once the full spec lands, revise this into a locked spec and re-check the estimate above before implementation starts.
