"use client";

import { useClientDetail } from "./use-client";
import { useAvatarUrls } from "./use-avatar-urls";

// A client's logo, for the avatar beside the handle in the phone views
// (direct instruction). Null when the client has none.
export function useClientLogoUrl(clientId: string | null | undefined): string | null {
  const { data: client } = useClientDetail(clientId ?? "");
  const { data: urls } = useAvatarUrls([client?.logo_asset_id]);
  return client?.logo_asset_id ? (urls?.[client.logo_asset_id] ?? null) : null;
}
