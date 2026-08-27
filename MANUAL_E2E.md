# CCC Manual E2E Smoke Test

Local URL: <http://localhost:5173>

## Current login

| Role | Identifier | Password |
|---|---|---|
| Admin | `admin@ccc.local` | The private password chosen during the completed first-login password change |

No STAFF, MEMBER, or GUEST accounts currently exist.

## Test flow

1. **Admin:** Sign in; confirm dashboard, Contacts, Events, Community, Courses, Surveys, and Users open without errors.
2. **Member:** Users → create a MEMBER with a unique phone and temporary password; sign out; sign in by phone; confirm password change is mandatory.
3. **Guest invitation:** Create a contact with a unique phone, create an event, add the contact, and export **Guest setup list**. Confirm a GUEST account is provisioned with temporary password `1234`.
4. **Guest RSVP:** Sign in by guest phone, change password, accept the invitation, and enable profile discoverability. Confirm status becomes **Confirmed** in the admin event roster.
5. **Attendance:** As admin, start **Guest check-in QR**. As guest, scan it and confirm status becomes **Arrived in campus**. Scan again and confirm it is idempotent.
6. **Networking:** From Member/Guest Network, send a connection request; accept it from the other account. Confirm only name and organisation appeared before acceptance and permitted profile fields appear afterward.
7. **Messaging:** Open the accepted connection, exchange messages, and confirm unread/read state. Message polling should work even without Realtime configuration.
8. **Courses:** As admin, create Program → Catalog → Course → Module, grant the catalog to a test account, then publish. Confirm the grantee can view it and another account cannot.
9. **Survey:** Create a yes/no template, attach it to the event, and open it. Confirm only the checked-in guest can submit, all answers are required, answers remain editable until closure, and edits fail afterward.
10. **Reporting:** As admin, verify survey counts/percentages and download the survey CSV and event roster/onboarding exports.
11. **Security:** Confirm MEMBER/GUEST direct navigation to `/contacts`, `/events`, `/users`, `/courses-admin`, and `/surveys-admin` is rejected by the API.

## Expected configuration limitation

Private Storage signing and live Supabase Realtime require `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SECRET` in `backend/.env`. Database-backed chat polling and all non-file flows remain testable without them.
