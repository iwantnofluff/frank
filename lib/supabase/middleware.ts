import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { agencyHeader, tenantFromHost } from "@/lib/tenant";

// Routes that stay reachable without a session — the shared client review
// link (spec section 26) is opened by people who never get an account, and
// login obviously can't require being logged in. /api/shared-review is the
// data-fetch endpoint the /review page itself calls (it signs asset URLs
// server-side), so it has to be exempt for the same reason /review is.
// /api/ai/classify-comment is the same shape again — a guest's own comment
// (posted from /review) fires a request there too, and it validates its
// own input independently rather than trusting the caller (see the
// route's own comment), the same discipline /api/shared-review's use of
// the service-role client already documents.
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/review",
  "/welcome",
  "/no-workspace",
  "/not-a-member",
  "/invite",
  "/access-removed",
  // The face detector's runtime and model (static files in public/). The
  // invite page crops a photo before its owner has a session, so these
  // have to load signed out; without this they 307'd to /login and the
  // cropper silently fell back to a centred square.
  "/mediapipe",
  "/api/shared-review",
  "/api/invite",
  "/api/ai/classify-comment",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const tenant = tenantFromHost(request.headers.get("host"));

  // beingfrank.app itself is a holding page (decided directly), whatever
  // the path — and so is admin.beingfrank.app until the platform admin
  // area exists. Nothing there needs a session.
  if (tenant.kind === "root" || tenant.kind === "admin") {
    return NextResponse.rewrite(new URL("/welcome", request.url));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Narrowed to this address's agency, like every other client.
      global: { headers: agencyHeader(tenant) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not add logic between createServerClient and getUser — the session
  // refresh has to happen on every request or users get silently logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Shows another page at this address (or, for the app's own requests, a
  // plain refusal), keeping any session cookies just refreshed.
  function showInstead(page: string, status: number) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: page === "/no-workspace" ? "No such workspace" : "Not a member of this workspace" }, { status })
      : NextResponse.rewrite(new URL(page, request.url), { status });
    supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c));
    return response;
  }

  // agencyname.beingfrank.app: the workspace has to exist…
  if (tenant.kind === "agency" && pathname !== "/no-workspace") {
    const { data: workspace } = await supabase.rpc("workspace_for_subdomain", { p_subdomain: tenant.subdomain });
    if (!workspace || (Array.isArray(workspace) && workspace.length === 0)) {
      return showInstead("/no-workspace", 404);
    }
    // …and someone signed in has to belong to it. Their memberships are
    // already narrowed to this agency, so none means they're not in it.
    if (user && !isPublicPath(pathname)) {
      const { data: mine } = await supabase.rpc("current_agency_ids");
      if (!mine || (Array.isArray(mine) && mine.length === 0)) {
        return showInstead("/not-a-member", 403);
      }
    }
  }

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
