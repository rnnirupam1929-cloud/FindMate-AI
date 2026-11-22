import { expect, BOTTLE_FOUND, BOTTLE_LOST, login, newUser, PASSWORD, submitReport, test } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

test.describe.serial("TEST 4, 5, 6, 10 — matching, verification, notifications, persistence", () => {
  let owner: { ctx: BrowserContext; page: Page; email: string };
  let finder: { ctx: BrowserContext; page: Page; email: string };

  test.beforeAll(async ({ browser }) => {
    owner = await newUser(browser, "Olivia Owner", "owner");
    finder = await newUser(browser, "Felix Finder", "finder");
  });
  test.afterAll(async () => { await owner.ctx.close(); await finder.ctx.close(); });

  test("matching engine produces one explained match and no duplicates", async () => {
    await submitReport(owner.page, "lost", BOTTLE_LOST);
    await submitReport(finder.page, "found", BOTTLE_FOUND);
    await expect(finder.page.getByTestId("report-success")).toContainText("possible match");

    await owner.page.goto("/matches");
    const cards = owner.page.getByTestId("match-card");
    await expect(cards).toHaveCount(1);
    const score = await cards.first().getByLabel(/Match score/).getAttribute("aria-label");
    expect(Number(score!.match(/\d+/)![0])).toBeGreaterThanOrEqual(35);
    await cards.first().getByText("Why this was suggested").click();
    await expect(cards.first().getByText(/Same category/)).toBeVisible();
    await expect(cards.first().getByText("A match score is a lead, not proof of ownership.")).toBeVisible();

    // editing the lost report re-runs matching; the pair must not be duplicated
    await owner.page.goto("/reports");
    await owner.page.getByRole("link", { name: "Edit Blue steel water bottle" }).click();
    await owner.page.getByRole("button", { name: "Continue" }).click();
    await owner.page.getByLabel("Additional details").fill("Has a faded name label");
    await owner.page.getByRole("button", { name: "Continue" }).click();
    await owner.page.getByRole("button", { name: "Save changes" }).click();
    await expect(owner.page.getByRole("heading", { name: "Blue steel water bottle" })).toBeVisible();
    await owner.page.goto("/matches");
    await expect(owner.page.getByTestId("match-card")).toHaveCount(1);

    // the finder sees the same match from the other side, but cannot start a claim
    await finder.page.goto("/matches");
    await expect(finder.page.getByTestId("match-card")).toHaveCount(1);
    await expect(finder.page.getByRole("button", { name: /This is mine/ })).toHaveCount(0);
  });

  test("ownership verification: private clue stays hidden until a human approves", async () => {
    const { page: o } = owner;
    const { page: f } = finder;
    await o.goto("/matches");
    await o.getByRole("button", { name: /This is mine/ }).click();
    await expect(o).toHaveURL(/\/verifications\/.+/);
    await expect(o.getByLabel("What is scratched under the lid?")).toBeVisible();
    await expect(o.locator("body")).not.toContainText("R.K. scratched"); // finder's private clue is never shown to the claimant
    await expect(o.getByRole("button", { name: "Approve claim" })).toHaveCount(0);

    await o.getByRole("button", { name: "Submit answers for review" }).click();
    await expect(o.getByText("Please answer this question (at least 2 characters).")).toBeVisible();
    await o.getByLabel("What is scratched under the lid?").fill("The initials R.K.");
    await o.getByRole("button", { name: "Submit answers for review" }).click();
    await expect(o.getByText("Your answers were sent.")).toBeVisible();

    // finder reviews: sees clue + answer, and a person must press Approve
    await f.goto("/verifications");
    await f.getByTestId("verification-list").getByRole("link").first().click();
    await expect(f.getByText("Initials R.K. scratched under the lid")).toBeVisible();
    await expect(f.getByText("The initials R.K.")).toBeVisible();
    await f.getByRole("button", { name: "Approve claim" }).click();
    await f.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
    await expect(f.getByText("Claim approved. Time to arrange a safe handover.")).toBeVisible();

    await f.getByRole("button", { name: "Record handover" }).click();
    await f.getByRole("dialog").getByRole("button", { name: "Record handover" }).click();
    await expect(f.getByText("Recovery completed. The item has been returned.")).toBeVisible();

    await o.reload();
    await expect(o.getByText("Recovery completed. The item has been returned.")).toBeVisible();
    await o.goto("/reports");
    await expect(o.getByTestId("report-row").first()).toContainText("recovered");
  });

  test("a rejected claim is dismissed and explained", async ({ browser }) => {
    const a = await newUser(browser, "Rita Reject", "rej-owner");
    const b = await newUser(browser, "Ben Reviewer", "rej-finder");
    const lost = { ...BOTTLE_LOST, category: "electronics", title: "Black wireless earbuds case", description: "Black wireless earbuds charging case with a cracked lid and a blue lanyard", color: "black", brand: "Boat", location: "Block C lab 4", image: undefined };
    const found = { ...BOTTLE_FOUND, category: "electronics", title: "Earbuds charging case", description: "Black earbud charging case with cracked lid and blue lanyard", color: "black", brand: "Boat", location: "Block C lab 4", image: undefined, clues: "Left earbud is missing", q1: "Which earbud is missing?" };
    await submitReport(a.page, "lost", lost);
    await submitReport(b.page, "found", found);
    await a.page.goto("/matches");
    await a.page.getByRole("button", { name: /This is mine/ }).click();
    await a.page.getByLabel("Which earbud is missing?").fill("The right one");
    await a.page.getByRole("button", { name: "Submit answers for review" }).click();
    await b.page.goto("/verifications");
    await b.page.getByTestId("verification-list").getByRole("link").first().click();
    await b.page.getByLabel("Note for the claimant (optional)").fill("The missing earbud does not match.");
    await b.page.getByRole("button", { name: "Reject claim" }).click();
    await b.page.getByRole("dialog").getByRole("button", { name: "Reject", exact: true }).click();
    await expect(b.page.getByText("This claim was not approved.")).toBeVisible();
    await a.page.reload();
    await expect(a.page.getByText("This claim was not approved.")).toBeVisible();
    await expect(a.page.getByText("The missing earbud does not match.")).toBeVisible();
    await a.ctx.close(); await b.ctx.close();
  });

  test("TEST 6 notifications are created, unread-aware and can be marked read", async () => {
    const { page: f } = finder;
    await f.goto("/notifications");
    const list = f.getByTestId("notification-list");
    await expect(list.getByText("Someone is claiming your found item")).toBeVisible();
    const unreadBefore = await list.locator('[data-unread="true"]').count();
    expect(unreadBefore).toBeGreaterThan(0);
    await list.locator('[data-unread="true"]').first().getByRole("button", { name: /Mark .* as read/ }).click();
    await expect(list.locator('[data-unread="true"]')).toHaveCount(unreadBefore - 1);

    const { page: o } = owner;
    await o.goto("/notifications");
    await expect(o.getByText("Recovery completed").first()).toBeVisible();
    await o.getByRole("button", { name: "Mark all as read" }).click();
    await expect(o.getByText("0 unread")).toBeVisible();
    await o.getByLabel("Show unread only").check();
    await expect(o.getByText("You're all caught up")).toBeVisible();
  });

  test("TEST 10 everything persists after logout and login", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: "http://localhost:5173" });
    const page = await ctx.newPage();
    await login(page, owner.email);
    await page.goto("/reports");
    await expect(page.getByTestId("report-row").filter({ hasText: "Blue steel water bottle" })).toContainText("recovered");
    await page.goto("/matches?status=confirmed");
    await expect(page.getByTestId("match-card")).toHaveCount(1);
    await page.goto("/verifications");
    await expect(page.getByTestId("verification-list").getByText("completed")).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByText("Recovery completed").first()).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText("Blue steel water bottle").first()).toBeVisible();
    await expect(page.getByText(/returned/).first()).toBeVisible(); // recently recovered
    void PASSWORD;
    await ctx.close();
  });
});
