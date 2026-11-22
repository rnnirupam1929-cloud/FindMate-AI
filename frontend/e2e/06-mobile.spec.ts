import { devices } from "@playwright/test";
import { expect, fixture, newUser, test } from "./helpers";

test.describe("TEST 8 — mobile", () => {
  test("landing page: no horizontal scroll, menu works, CTAs reachable", async ({ page, errors }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("banner").getByRole("link", { name: "FAQ" }).click();
    await expect(page.getByRole("heading", { name: "Questions" })).toBeInViewport();
    await page.getByText("Does a high score mean the item is mine?").click();
    await expect(page.getByText("A score is only a lead")).not.toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("signed-in app: mobile nav, report form with photo upload, modal", async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: "http://localhost:5173" });
    const page = await ctx.newPage();
    const { signup, uniqueEmail } = await import("./helpers");
    await signup(page, uniqueEmail("mob"), "Mo Bile");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator("#mobile-menu").getByRole("link", { name: "Report lost item" }).click();
    await expect(page).toHaveURL(/\/report\/lost/);
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await page.getByLabel("Item name").fill("Mobile test umbrella");
    await page.getByLabel("Category").selectOption("accessories");
    await page.getByLabel("Description").fill("Black foldable umbrella with a wooden handle");
    await page.getByTestId("image-input").setInputFiles(fixture("red.jpg"));
    await expect(page.getByTestId("image-preview")).toHaveCount(1);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Last seen location").fill("Bus stop");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByTestId("report-success")).toBeVisible();

    await page.goto("/reports");
    await page.getByRole("button", { name: "Delete Mobile test umbrella" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(412);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctx.close();
    void newUser;
  });
});
