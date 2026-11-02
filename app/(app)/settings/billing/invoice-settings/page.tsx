"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useInvoiceDetails, useSaveInvoiceDetails } from "@/hooks/use-invoice-details";
import { INVOICE_FIELDS, type InvoiceDetails } from "@/lib/billing/invoice-details";
import { countries } from "@/lib/countries";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

// Settings → Billing → Invoice Settings (decided directly, 2 Nov 2026): the
// details on this workspace's invoices, edited here and saved to Paddle,
// which prints the invoices. Frank keeps no copy. Admins and Owners only,
// like the other billing pages.
export default function InvoiceSettingsPage() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const isAdmin = me?.client_id === null && seesAllClients(me?.role);
  const { data, isLoading, error } = useInvoiceDetails(isAdmin ? agency?.agencyId : undefined);

  return (
    <div className="pad narrow">
      <SettingsHead title="Invoice Settings" description="The details printed on your invoices." />
      {me && !isAdmin && <p className="sub">Only Admins and Owners can see billing.</p>}
      {isAdmin && isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't read your invoice details")}</p>}
      {data && !data.live && (
        <p className="sub">
          {agency?.name} isn&rsquo;t paying through Paddle, so there are no invoices to set up. When you choose a plan, the
          details you give at checkout appear here. <Link href="/settings/billing/plans">See the plans</Link>.
        </p>
      )}
      {data?.live && <InvoiceForm agencyId={agency?.agencyId} email={data.email} saved={data.details} />}
    </div>
  );
}

const same = (a: InvoiceDetails, b: InvoiceDetails) => INVOICE_FIELDS.every((k) => a[k] === b[k]);

// Mounts once Paddle's details have loaded, so its state starts from them.
function InvoiceForm({ agencyId, email, saved }: { agencyId: string | undefined; email: string; saved: InvoiceDetails }) {
  const [form, setForm] = useState(saved);
  const save = useSaveInvoiceDetails(agencyId);
  const countryList = useMemo(() => countries(), []);
  const dirty = !same(form, saved);
  const set = (k: keyof InvoiceDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    save.reset();
  };
  const field = (k: keyof InvoiceDetails, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="brow">
      <div className="brow-h">
        <b>
          <label htmlFor={`inv-${k}`}>{label}</label>
        </b>
      </div>
      <input id={`inv-${k}`} className="bin one" value={form[k]} onChange={set(k)} {...extra} />
    </div>
  );

  return (
    <form
      className="panel invform"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(form, { onSuccess: (s) => s.live && setForm(s.details) });
      }}
    >
      <div className="panel-h">
        <b>Billed To</b>
      </div>
      <div className="bsec">
        {field("contactName", "Contact Name", { autoComplete: "name" })}
        <p className="sub">Invoices and receipts are emailed to {email}.</p>
      </div>
      <div className="bsec">
        {field("companyName", "Company Name", { autoComplete: "organization" })}
        {field("taxNumber", "GST or VAT Number", { placeholder: "e.g. 27AAPFU0939F1ZV" })}
        <p className="sub">Leave the company blank to be invoiced as a person.</p>
      </div>
      <div className="bsec">
        {field("firstLine", "Address", { autoComplete: "address-line1" })}
        {field("secondLine", "Address Line 2", { autoComplete: "address-line2" })}
        <div className="invgrid">
          {field("city", "City", { autoComplete: "address-level2" })}
          {field("region", "State or Region", { autoComplete: "address-level1" })}
          {field("postalCode", "Postcode", { autoComplete: "postal-code" })}
          <div className="brow">
            <div className="brow-h">
              <b>
                <label htmlFor="inv-countryCode">Country</label>
              </b>
            </div>
            <select id="inv-countryCode" className="bin one" value={form.countryCode} onChange={set("countryCode")}>
              {countryList.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="sub">Changing the country can change the tax on your next invoice.</p>
      </div>
      <div className="bfoot">
        <button type="submit" className="btn primary sm" disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {save.isSuccess && !dirty && <span className="bsaved">Saved. Your next invoice uses these details.</span>}
        {save.error && <span className="berr">{errorMessage(save.error, "Couldn't save")}</span>}
      </div>
    </form>
  );
}
