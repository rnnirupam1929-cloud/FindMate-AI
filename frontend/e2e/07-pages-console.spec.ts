import { expect, newUser, test } from "./helpers";

test("every main page loads for a signed-in user with no console errors and no dead links", async ({ browser }) => {
  const { ctx, page } = await newUser(browser, "Pat Pages");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const routes: [string, string][] = [
    ["/dashboard", "Welcome, Pat"], ["/reports", "My reports"], ["/matches", "Possible matches"], ["/verifications", "Verifications"],
    ["/map", "Campus map"], ["/notifications", "Notifications"], ["/report/lost", "Report a lost item"], ["/report/found", "Report a found item"],
  ];
  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  // sidebar navigation: every link leads somewhere that renders
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dashboard");
  await expect(page.locator("aside nav a").first()).toBeVisible();
  const hrefs = await page.locator("aside nav a").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThanOrEqual(8);
  for (const h of hrefs) {
    await page.goto(h);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  // map renders tiles container and an approved legend toggle
  await page.goto("/map");
  await expect(page.getByTestId("map")).toBeVisible();
  await page.getByRole("button", { name: "Lost" }).click();
  expect(errors, errors.join("\n")).toEqual([]);
  await ctx.close();
});

test("landing page sections, anchors and CTAs work", async ({ page }) => {
  await page.goto("/");
  for (const id of ["how", "safety", "faq"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.getByTestId("stat-Reports filed")).toBeVisible();
  await page.getByRole("link", { name: "Report Lost Item" }).first().click();
  await expect(page).toHaveURL(/\/login/); // signed out: asked to log in first
  await page.goto("/");
  await page.getByRole("link", { name: "I Found Something" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});
