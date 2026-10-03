import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { customAddressAllowed } from "@/lib/plans";
import { addressError } from "@/lib/address";

// An agency's Owner changes its address (phase41). Decided directly:
// Owners and the Primary Owner, on Agency or Enterprise (the spec's custom
// subdomain row). The old address is kept and redirects here
// (change_agency_subdomain), so links already sent keep working.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agencyId?: string; subdomain?: string };
  const subdomain = body.subdomain?.trim().toLowerCase();
  if (!body.agencyId || !subdomain) return NextResponse.json({ error: "Choose an address" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: isOwner } = await supabase.rpc("is_agency_owner_or_above", { check_agency_id: body.agencyId });
  if (!isOwner) return NextResponse.json({ error: "Only an Owner or the Primary Owner can change the address." }, { status: 403 });

  const admin = createServiceRoleClient();
  const { data: agency } = await admin.from("agencies").select("plan, subdomain").eq("id", body.agencyId).single();
  if (!agency) return NextResponse.json({ error: "No such agency" }, { status: 404 });
  if (!customAddressAllowed(agency.plan)) {
    return NextResponse.json({ error: "Choosing your own address comes with the Agency plan." }, { status: 403 });
  }

  const { error } = await admin.rpc("change_agency_subdomain", { p_agency_id: body.agencyId, p_subdomain: subdomain });
  if (error) {
    const friendly = addressError(error.message);
    return NextResponse.json({ error: friendly ?? error.message }, { status: friendly ? 400 : 500 });
  }
  return NextResponse.json({ subdomain, previous: agency.subdomain });
}
