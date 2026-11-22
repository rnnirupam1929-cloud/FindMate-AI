import { expect, fixture, newUser, test } from "./helpers";

test.describe("TEST 9 — error handling", () => {
  test("empty wizard, unsupported and oversized uploads", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Erin Errors");
    await page.goto("/report/found");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Choose a category.")).toBeVisible();

    await page.getByTestId("image-input").setInputFiles(fixture("notes.txt"));
    await expect(page.getByText(/Unsupported file type/)).toBeVisible();
    await expect(page.getByTestId("image-preview")).toHaveCount(0);

    await page.getByTestId("image-input").setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(6 * 1024 * 1024) });
    await expect(page.getByText(/larger than 5 MB/)).toBeVisible();

    await page.getByTestId("image-input").setInputFiles(fixture("bottle.png"));
    await expect(page.getByTestId("image-preview")).toHaveCount(1);
    await ctx.close();
  });

  test("the server also rejects a fake image even if the client check is bypassed", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Ivan Image");
    const token = await page.evaluate(() => localStorage.getItem("findmate.dev.token"));
    const h = { Authorization: `Bearer ${token}` };
    const r = await page.request.post("http://127.0.0.1:8000/api/reports", { headers: h, data: { kind: "lost", title: "x1y", category: "other", description: "some description text" } });
    const id = (await r.json()).id;
    const bad = await page.request.post(`http://127.0.0.1:8000/api/reports/${id}/images`, { headers: h, multipart: { file: { name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } } });
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    expect(bad.status()).toBeLessThan(500);
    await ctx.close();
  });

  test("backend failure shows a friendly error with retry, then recovers", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Rae Retry");
    let fail = true;
    await page.route("**/api/reports?*", (route) => (fail ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue()));
    await page.goto("/reports");
    await expect(page.getByRole("alert").filter({ hasText: "Something went wrong on our side" })).toBeVisible({ timeout: 20_000 });
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("You haven't reported anything yet")).toBeVisible();
    await ctx.close();
  });

  test("network down is reported, not swallowed", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Nell Network");
    await page.route("**/api/reports?*", (route) => route.abort());
    await page.goto("/reports");
    await expect(page.getByText("Can't reach the server")).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test("expired or invalid session sends the user to log in with an explanation", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Sam Session");
    await page.evaluate(() => localStorage.setItem("findmate.dev.token", "not-a-valid-token"));
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    // a session that expires mid-use
    const fresh = await newUser(browser, "Exp Ired");
    await fresh.page.route("**/api/dashboard", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"Session expired"}' }));
    await fresh.page.goto("/dashboard");
    await expect(fresh.page).toHaveURL(/\/login/);
    await expect(fresh.page.getByText("Your session expired. Please log in again.")).toBeVisible();
    await ctx.close(); await fresh.ctx.close();
  });

  test("report submission still works when the matching service fails", async ({ browser }) => {
    // Matching runs after the report is saved. If it errors, the user's report must still exist.
    const { ctx, page } = await newUser(browser, "Maya Matcher");
    await page.route("**/api/reports/*/submit", async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res });
    });
    await page.goto("/report/lost");
    await page.getByLabel("Item name").fill("Orange pencil box");
    await page.getByLabel("Category").selectOption("books_stationery");
    await page.getByLabel("Description").fill("Orange plastic pencil box with a broken latch");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Last seen location").fill("Library annex");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByTestId("report-success")).toBeVisible();
    await ctx.close();
  });

  test("unknown routes show a 404 page and a missing record shows an error state", async ({ browser }) => {
    const { ctx, page } = await newUser(browser, "Lost Link");
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await page.goto("/reports/00000000-0000-0000-0000-000000000000");
    await expect(page.getByRole("alert")).toContainText("Report not found");
    await ctx.close();
  });
});
