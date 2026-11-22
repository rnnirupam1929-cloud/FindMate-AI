# FindMate-AI deployment checklist

## Before production

- [ ] Create a Supabase project and retain its database password securely.
- [ ] Run migrations `001_schema.sql`, `002_rls.sql`, and `003_storage.sql` in order.
- [ ] Configure Supabase Auth email delivery and allow the final site's `/reset-password` redirect.
- [ ] Back up the local SQLite database and `backend/storage` without moving or deleting the originals.
- [ ] Run the local-to-Supabase migration and verify imported users, roles, reports, workflow records, and image objects.
- [ ] Verify every migrated user can receive and complete a password reset.
- [ ] Add Production environment variables from [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md); keep secrets out of all `VITE_` variables.
- [ ] Keep Preview credentials isolated from Production data.

## Vercel project

- [ ] Import the GitHub repository as exactly one Vercel project.
- [ ] Keep Vercel Root Directory at the repository root.
- [ ] Confirm `frontend` and `backend` services are detected from `vercel.json`.
- [ ] Confirm `/api/*` routes to FastAPI and all other paths reach the Vite SPA.
- [ ] Confirm production uses PostgreSQL and Supabase Storage, never local SQLite/files.

## Smoke test after deploy

- [ ] Load `/`, `/login`, and a nested client route directly.
- [ ] Verify a protected `/api/...` request returns an API response, not the SPA.
- [ ] Sign in with a migrated account and confirm its role and reports.
- [ ] Create a report, upload an image, and open the private signed image URL.
- [ ] Verify matching, notifications, and the report map.
- [ ] Restart/redeploy and confirm database records and images remain available.
- [ ] Test password reset on the final Vercel domain.
- [ ] Review Vercel function logs and Supabase database/storage logs.
- [ ] Retain the local source backup until all production checks pass.
