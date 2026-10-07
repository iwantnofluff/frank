import { createClient } from "@supabase/supabase-js";
import { test, APP_URL } from "./fixtures";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
test("al", async ({ page, frank }) => {
  test.setTimeout(120000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role: "primary_owner" }).eq("user_id", staffId);
  await admin.from("agencies").update({ plan: "growth" }).eq("id", frank.agencyId);
  await admin.from("agency_settings").delete().eq("agency_id", frank.agencyId);
  page.on("response", async (r) => { if (r.url().includes("agency_settings") && r.request().method() !== "GET") console.log("settings write:", r.request().method(), r.status(), (await r.text().catch(() => "")).slice(0, 160)); });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.waitForSelector(".hbrand-add");
  // A real 64x64 PNG made in the page.
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d")!; g.fillStyle = "#e35336"; g.fillRect(0, 0, 64, 64); return c.toDataURL("image/png").split(",")[1]; });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator(".hbrand-add").click()]);
  await chooser.setFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  const crop = page.locator(".scrim:not(.closing) .modal");
  await crop.waitFor();
  console.log("crop buttons:", (await crop.locator(".modal-f button").allInnerTexts()).join(" | "));
  await crop.locator(".modal-f .btn.primary").click();
  await page.waitForTimeout(4000);
  console.log("header now:", (await page.locator(".hbrand").innerText()).replace(/\s+/g, " "), "| img:", await page.locator("img.hbrand-agency").count());
});
