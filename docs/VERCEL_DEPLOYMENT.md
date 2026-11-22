# Single-project Vercel deployment

FindMate-AI is configured as one Vercel project with two services. Vercel Services are currently in Beta but are available on all plans. The frontend and FastAPI backend share one deployment URL and project environment variables.

## Architecture

The root [vercel.json](../vercel.json) declares:

| Service | Root | Runtime | Public routing |
| --- | --- | --- | --- |
| `frontend` | `frontend/` | Vite static build | `/` and all non-API paths, with SPA fallback |
| `backend` | `backend/` | FastAPI, `app.main:app` | `/api/*` |

The frontend already prefixes API calls with `/api`; leave `VITE_API_BASE_URL` unset so requests stay same-origin. The backend preserves its `/api/...` endpoints. The production database and report images must use Supabase PostgreSQL and its private Storage bucket; Vercel's filesystem is not persistent.

The root [.vercelignore](../.vercelignore) also excludes local databases, image files, environment files, and generated caches from Vercel uploads, including CLI-based deployments.

The Vercel Services documentation and configuration reference were checked against the current platform documentation:

- [Vercel Services](https://vercel.com/docs/services)
- [Service configuration reference](https://vercel.com/docs/services/config-reference)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- [`.vercelignore`](https://vercel.com/docs/deployments/vercel-ignore)

The current Functions request-body limit is 20 MiB; the app's image limit is 5 MiB.

## 1. Create and configure Supabase

1. Create a Supabase project and save its database password securely.
2. In the Supabase SQL editor, run these files in order:
   - `database/migrations/001_schema.sql`
   - `database/migrations/002_rls.sql`
   - `database/migrations/003_storage.sql`
3. Configure Auth email delivery. Add the final Vercel domain and `https://YOUR_DOMAIN/reset-password` to the Auth URL configuration's site and redirect URL allowlists.
4. Configure the app's public URL as `PUBLIC_APP_URL` when running the data migration below.
5. Copy the project URL, public anon key, legacy `service_role` key, and transaction-pooler PostgreSQL connection string from the Supabase dashboard. Keep the service-role key and database password private.
6. Supabase's asymmetric JWT signing keys are supported through its JWKS endpoint. If the project still uses legacy HS256 signing, also provide its legacy JWT secret as `SUPABASE_JWT_SECRET`.

The backend authenticates through Supabase Auth and reads profile roles from PostgreSQL. Supabase Storage remains private; the backend uses its server-only service-role key to upload images and issue signed URLs.

## 2. Migrate the existing local data before going live

The local database and image files are intentionally ignored by Git and were not altered. The local database currently contains 2 profiles, 2 reports, and 2 report-image records; the local storage folder contains 2 image files. A new Supabase project will not have those records until the migration is run.

The one-time migration script is [migrate_local_to_supabase.py](../backend/scripts/migrate_local_to_supabase.py). It:

- Requires the Supabase schema migrations above and empty destination application tables (the seeded institution row is allowed).
- Creates or reuses Supabase Auth users by email, imports their profiles and related report/workflow records, remapping profile IDs to Supabase Auth IDs.
- Does not copy local `dev_credentials` or password hashes. It assigns new random credentials and requests a password-reset email for each migrated profile. Users set their own passwords using the app's reset flow.
- Copies each stored image to the private bucket and verifies its local SHA-256 before upload.
- Leaves the local database and files intact. Do not remove them after migration; retain them as the source backup until production data has been verified.

Run the import during a maintenance window, before users start creating production records. Use the Supabase **transaction pooler** URL for `DATABASE_URL`; URL-encode special characters in the database password. PowerShell example, run from the `backend` directory:

```powershell
$env:SOURCE_DATABASE_URL = "sqlite:///./findmate.db"
$env:SOURCE_STORAGE_DIR = ".\storage"
$env:DATABASE_URL = "postgresql+psycopg2://USER:PASSWORD@POOLER_HOST:6543/postgres?sslmode=require"
$env:SUPABASE_URL = "https://PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "SERVER_ONLY_SERVICE_ROLE_KEY"
$env:SUPABASE_ANON_KEY = "PUBLIC_ANON_KEY"
$env:SUPABASE_STORAGE_BUCKET = "report-images"
$env:PUBLIC_APP_URL = "https://YOUR_VERCEL_DOMAIN"
python .\scripts\migrate_local_to_supabase.py --confirm
```

The command writes to Supabase and sends password-reset emails; `--confirm` is required. Ensure Supabase email delivery and the reset redirect allowlist are working first. If reset-email delivery fails, the script reports the count; fix Auth email delivery and users can request a link from **Forgot password**. The script refuses to import over existing application rows. If it stops, do not delete local files or clear a production database; investigate and reconcile before retrying.

Afterward, compare the imported counts with the script output and verify representative reports and image links in the application. Keep the local SQLite database and `backend/storage` backup until that validation is complete.

## 3. Add Vercel environment variables

Import the repository root as the Vercel project. Do not set the Vercel project's Root Directory to `frontend` or `backend`; the root `vercel.json` defines both service roots.

Add these variables to the Vercel **Production** environment. Add separate isolated credentials for Preview deployments if previews need to use the backend; do not point previews at production data by default.

### Backend service

| Variable | Required | Value/source |
| --- | --- | --- |
| `APP_ENV` | Yes | `production` |
| `AUTH_MODE` | Yes | `supabase` |
| `DATABASE_URL` | Yes | Supabase PostgreSQL transaction-pooler URI, using `postgresql+psycopg2://` |
| `STORAGE_BACKEND` | Yes | `supabase` |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase legacy `service_role` key; server-only |
| `SUPABASE_STORAGE_BUCKET` | Recommended | `report-images` (created by migration 003) |
| `SUPABASE_JWT_SECRET` | Conditional | Required only when Supabase Auth uses legacy HS256 signing; leave unset when using supported asymmetric signing keys |
| `ADMIN_EMAILS` | Recommended | Comma-separated bootstrap admin email addresses for new sign-ins; imported profile roles are retained |
| `CORS_ORIGINS` | Optional | Comma-separated allowed browser origins; same-origin requests do not need CORS |

Optional tuning variables and their defaults are `SIGNED_URL_TTL_SECONDS=600`, `MAX_UPLOAD_BYTES=5242880`, `EMBEDDING_BACKEND=none`, `OPENCLIP_MODEL=ViT-B-32`, `OPENCLIP_PRETRAINED=laion2b_s34b_b79k`, `MATCH_THRESHOLD=35`, `AGENT_TIMEOUT_SECONDS=10`, `AGENT_MAX_RETRIES=1`, and `RATE_LIMIT_ENABLED=true`. Do not enable OpenCLIP on Vercel without validating the function bundle and memory limits. The current rate limiter is process-local, so it is best-effort rather than global when functions scale.

`LOCAL_STORAGE_DIR` is local-development only. Production startup rejects SQLite, local auth, or local file storage.

### Frontend service

| Variable | Required | Value/source |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Same Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase public anon/publishable key; safe to expose in the browser |
| `VITE_API_BASE_URL` | No | Leave unset for same-origin `/api` routing |

Never put `SUPABASE_SERVICE_ROLE_KEY`, database credentials, or JWT secrets in a `VITE_` variable. Vite embeds `VITE_` variables in public browser assets.

### Migration/local/test-only variables

These are not needed by the deployed services:

- `SOURCE_DATABASE_URL` and `SOURCE_STORAGE_DIR`: local migration source; default to the local SQLite file and `.\storage`.
- `SUPABASE_ANON_KEY` and `PUBLIC_APP_URL`: migration script email-reset request and redirect.
- `VITE_API_PROXY`: optional local Vite proxy target.
- `TEST_DATABASE_URL` and `PW_CHROMIUM_PATH`: optional test configuration.
- `BACKEND_URL`: optional `scripts/verify_supabase.py` backend URL (defaults to `http://127.0.0.1:8000`).
- `TEST_EMAIL` and `TEST_PASSWORD`: optional existing confirmed test account for `verify_supabase.py`; use only in staging/throwaway projects.

## 4. Deploy the one Vercel project

1. Import the GitHub repository into Vercel once, using the repository root.
2. Confirm the deployment recognizes the `frontend` Vite service and `backend` FastAPI service from `vercel.json`.
3. Add the environment variables above, run the data migration, and only then deploy production.
4. On the resulting single deployment URL, verify:
   - `/` loads and client-side routes such as `/login`, `/map`, and `/reports` return the SPA.
   - `/api/...` reaches FastAPI (for example, try an unauthenticated protected endpoint and confirm it returns an API 401, not an HTML page).
   - Supabase sign-in, migrated profile roles, report listing, image uploads, private signed image URLs, and report persistence work.
5. Set the Supabase Auth site URL/redirect allowlist to the final Vercel domain. Test signup, forgot-password, and `/reset-password` on that domain.

Vercel Services are Beta. If the Vercel dashboard does not expose Services for the project, do not split this configuration into two projects; resolve the platform/account availability first.

## Troubleshooting

- **Build fails at root:** Keep the Vercel project Root Directory at the repository root. Service roots are in `vercel.json`.
- **API routes return the SPA:** Check the top-level `/api/(.*)` rewrite and the backend service build logs.
- **React Router paths return 404:** Check the frontend service rewrite to `/index.html`.
- **Production fails at startup:** Confirm all required backend values are set in the Production environment. SQLite and local storage are deliberately rejected.
- **JWTs fail after login:** Confirm `SUPABASE_URL`, Auth issuer/project, audience `authenticated`, and signing mode. Set `SUPABASE_JWT_SECRET` only for legacy HS256; asymmetric keys are fetched from the project's JWKS endpoint.
- **Images fail:** Confirm migration 003 ran, bucket name is `report-images`, service-role key is server-only and valid, and upload limit is at most 5 MiB.
- **Password reset does not arrive:** Configure Supabase Auth SMTP/email templates and allow the deployed `/reset-password` URL.
- **Database connection exhaustion/latency:** Use the transaction pooler and set the Vercel function region near the Supabase database region.
- **Preview uses production records:** Remove production database/storage secrets from Preview and configure an isolated test project.
