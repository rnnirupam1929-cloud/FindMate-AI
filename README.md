# FindMate AI

*Lost something? Let AI find it.* A lost-and-found recovery platform for campuses. It compares lost and found reports, explains each possible match, and leaves ownership decisions to a person.

Stack: React + TypeScript + Vite + Tailwind (frontend), FastAPI + SQLAlchemy (backend), PostgreSQL / Supabase Auth + Storage (production), SQLite + local dev auth (local).

## Run locally
```bash
# backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload            # http://127.0.0.1:8000/docs (Swagger)

# frontend (second terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```
With no Supabase variables set, the backend uses its built-in **local dev auth** (refused when `APP_ENV=production`). To get an admin, set `ADMIN_EMAILS=you@example.com` in `backend/.env` and sign up with that email.

## Tests
```bash
cd backend && python3 -m pytest -q
cd frontend && npm test                    # Vitest
cd frontend && npx playwright install chromium && npm run e2e   # boots its own backend + frontend
```
If browsers can't be downloaded, set `PW_CHROMIUM_PATH` to an installed Chromium. See `docs/TEST_REPORT.md`.

## Supabase setup
1. Create a project. Run `database/migrations/001_schema.sql`, `002_rls.sql`, and `003_storage.sql` in order using the SQL editor.
2. Configure Supabase Auth email delivery. Add the final site URL and `/reset-password` to the Auth redirect allowlist.
3. Configure the environment variables listed in [docs/VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md). Production uses Supabase Auth, PostgreSQL, and a private Supabase Storage bucket. Supabase asymmetric JWT signing is supported; the legacy JWT secret is needed only for HS256 tokens.
4. Before serving production traffic, migrate the local SQLite records and report images using `backend/scripts/migrate_local_to_supabase.py`. The script provisions Supabase Auth users and requests password resets; local password hashes are not transferred. It preserves the local database and image files. See the migration runbook before running it.
5. The backend connects with a privileged database role and enforces authorization in code (`backend/app/api/common.py`); RLS is defense in depth for direct Supabase client access.

## Deploy as one Vercel project

The root [vercel.json](./vercel.json) defines a Vite frontend service and a FastAPI backend service in the **same Vercel project and deployment URL**. `/api/*` routes to `app.main:app`; other paths route to the frontend with its SPA fallback. Vercel Services are currently in Beta. Do not set Vercel's project Root Directory to either service subfolder.

1. Create the Supabase project, run the three migrations, and configure Auth email/reset redirects.
2. Back up the local database and `backend/storage`, then follow the data-migration steps in [docs/VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md).
3. Import the GitHub repository root into Vercel once and set Production environment variables from the deployment guide. Leave `VITE_API_BASE_URL` unset so the frontend uses same-origin `/api`.
4. Deploy and verify the frontend routes, API, authentication, report/image persistence, and password resets using the [deployment checklist](./docs/DEPLOYMENT_CHECKLIST.md).

Production configuration intentionally rejects SQLite, local authentication, and local-disk image storage. The Vercel function region should be selected near the Supabase database region. Keep Preview credentials isolated from Production.

## What works
Landing page, sign up/login/logout/forgot password (Supabase Auth), protected and role-based routes, multi-step lost/found reporting with drafts and photo upload (EXIF/GPS stripped, private signed URLs), My Reports (view/edit/close/reopen/delete with confirmation), hybrid matching engine with explanations and duplicate prevention, match review/dismiss/report, human-approved ownership verification with private clues and handover, notifications with read/unread, official DSU Google Maps embed, selectable approximate report destinations, live GPS distance tracking, and walking directions via Google Maps (browser location permission required; report pins do not overlay the embed), admin dashboard (stats, moderation, users, institutions, matching weights), nine modular agents with logging, timeouts and retries.

AI details are in `docs/AI_SETUP.md`: synonym-aware description matching, optional OpenCLIP photo matching, and an admin-approved Learning Agent.

## Before production is ready
1. Create/configure the Supabase project, run the migrations, and import the existing local data and images. The current local database has records that are not in Git.
2. Add the required Vercel environment variables and deploy the single project.
3. From the repository root, run `python .\scripts\verify_supabase.py` against a staging or throwaway project (it creates a test report and then attempts cleanup). Set `BACKEND_URL` and Supabase credentials as needed. This integration check has not been run.
4. Review `docs/SUPABASE_EMAIL_TEMPLATES.md` and test reset links on the deployed domain.
5. Re-run the Playwright suite against staging; the bundled e2e suite uses local auth.

Deployment setup and the complete environment-variable inventory are in [docs/VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md). Use [docs/DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md) to verify each step.

## Known limits
- OpenCLIP is integrated and falls back safely, but was **never run with real weights** (no access to Hugging Face in the build environment). Its calibration constants need tuning on real photos.
- Description matching is lexical + synonyms, not semantic embeddings.
- Only Chromium was tested.
- Not deployed.
