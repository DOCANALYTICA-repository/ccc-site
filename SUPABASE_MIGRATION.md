# Supabase production migration

Express cookie sessions and Prisma remain authoritative. Supabase provides
hosted PostgreSQL, private Storage, and private Realtime Broadcast channels.

## Rehearsal

1. Create a staging project and a private `course-resources` bucket.
2. Disable public Realtime channels.
3. Export the old database's `public` schema and data with `pg_dump`.
4. Restore it into staging while preserving UUIDs and `_prisma_migrations`.
5. Run `npm run prisma:deploy` from `backend/`.
6. Compare counts for users, contacts, events, invitations, histories, imports,
   and audit rows. Exercise an existing staff login and roster export.

## Production cutover

1. Announce a maintenance window and take a final backup.
2. Stop writes, restore the final dump, then run `prisma migrate deploy`.
3. Verify counts, foreign keys, staff login, an event roster, export, and health.
4. Update Vercel's backend variables and deploy backend before frontend.
5. Keep the old database read-only until acceptance. Roll back only before new
   writes are allowed; afterwards forward-fix to avoid data loss.

Never expose `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `AUTH_SECRET`, or
`CHECKIN_SECRET` to the frontend.
