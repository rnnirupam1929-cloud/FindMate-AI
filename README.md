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
1. Create a project. Run `database/migrations/001_schema.sql`, `002_rls.sql`, `003_storage.sql` in order (SQL editor).
2. Authentication → enable email confirmation. Add your site URL to the redirect list.
3. Copy URL, anon key, service-role key, JWT secret into `.env` files (see `.env.example`). Set `AUTH_MODE=supabase`, `STORAGE_BACKEND=supabase`, `DATABASE_URL` to the Supabase Postgres connection string.
4. Note: the backend connects as a privileged DB role and enforces permissions in code (`app/api/common.py`); RLS is defense in depth for any direct Supabase client access.

## Deploy
- **Frontend (Vercel):** root `frontend`, build `npm run build`, output `dist`, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`. Add a rewrite of all paths to `/index.html`.
- **Backend (Render/Railway):** root `backend`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, env as in `.env.example` with `APP_ENV=production`, and `CORS_ORIGINS` set to the Vercel URL.

## What works
Landing page, sign up/login/logout/forgot password (Supabase Auth), protected and role-based routes, multi-step lost/found reporting with drafts and photo upload (EXIF/GPS stripped, private signed URLs), My Reports (view/edit/close/reopen/delete with confirmation), hybrid matching engine with explanations and duplicate prevention, match review/dismiss/report, human-approved ownership verification with private clues and handover, notifications with read/unread, Leaflet/OSM map with approximate points, admin dashboard (stats, moderation, users, institutions), nine modular agents with logging, timeouts and retries.

## Not done / needs credentials
- **Visual similarity is a basic colour comparison, not OpenCLIP.** The Vision Agent has a clean interface for embeddings; the model is not integrated.
- Description similarity is token-based, not semantic embeddings.
- The Learning Agent records feedback only. It does not retrain or re-weight anything.
- Supabase Auth email verification, password reset, Supabase Storage and Postgres/RLS were **not tested here** (no credentials). They are implemented and documented.
- Not production-ready until the above is verified against a real Supabase project.
