import { expect, fillReport, fixture, newUser, submitReport, test, type ReportInput } from "./helpers";

const LOST: ReportInput = { category: "clothing", title: "Grey hoodie with zip", description: "Grey zip-up hoodie, size M, torn left pocket and a small ink stain", color: "grey", brand: "Roadster", location: "Sports complex pavilion", image: fixture("red.jpg") };
const FOUND: ReportInput = { category: "keys", title: "Key bunch with green tag", description: "Three brass keys on a ring with a green plastic tag and a bottle opener", color: "green", location: "Admin block canteen", image: fixture("bottle.png"), clues: "Hostel room number 214 on the tag", q1: "What number is written on the tag?" };

test.describe("TEST 2 & 3 — lost and found reports persist", () => {
  test("lost report with image: preview, submit, My Reports, refresh", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Lena Lost");
    await fillReport(page, "lost", LOST);
    await expect(page.getByTestId("review-step")).toContainText("Grey hoodie with zip");
    await expect(page.getByTestId("review-step").getByRole("img", { name: "Item" })).toBeVisible();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByTestId("report-success")).toBeVisible();

    await page.goto("/reports");
    const row = page.getByTestId("report-row").filter({ hasText: "Grey hoodie with zip" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("open");
    await page.reload();
    await expect(page.getByTestId("report-row").filter({ hasText: "Grey hoodie with zip" })).toHaveCount(1);
    await expect(row.getByRole("img")).toBeVisible(); // signed image URL works after refresh
    await ctx.close();
  });

  test("found report keeps private clues out of the public view", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Finn Finder");
    await submitReport(page, "found", FOUND);
    await page.goto("/reports");
    await page.getByRole("link", { name: "Key bunch with green tag", exact: true }).click();
    await expect(page.getByText("Private clues (only you and reviewers see this)")).toBeVisible();
    await expect(page.getByText("Hostel room number 214 on the tag")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Hostel room number 214 on the tag")).toBeVisible();
    await ctx.close();
  });

  test("steps can go back, drafts are saved, edit and delete (with confirmation)", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Dina Draft");
    await page.goto("/report/lost");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Give the item a short name (at least 3 characters).")).toBeVisible();
    await expect(page.getByText("Choose a category.")).toBeVisible();

    await page.getByLabel("Item name").fill("Silver bracelet");
    await page.getByLabel("Category").selectOption("accessories");
    await page.getByLabel("Description").fill("Thin silver bracelet with a heart charm");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByLabel("Item name")).toHaveValue("Silver bracelet");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    const row = page.getByTestId("report-row").filter({ hasText: "Silver bracelet" });
    await expect(row).toContainText("draft");
    await row.getByRole("link", { name: "Continue draft" }).click();
    await expect(page.getByLabel("Item name")).toHaveValue("Silver bracelet");

    // finish it
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Last seen location").fill("Seminar hall 3");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByTestId("report-success")).toBeVisible();

    // edit an open report
    await page.goto("/reports");
    await page.getByRole("link", { name: "Edit Silver bracelet" }).click();
    await page.getByLabel("Item name").fill("Silver charm bracelet");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Silver charm bracelet" })).toBeVisible();

    // close and reopen
    await page.getByRole("button", { name: "Close report" }).click();
    await expect(page.getByText("closed", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByText("open", { exact: true }).first()).toBeVisible();

    // delete needs confirmation
    await page.goto("/reports");
    await page.getByRole("button", { name: "Delete Silver charm bracelet" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("report-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Delete Silver charm bracelet" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete report" }).click();
    await expect(page.getByTestId("report-row")).toHaveCount(0);
    await expect(page.getByText("You haven't reported anything yet")).toBeVisible();
    await ctx.close();
  });
});
