"use client";

// Left and right arrows, a "2 / 5" count and dots over a carousel's image
// (the post page and the review link). Not in the prototype, which has no
// carousel viewer — docs/parity-gaps.md. Several stories (direct
// instruction) get Instagram's bars along the top instead of the count and
// dots, one per story; a single story has none.
export function CarouselNav({
  index,
  count,
  onChange,
  overVideo = false,
  story = false,
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
  // A video slide: the dots sit above its controls, not on them.
  overVideo?: boolean;
  story?: boolean;
}) {
  if (count < 2) return null;
  const noun = story ? "story" : "slide";
  return (
    <>
      <button
        type="button"
        className="car-arrow prev"
        aria-label={`Previous ${noun}`}
        disabled={index === 0}
        onClick={(e) => {
          e.stopPropagation();
          onChange(index - 1);
        }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="car-arrow next"
        aria-label={`Next ${noun}`}
        disabled={index === count - 1}
        onClick={(e) => {
          e.stopPropagation();
          onChange(index + 1);
        }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      {story ? (
        <div className="story-bars" role="status" aria-label={`Story ${index + 1} of ${count}`}>
          {Array.from({ length: count }, (_, i) => (
            <i key={i} className={i <= index ? "on" : ""} />
          ))}
        </div>
      ) : (
        <>
          <span className="car-count" aria-live="polite">
            {index + 1} / {count}
          </span>
          <div className={`car-dots${overVideo ? " over-video" : ""}`} aria-hidden="true">
            {Array.from({ length: count }, (_, i) => (
              <i key={i} className={i === index ? "on" : ""} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
