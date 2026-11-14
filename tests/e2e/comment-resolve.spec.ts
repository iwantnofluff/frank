import { test, expect } from "./fixtures";

// Regression coverage for CommentCard's Resolve/Reopen gate: verified
// empirically against real authenticated sessions that comments_update_own
// (supabase/seed.sql) allows author_id = auth.uid() OR is_agency_staff —
// authorship, not role — so a client resolving their own thread succeeds
// at the database layer even though they aren't staff. The UI condition
// is isStaff || thread.author_id === currentUserId, matching that exactly
// (and matching the prototype, which only gates Make Public/Private
// behind MODE==="client", not Resolve/Reopen).

test("a client can resolve and reopen a thread they authored", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".composer textarea");

  await page.fill(".composer textarea", "Client's own thread for the resolve test");
  await page.click(".composer button:has-text('Post')");

  const card = page.locator(".cmt", { hasText: "Client's own thread for the resolve test" });
  await expect(card).toBeVisible();
  await expect(card).not.toHaveClass(/resolved/);

  await card.locator("button:has-text('Resolve')").click();
  await expect(card).toHaveClass(/resolved/);
  // Resolved: Reopen alone (direct instruction), in ink and not faded,
  // blue on hover; the words faded behind it.
  await expect(card.locator(".cmt-f .acts button")).toHaveText(["Reopen"]);
  const reopen = card.getByRole("button", { name: "Reopen" });
  const look = () =>
    reopen.evaluate((el) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return { color: getComputedStyle(el).color, opacity: o };
    });
  const ink = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("span"));
    probe.style.color = "var(--ink)";
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  // Away from it: Resolve was clicked where Reopen now sits.
  await page.mouse.move(0, 0);
  const atRest = await look();
  expect(atRest).toEqual({ color: ink, opacity: 1 });
  expect(await card.locator(".cbody").evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  await reopen.hover();
  await expect.poll(async () => (await look()).color).not.toBe(atRest.color);

  await reopen.click();
  await expect(card).not.toHaveClass(/resolved/);
});

test("a client cannot resolve a thread someone else authored", async ({ page, frank }) => {
  await frank.insertCommentAsStaff("Staff's own thread, not the client's", "public");

  await frank.loginAsClient(page);
  await page.goto(`/creatives/${frank.creativeId}`);

  const card = page.locator(".cmt", { hasText: "Staff's own thread, not the client's" });
  await expect(card).toBeVisible();
  await expect(card.locator("button:has-text('Resolve')")).toHaveCount(0);
  await expect(card.locator("button:has-text('Reopen')")).toHaveCount(0);
});
