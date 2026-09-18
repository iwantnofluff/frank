"use client";

import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/ui-store";
import { BellIcon, SearchIcon } from "./icons";

const CRUMBS: Record<string, string> = {
  "/dashboard": "All Clients",
  "/calendar": "Calendar",
  "/analytics": "Analytics",
  "/knowledge": "Knowledge",
  "/visibility": "Client visibility",
  "/settings": "Settings",
};

function crumbFor(pathname: string) {
  const match = Object.keys(CRUMBS).find((prefix) =>
    pathname.startsWith(prefix),
  );
  return match ? CRUMBS[match] : "Frank";
}

export function Topbar() {
  const pathname = usePathname();
  const previewMode = useUIStore((s) => s.previewMode);
  const setPreviewMode = useUIStore((s) => s.setPreviewMode);

  return (
    <header className="topbar">
      <div className="crumb">
        <b>{crumbFor(pathname)}</b>
      </div>
      <div className="grow" />
      <div
        className="modeswitch"
        title="Preview only — in the live product each user sees one view"
      >
        <span className="msl">Preview as</span>
        <button
          type="button"
          aria-pressed={previewMode === "agency"}
          onClick={() => setPreviewMode("agency")}
        >
          Agency
        </button>
        <button
          type="button"
          aria-pressed={previewMode === "client"}
          onClick={() => setPreviewMode("client")}
        >
          Client
        </button>
      </div>
      <button className="search" type="button">
        <SearchIcon />
        Search
        <span className="kbd">⌘K</span>
      </button>
      <button className="bell" type="button" title="Notifications">
        <BellIcon />
        <span className="cnt">0</span>
      </button>
    </header>
  );
}
