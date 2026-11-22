import { defineConfig, devices } from "@playwright/test";

const DB = "/tmp/findmate-e2e.db";
const backendEnv = [
  "APP_ENV=test", "AUTH_MODE=local", `DATABASE_URL=sqlite:///${DB}`, "STORAGE_BACKEND=local", "LOCAL_STORAGE_DIR=/tmp/findmate-e2e-storage",
  "RATE_LIMIT_ENABLED=false", "ADMIN_EMAILS=admin@example.com", "SUPABASE_JWT_SECRET=e2e-secret-e2e-secret-e2e-secret-1234",
].join(" ");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-report.json" }]],
  use: {
    baseURL: "http://localhost:5173", trace: "retain-on-failure", screenshot: "only-on-failure",
    // Optional: use a Chromium that is already installed (e.g. in a sandbox without download access).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", testIgnore: /06-mobile/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /06-mobile/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // Fresh database on every run; Postgres/Supabase is exercised separately (see docs).
      command: `rm -rf ${DB} /tmp/findmate-e2e-storage && cd ../backend && ${backendEnv} python3 -m uvicorn app.main:app --port 8000`,
      url: "http://127.0.0.1:8000/api/health", reuseExistingServer: false, timeout: 60_000,
    },
    { command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: false, timeout: 60_000 },
  ],
});
