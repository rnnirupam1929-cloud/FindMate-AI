import { expect, login, PASSWORD, signup, test, uniqueEmail } from "./helpers";

test.describe("TEST 1 — new user, session persistence", () => {
  test("sign up, reach dashboard, survive refresh, log out and back in", async ({ page, errors }) => {
    const email = uniqueEmail("new");
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Lost something? Let AI find it." })).toBeVisible();
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/signup/);
    await signup(page, email, "Asha Rao");
    await expect(page.getByRole("heading", { name: "Welcome, Asha" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Welcome, Asha" })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/); // protected route

    await login(page, email);
    await expect(page.getByRole("heading", { name: "Welcome, Asha" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("validation and wrong credentials are explained", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password." })).toBeVisible();

    await page.goto("/signup");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Please enter your name.")).toBeVisible();
  });

  test("duplicate sign-up is rejected clearly", async ({ page }) => {
    const email = uniqueEmail("dup");
    await signup(page, email, "Dup User");
    await page.getByRole("button", { name: "Log out" }).first().click();
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Dup User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("An account with this email already exists.")).toBeVisible();
  });
});
