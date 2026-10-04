"use client";

import { use } from "react";
import { useConnectLink } from "@/hooks/use-instagram";

// The page a client opens from the agency's link (phase54): it says who's
// asking and what for, then sends them to Instagram's own sign-in, so they
// never share their password with the agency. One use, 7 days.
export default function ConnectInstagramPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = use(params);
  const { instagram: outcome } = use(searchParams);
  const { data, isLoading } = useConnectLink(token);

  let title: string;
  let body: string;
  let canConnect = false;
  if (outcome === "connected") {
    title = "Instagram connected";
    body = `Thank you. ${data?.agencyName ?? "Your agency"} can now see ${data?.clientName ?? "your"} feed beside the posts they're planning. You can close this page.`;
  } else if (outcome === "not_professional") {
    title = "That's a personal account";
    body = "Only Instagram Business or Creator accounts can be connected. Switching is free, in the Instagram app's settings. Then ask your agency for a new link.";
  } else if (outcome === "cancelled") {
    title = "Nothing was connected";
    body = "The Instagram sign-in was cancelled.";
    canConnect = data?.status === "ok";
  } else if (outcome === "failed") {
    title = "Instagram didn't connect";
    body = "Something went wrong on the way back from Instagram. Try again, or ask your agency for a new link.";
    canConnect = data?.status === "ok";
  } else if (!data || data.status === "not_found") {
    title = "This link isn't valid";
    body = "Ask your agency for a new one.";
  } else if (data.status === "used") {
    title = "This link has been used";
    body = "The account is already connected. Ask your agency for a new link if you need to connect it again.";
  } else if (data.status === "expired") {
    title = "This link has expired";
    body = "Links work for 7 days. Ask your agency for a new one.";
  } else {
    title = `Connect ${data.clientName ?? "your"} Instagram`;
    body = `${data.agencyName ?? "Your agency"} would like to show your real Instagram feed beside the posts they're planning, so you can see how it will look. You'll sign in on Instagram itself; Frank never sees your password, only reads your posts and profile, and can't post anything. Business or Creator accounts only.`;
    canConnect = true;
  }

  return (
    <div className="authwrap">
      {isLoading ? null : (
        <div className="authcard">
          <div className="mark authmark">F</div>
          <h1 className="h1">{title}</h1>
          <p className="sub">{body}</p>
          {canConnect && (
            <a
              className="btn primary"
              style={{ textAlign: "center" }}
              href={`/api/connections/instagram/start?link=${encodeURIComponent(token)}`}
            >
              Connect with Instagram
            </a>
          )}
        </div>
      )}
    </div>
  );
}
