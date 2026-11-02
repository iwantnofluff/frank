"use client";

import { BillingPage } from "@/components/settings/BillingPage";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useDownloadInvoice, useInvoices, type Invoice } from "@/hooks/use-billing";
import { errorMessage } from "@/lib/errors";

// Settings → Billing → Invoices (decided directly, 2 Nov 2026): every
// invoice Paddle has issued the workspace, listed here, each PDF downloaded
// from Frank. Paddle still keeps them; there's no link to its portal here.
export default function InvoicesPage() {
  return (
    <BillingPage title="Invoices" description="Every invoice for your workspace.">
      <InvoiceList />
    </BillingPage>
  );
}

const STATUS: Record<Invoice["status"], string> = { paid: "Paid", due: "Due", overdue: "Overdue" };

const money = (minor: string, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(minor) / 100);
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

// Only mounted once BillingPage knows the workspace pays through Paddle.
function InvoiceList() {
  const { data: agency } = useMyAgency();
  const { data: invoices, isLoading, error } = useInvoices(agency?.agencyId);
  const download = useDownloadInvoice(agency?.agencyId);

  if (isLoading) return <p className="sub invlist-note">Frank is working…</p>;
  if (error) return <p className="autherr invlist-note">{errorMessage(error, "Couldn't read your invoices")}</p>;
  if (!invoices?.length) return <p className="sub invlist-note">No invoices yet. The first comes with your first payment.</p>;
  return (
    <>
      {invoices.map((inv) => (
        <div className="srow" key={inv.id}>
          <span className="sl">
            <b>{inv.number}</b>
            <span>{day(inv.billedAt)}</span>
          </span>
          <span className="invlist-r">
            <span className="invlist-amt">{money(inv.total, inv.currency)}</span>
            <span className={`invlist-st ${inv.status}`}>{STATUS[inv.status]}</span>
            <button
              type="button"
              className="btn sm"
              aria-label={`Download invoice ${inv.number}`}
              disabled={download.isPending && download.variables?.transactionId === inv.id}
              onClick={() => download.mutate({ transactionId: inv.id, tab: window.open("", "_blank") })}
            >
              {download.isPending && download.variables?.transactionId === inv.id ? "Opening…" : "Download"}
            </button>
          </span>
        </div>
      ))}
      {download.error && <p className="autherr invlist-note">{errorMessage(download.error, "Couldn't get the invoice")}</p>}
    </>
  );
}
