# Test report

Every result below was produced by actually running the suite in this environment (Nov 2026).

| Suite | Command | Result |
|---|---|---|
| Backend (Pytest) | `cd backend && python3 -m pytest -q` | 61 passed (incl. 9 new: synonyms, CLIP calibration/fallback, Learning Agent, admin-only endpoints) |
| Frontend unit (Vitest) | `cd frontend && npm test` | 13 passed |
| Typecheck + production build | `npx tsc -b && npm run build` | clean |
| End to end (Playwright, Chromium) | `cd frontend && npm run e2e` | 25 passed (23 desktop, 2 mobile/Pixel 7) |

E2E runs against the real FastAPI backend (fresh SQLite DB) and the Vite app, with real uploads and no mocked data, except where a test deliberately injects a failure.

## Requested flows
| Test | Covered by | Status |
|---|---|---|
| 1 New user, session persistence | 01-auth | Pass (email verification not testable: local auth) |
| 2 Lost report + image + persistence | 02-reports | Pass |
| 3 Found report + image + persistence | 02-reports | Pass |
| 4 Matching, score, explanation, no duplicates | 03-matching | Pass |
| 5 Verification approve / reject | 03-matching | Pass |
| 6 Notifications create + mark read | 03-matching | Pass |
| 7 Permissions, admin routes, moderation | 04-permissions-admin | Pass |
| 8 Mobile layout, forms, nav, modal, upload | 06-mobile | Pass |
| 9 Errors: empty forms, bad files, 500, offline, expired session | 05-errors | Pass |
| 10 Persistence after logout/login | 03-matching | Pass |

Also: every main page and sidebar link loads with zero console errors (07).

## Bugs found by these tests and fixed
- Wizard: the Continue and Submit buttons shared one DOM node, so moving to Review also submitted the report. Fixed with keys; Enter now advances instead of submitting.
- Wizard: default time of 12:00 was in the future when reporting before noon, so the server rejected the report. Timestamps are now clamped to now (regression test added).
- Sidebar title-cased the email address.

## Added in the second pass
- Admin "Matching" tab (Learning Agent proposal, apply/reset with confirmation) is covered by e2e and Pytest.
- Bundle split into leaflet/supabase chunks; main chunk 486 kB, no size warning.

## Not tested (needs credentials or an external service)
- **`scripts/verify_supabase.py` was written but never run.**
- **OpenCLIP with real weights** (Hugging Face unreachable here). Tested only with synthetic vectors and the fallback path.
- Supabase Auth (email verification, password reset emails), Supabase Storage, and Postgres with RLS policies. Migrations are written but were not applied to a real Supabase project.
- Expired-session behaviour was simulated with a 401, not a real Supabase token expiry.
- "Unavailable AI service" is covered by backend Pytest agent-failure tests and an e2e check that submission still works; OpenCLIP is not integrated, so no real model outage can occur.
- Rate limiting is covered in Pytest only (disabled in e2e).
- Only Chromium was used; no Safari/Firefox runs.
