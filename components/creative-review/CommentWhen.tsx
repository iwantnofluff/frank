// When a comment was made: its date as each place already writes it, and
// then the time in 24-hour form, on one line (direct instruction), e.g.
// 13 Nov · 14:05.
export function CommentWhen({ iso, date, className }: { iso: string; date: string; className?: string }) {
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <time className={`cwhen${className ? ` ${className}` : ""}`} dateTime={iso}>
      <span>{date}</span>
      <span>{time}</span>
    </time>
  );
}
