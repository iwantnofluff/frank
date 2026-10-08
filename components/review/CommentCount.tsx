// How many comments a post has, as a small bubble (direct instruction:
// mark what's been commented on). Nothing at all when there are none.
export function CommentCount({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="cmtcount" title={`${n} comment${n === 1 ? "" : "s"}`} aria-label={`${n} comment${n === 1 ? "" : "s"}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
      </svg>
      {n}
    </span>
  );
}
