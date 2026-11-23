import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// A carousel from a PDF (direct instruction): dropped on the slides, each
// page becomes a slide, the slide count following the pages; more pages
// than the post takes is refused, saying why.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A plain PDF of `pages` square pages, each filled with its own colour.
function pdf(pages: number) {
  const objects: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  for (let i = 0; i < pages; i++) {
    const g = ((i * 37) % 100) / 100;
    const content = `${g.toFixed(2)} 0.3 0.6 rg 0 0 600 600 re f`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 600] /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name: "deck.pdf", mimeType: "application/pdf", buffer: Buffer.from(out, "latin1") };
}

async function openContent(page: import("@playwright/test").Page, creativeId: string) {
  await page.goto(`${APP_URL}/creatives/${creativeId}`);
  await page.locator(".btn.primary", { hasText: /^Edit$/ }).click();
  await page.getByRole("tab", { name: "Content" }).click();
  await page.getByRole("button", { name: "Add New Version" }).click();
}

test("a PDF's pages become a LinkedIn carousel's slides, the count following the pages", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await admin.from("creatives").update({ format: "li_doc", formats: ["li_doc"], slide_count: 2 }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await openContent(page, frank.creativeId);
  await expect(page.getByText("Or drop a PDF: each page becomes a slide.", { exact: false })).toBeVisible();

  await page.locator('input[aria-label="Slide files"]').setInputFiles(pdf(3));
  await expect(page.locator('.cslots[aria-label="Slides"] .cslot.filled')).toHaveCount(3, { timeout: 30_000 });
  await page.getByRole("button", { name: "Save Creative V1" }).click();
  await expect(page.getByText("Saved as version 1.")).toBeVisible({ timeout: 30_000 });

  // The post now has three slides, and version 1 is the three pages.
  await expect.poll(async () => (await admin.from("creatives").select("slide_count").eq("id", frank.creativeId).single()).data?.slide_count).toBe(3);
  const version = (await admin.from("creative_versions").select("id").eq("creative_id", frank.creativeId).order("version_no", { ascending: false }).limit(1).single()).data!;
  const slides = (await admin.from("creative_version_slides").select("position, asset:assets(filename, mime_type)").eq("creative_version_id", version.id).order("position")).data!;
  expect(slides.map((s) => (s.asset as unknown as { filename: string }).filename)).toEqual(["deck-page-1.jpg", "deck-page-2.jpg", "deck-page-3.jpg"]);
  expect(slides.every((s) => (s.asset as unknown as { mime_type: string }).mime_type === "image/jpeg")).toBe(true);
});

test("a PDF with more pages than the carousel takes is refused, saying why", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("creatives").update({ format: "meta_carousel", formats: ["meta_carousel"], slide_count: 3 }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await openContent(page, frank.creativeId);
  await page.locator('input[aria-label="Slide files"]').setInputFiles(pdf(11));
  await expect(page.getByText("This PDF has 11 pages, and this carousel takes up to 10 slides. Nothing was added.")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.cslots[aria-label="Slides"] .cslot.filled')).toHaveCount(0);
  expect((await admin.from("creatives").select("slide_count").eq("id", frank.creativeId).single()).data?.slide_count).toBe(3);
});
