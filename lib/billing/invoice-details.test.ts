// Run with: node --experimental-strip-types --test lib/billing/invoice-details.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanInvoiceDetails, paddleFieldMessage } from "./invoice-details.ts";
import { countries } from "../countries.ts";

const base = { contactName: " Raj Rana ", companyName: "No Fluff", taxNumber: "27 AAPFU 0939F1ZV", countryCode: "in", postalCode: "400050" };

test("trims, upper-cases the country, takes the spaces out of the tax number, fills the rest", () => {
  const r = cleanInvoiceDetails(base);
  assert.ok("details" in r);
  assert.equal(r.details.contactName, "Raj Rana");
  assert.equal(r.details.countryCode, "IN");
  assert.equal(r.details.taxNumber, "27AAPFU0939F1ZV");
  assert.equal(r.details.city, "");
});

test("refuses no country, a tax number with no company, and anything not a string", () => {
  assert.deepEqual(cleanInvoiceDetails({ ...base, countryCode: "" }), { error: "Choose a country." });
  assert.deepEqual(cleanInvoiceDetails({ ...base, companyName: "" }), { error: "Add the company name the GST or VAT number belongs to." });
  assert.deepEqual(cleanInvoiceDetails({ ...base, city: 4 }), { error: "Bad request" });
  assert.deepEqual(cleanInvoiceDetails(null), { error: "Bad request" });
});

test("Paddle's refused fields in the form's words", () => {
  assert.equal(paddleFieldMessage([{ field: "tax_identifier", message: "invalid format" }]), "GST or VAT number: invalid format.");
  assert.equal(paddleFieldMessage([]), null);
});

test("countries: named by the browser, sorted, India among them", () => {
  const list = countries();
  assert.ok(list.length > 240);
  assert.equal(list.find((c) => c.code === "IN")?.name, "India");
  assert.equal(list.find((c) => c.code === "GB")?.name, "United Kingdom");
  assert.ok(list.every((c, i) => i === 0 || list[i - 1].name.localeCompare(c.name) <= 0));
});
