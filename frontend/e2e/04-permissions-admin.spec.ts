import { expect, BOTTLE_FOUND, BOTTLE_LOST, newUser, signup, submitReport, test, uniqueEmail } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

const token = (p: Page) => p.evaluate(() => localStorage.getItem("findmate.dev.token"));
const api = async (p: Page, path: string, method = "GET") => p.request.fetch(`http://127.0.0.1:8000/api${path}`, { method, headers: { Authorization: `Bearer ${await token(p)}` } });

test.describe.serial("TEST 7 — permissions and admin", () => {
  let a: { ctx: BrowserContext; page: Page; email: string };
  let b: { ctx: BrowserContext; page: Page; email: string };
  let reportId = "";

  test.beforeAll(async ({ browser }) => {
    a = await newUser(browser, "Alice Private", "perm-a");
    b = await newUser(browser, "Bob Stranger", "perm-b");
    await submitReport(a.page, "lost", { category: "id_documents", title: "Student ID folder", description: "Maroon leather folder holding a student ID card and library card", color: "maroon", location: "Placement cell", });
    await a.page.goto("/reports");
    const href = await a.page.getByRole("link", { name: "Student ID folder", exact: true }).getAttribute("href");
    reportId = href!.split("/").pop()!;
  });
  test.afterAll(async () => { await a.ctx.close(); await b.ctx.close(); });

  test("another user cannot read, edit or delete my report, or see my verification", async () => {
    expect((await api(b.page, `/reports/${reportId}`)).status()).toBe(404);
    expect((await api(b.page, `/reports/${reportId}`, "DELETE")).status()).toBe(404);
    expect((await api(b.page, `/verifications/00000000-0000-0000-0000-000000000000`)).status()).toBe(404);
    expect((await api(a.page, `/reports/${reportId}`)).status()).toBe(200);
    // not in the other user's lists either
    const list = await (await api(b.page, "/reports")).json();
    expect(list.items).toHaveLength(0);
    // unauthenticated requests are rejected
    expect((await b.page.request.get("http://127.0.0.1:8000/api/reports")).status()).toBe(401);
  });

  test("normal users cannot use admin routes or admin APIs", async () => {
    await b.page.goto("/admin");
    await expect(b.page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
    await expect(b.page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    for (const p of ["/admin/stats", "/admin/users", "/admin/reports"]) expect((await api(b.page, p)).status()).toBe(403);
    expect((await api(b.page, `/admin/users/${reportId}`, "PATCH")).status()).toBeGreaterThanOrEqual(403);
  });

  test("flagging a suspicious match reaches the admin, who can hide the report", async ({ browser }) => {
    const finder = await newUser(browser, "Sketchy Finder", "perm-f");
    await submitReport(finder.page, "found", { category: "id_documents", title: "Maroon ID folder", description: "Maroon leather folder with a student ID card and a library card inside", color: "maroon", location: "Placement cell", clues: "Name on the card starts with A", q1: "What is the name on the ID?" });
    await a.page.goto("/matches");
    await a.page.getByRole("button", { name: "Report suspicious" }).click();
    await a.page.getByLabel("What looks suspicious?").fill("Seems like a fishing attempt");
    await a.page.getByRole("button", { name: "Send report" }).click();
    await expect(a.page.getByText("Thanks. Our moderators will review this.")).toBeVisible();

    const admin = await browser.newContext({ baseURL: "http://localhost:5173" });
    const ap = await admin.newPage();
    await signup(ap, "admin@example.com", "Site Admin");
    await ap.getByRole("link", { name: "Admin" }).first().click();
    await expect(ap.getByTestId("admin-stats")).toContainText("Users");
    await ap.getByRole("tab", { name: "Reports" }).click();
    const row = ap.getByTestId("admin-reports").getByRole("listitem").filter({ hasText: "Maroon ID folder" });
    await expect(row).toContainText("Seems like a fishing attempt");
    await row.getByRole("button", { name: "Hide" }).click();
    await expect(row).toContainText("hidden");

    await ap.getByRole("tab", { name: "Users" }).click();
    await expect(ap.getByTestId("admin-users")).toContainText("Bob Stranger");
    const bobRow = ap.getByTestId("admin-users").getByRole("listitem").filter({ hasText: "Bob Stranger" });
    await bobRow.getByRole("button", { name: "Suspend" }).click();
    await ap.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
    await expect(bobRow).toContainText("suspended");
    expect((await api(b.page, "/me")).status()).toBeGreaterThanOrEqual(401); // suspended users are locked out

    await ap.getByRole("tab", { name: "Institutions" }).click();
    await expect(ap.getByTestId("admin-institutions")).toContainText("Dayananda Sagar University");
    await ap.getByLabel(/^Name/).fill("Test Institute");
    await ap.getByLabel(/^Slug/).fill("test-institute");
    await ap.getByRole("button", { name: "Add institution" }).click();
    await expect(ap.getByTestId("admin-institutions")).toContainText("Test Institute");
    await admin.close(); await finder.ctx.close();
  });
});
void uniqueEmail;
