import { test as base, expect, type Page, type Browser } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export { expect };
export const fixture = (n: string) => path.join(here, "fixtures", n);

// 1x1 transparent PNG so map tiles never depend on the internet.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    await page.route("**/tile.openstreetmap.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
    await use(errors);
  },
});

let n = 0;
export const uniqueEmail = (p = "user") => `${p}${Date.now()}${n++}@example.com`;
export const PASSWORD = "Passw0rd!test";

export async function signup(page: Page, email: string, name: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function newUser(browser: Browser, name: string, prefix = "u") {
  const ctx = await browser.newContext({ baseURL: "http://localhost:5173" });
  const page = await ctx.newPage();
  await page.route("**/tile.openstreetmap.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  const email = uniqueEmail(prefix);
  await signup(page, email, name);
  return { ctx, page, email };
}

export interface ReportInput { category?: string; title: string; description: string; color?: string; brand?: string; location: string; image?: string; clues?: string; q1?: string }

export async function fillReport(page: Page, kind: "lost" | "found", r: ReportInput) {
  await page.goto(`/report/${kind}`);
  await page.getByLabel("Item name").fill(r.title);
  await page.getByLabel("Category").selectOption(r.category ?? "bags");
  await page.getByLabel("Description").fill(r.description);
  if (r.color) await page.getByLabel("Colour").fill(r.color);
  if (r.brand) await page.getByLabel("Brand").fill(r.brand);
  if (r.image) await page.getByTestId("image-input").setInputFiles(r.image);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(kind === "lost" ? "Last seen location" : "Where did you find it?").fill(r.location);
  if (kind === "found" && r.clues) await page.getByLabel("Identifying details you noticed").fill(r.clues);
  if (kind === "found" && r.q1) await page.getByLabel("Question 1 for a claimant (optional)").fill(r.q1);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function submitReport(page: Page, kind: "lost" | "found", r: ReportInput) {
  await fillReport(page, kind, r);
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByTestId("report-success")).toBeVisible();
}

export const BOTTLE_LOST: ReportInput = { title: "Blue steel water bottle", description: "Blue steel water bottle with a dent near the base and a football sticker", color: "blue", brand: "Milton", location: "Main library", image: fixture("bottle.png") };
export const BOTTLE_FOUND: ReportInput = { title: "Blue metal bottle", description: "Blue steel bottle with football sticker and a small dent at the bottom", color: "blue", brand: "Milton", location: "Main library", image: fixture("bottle.png"), clues: "Initials R.K. scratched under the lid", q1: "What is scratched under the lid?" };
