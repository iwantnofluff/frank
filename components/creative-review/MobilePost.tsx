"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CopyCaptionChip } from "@/components/project/CopyCaptionChip";
import { OpenAsset } from "@/components/project/OpenAsset";
import { FormatSwitch } from "./FormatSwitch";
import { PlatformPost } from "./PlatformPost";

// A post's page on a phone (direct instruction): for copying its caption
// and opening its Final Asset, and for reading and replying to its
// comments. One column: where it sits, the post as its platform shows it
// (PlatformPost), then
// Copy Caption and Final Asset, then the comments. Editing, sharing, the
// versions and drawing on the artwork stay on a computer. The card is the
// review link's phone card (.m-card).
export function MobilePost({
  projectId,
  postId,
  projectName,
  stageText,
  stageColor,
  date,
  name,
  formats,
  shownFormat,
  onShowFormat,
  fields,
  accountName,
  avatarUrl,
  media,
  caption,
  copy,
  assetLink,
  comments,
}: {
  projectId: string;
  postId: string;
  projectName: string;
  // Its stage, or its status within it for the team ("3b. Internal QC").
  stageText: string;
  stageColor: string;
  date: string | null;
  name: string;
  // Its formats, main first, and which it's shown as (FormatSwitch).
  formats: string[];
  shownFormat: string | null;
  onShowFormat: (format: string) => void;
  // The copy version's fields.
  fields: Record<string, string> | null | undefined;
  accountName: string;
  avatarUrl: string | null;
  // The artwork, its slides or its video, as on the computer.
  media: ReactNode;
  caption: string | null;
  // What shows when there's no caption: the other copy, or what's missing.
  copy: ReactNode;
  // The team's only; null for a client.
  assetLink: string | null;
  comments: ReactNode;
}) {
  return (
    <div className="mpost">
      <div className="mpost-h">
        <Link className="mpost-back" href={`/projects/${projectId}?post=${postId}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {projectName}
        </Link>
        <span className="stg mpost-stage" style={{ background: stageColor }}>
          {stageText}
        </span>
        <b className="mpost-t">{name}</b>
        <span className="mpost-d">
          {date && `${date} · `}
          <FormatSwitch className="mpost-fmt" formats={formats} shown={shownFormat} onShow={onShowFormat} />
        </span>
      </div>

      <div className="m-card">
        <PlatformPost
          format={shownFormat}
          frame="card"
          accountName={accountName}
          avatarUrl={avatarUrl}
          media={media}
          fields={fields}
          fallback={copy}
        />
      </div>

      {(caption || assetLink) && (
        <div className="mpost-acts">
          {caption && <CopyCaptionChip caption={caption} label="Copy Caption" className="btn mpost-copy" />}
          {assetLink && <OpenAsset url={assetLink} className="mpost-asset" />}
        </div>
      )}

      {comments}
    </div>
  );
}
