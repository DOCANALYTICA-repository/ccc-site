# CCC Manual E2E Smoke Test

Local URL: <http://localhost:5173>

## Current login

| Role | Identifier | Password |
|---|---|---|
| Admin | `ccc@admin` | `ccc-admin-2026!` |

One ADMIN exists. 38 GUEST accounts are provisioned for the Corpus Conclave
guest list, each with its own one-time code — download **Guest setup list**
from the event to read them. No STAFF, FACULTY, STUDENT, or MEMBER accounts
exist yet.

## Test flow

1. **Admin:** Sign in; confirm dashboard, Contacts, Events, Community, Courses, Surveys, and Users open without errors.
2. **Member:** Users → create a MEMBER with a unique phone and temporary password; sign out; sign in by phone; confirm password change is mandatory.
3. **Guest invitation:** Create a contact with a unique phone, create an event, add the contact, and export **Guest setup list**. Confirm a GUEST account is provisioned with its **own** one-time code — no two guests share one.
4. **Guest RSVP:** Sign in by guest phone, change password, accept the invitation, and enable profile discoverability. Confirm status becomes **Confirmed** in the admin event roster.
5. **Attendance (POC portal):** As admin, open **POC check-in QR** and start a session; note the passcode shown once. Scan the QR on a phone: confirm it lands on `/poc` with no navigation into the rest of the app, that a wrong passcode is rejected, and that the right one opens the roster. Mark a guest **Arrived**, then confirm the admin roster shows **Arrived in campus**. Tap **Undo** and confirm it reverts. Finally press **End session** and confirm the phone that was already inside is locked out on its next action.
6. **Networking:** From Member/Guest Network, send a connection request; accept it from the other account. Confirm only name and organisation appeared before acceptance and permitted profile fields appear afterward.
7. **Messaging:** Open the accepted connection, exchange messages, and confirm unread/read state. Message polling should work even without Realtime configuration.
8. **Courses:** As a guest, open **Courses** and confirm all 10 Commerce syllabi are listed without any grant, and that opening one renders the PDF in the page. Then, as admin, create Program → Catalog → Course → Module, grant that catalog to one test account, and publish. Confirm the grantee sees it and another account does not — per-account grants still apply to non-public catalogs.
9. **Survey:** Create a yes/no template, attach it to the event, and open it. Confirm only the checked-in guest can submit, all answers are required, answers remain editable until closure, and edits fail afterward.
10. **Reporting:** As admin, verify survey counts/percentages and download the survey CSV and event roster/onboarding exports.
11. **Security:** Confirm MEMBER/GUEST direct navigation to `/contacts`, `/events`, `/users`, `/courses-admin`, and `/surveys-admin` is rejected by the API. Confirm the admin account does **not** appear in any account's Network tab. Confirm `/api/poc/roster` without a token returns 401, and that a syllabus file URL stops working once its 15-minute signature expires.

## Expected configuration limitation

Private Storage signing and live Supabase Realtime require `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SECRET` in `backend/.env`. Database-backed chat polling and all non-file flows remain testable without them.
