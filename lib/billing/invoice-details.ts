// Settings → Billing → Invoice Settings (decided directly, 2 Nov 2026): the
// details Paddle prints on a workspace's invoices, edited in Frank and
// saved to Paddle, which keeps them. Frank stores none of them: the contact
// is Paddle's customer name, the address the subscription's address, and the
// company and GST or VAT number the subscription's business.

export interface InvoiceDetails {
  contactName: string;
  companyName: string;
  taxNumber: string;
  firstLine: string;
  secondLine: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
}

export const INVOICE_FIELDS: (keyof InvoiceDetails)[] = [
  "contactName",
  "companyName",
  "taxNumber",
  "firstLine",
  "secondLine",
  "city",
  "region",
  "postalCode",
  "countryCode",
];

// What the form sent, trimmed, or what's wrong with it.
export function cleanInvoiceDetails(input: unknown): { details: InvoiceDetails } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Bad request" };
  const raw = input as Record<string, unknown>;
  const out = {} as InvoiceDetails;
  for (const k of INVOICE_FIELDS) {
    const v = raw[k] ?? "";
    if (typeof v !== "string") return { error: "Bad request" };
    out[k] = v.trim();
  }
  out.countryCode = out.countryCode.toUpperCase();
  out.taxNumber = out.taxNumber.replace(/\s+/g, "");
  if (!/^[A-Z]{2}$/.test(out.countryCode)) return { error: "Choose a country." };
  if (out.taxNumber && !out.companyName) return { error: "Add the company name the GST or VAT number belongs to." };
  return { details: out };
}

// Paddle's field names, in the form's words.
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  tax_identifier: "GST or VAT number",
  first_line: "Address",
  second_line: "Address line 2",
  city: "City",
  region: "State or region",
  postal_code: "Postcode",
  country_code: "Country",
};

export function paddleFieldMessage(fields: { field: string; message: string }[]): string | null {
  if (!fields.length) return null;
  return fields
    .map((f) => {
      const label = FIELD_LABELS[f.field.split(".").pop() ?? ""] ?? f.field;
      return `${label}: ${f.message}`;
    })
    .join(". ")
    .concat(".");
}
