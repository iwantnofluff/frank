"use client";

// Left and right arrows, a "2 / 5" count and dots over a carousel's image
// (the post page and the review link). Not in the prototype, which has no
// carousel viewer — docs/parity-gaps.md.
export function CarouselNav({
  index,
  count,
  onChange,
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
}) {
  if (count < 2) return null;
  return (
    <>
      <button
        type="button"
        className="car-arrow prev"
        aria-label="Previous slide"
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
        aria-label="Next slide"
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
      <span className="car-count" aria-live="polite">
        {index + 1} / {count}
      </span>
      <div className="car-dots" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <i key={i} className={i === index ? "on" : ""} />
        ))}
      </div>
    </>
  );
}
