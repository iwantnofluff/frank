"use client";

import { useState } from "react";
import type { SharedCreative } from "@/hooks/use-shared-review";
import { NoArtwork } from "@/components/creative-review/NoArtwork";
import { CarouselNav } from "@/components/creative-review/CarouselNav";

// The image area of a post on the review link (phone and desktop): the
// artwork, a carousel's slides with arrows, or "No artwork yet".
export function ReviewMedia({ active }: { active: SharedCreative }) {
  const slides = active.slides?.length
    ? active.slides
    : active.asset
      ? [{ position: 1, signed_url: active.asset.signed_url, mime_type: active.asset.mime_type, filename: active.asset.filename }]
      : [];
  const [index, setIndex] = useState(0);
  // Each post starts at its first slide.
  const [indexFor, setIndexFor] = useState(active.id);
  if (indexFor !== active.id) {
    setIndexFor(active.id);
    setIndex(0);
  }
  const slide = slides[Math.min(index, slides.length - 1)];

  if (!slide) {
    return <NoArtwork format={active.format} note="The agency hasn't uploaded the artwork for this post yet." />;
  }
  return (
    <>
      {!slide.signed_url ? (
        <div className="ig-noasset">No preview available</div>
      ) : slide.mime_type.startsWith("video/") ? (
        <video key={slide.signed_url} src={slide.signed_url} controls style={{ width: "100%" }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img src={slide.signed_url} alt={active.name} style={{ width: "100%" }} />
      )}
      <CarouselNav index={Math.min(index, slides.length - 1)} count={slides.length} onChange={setIndex} />
    </>
  );
}
