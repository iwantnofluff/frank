// When a comment was made: its date as each place already writes it, and
// the time under it in 24-hour form (direct instruction), e.g. 14:05.
export function CommentWhen({ iso, date, className }: { iso: string; date: string; className?: string }) {
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <time className={`cwhen${className ? ` ${className}` : ""}`} dateTime={iso}>
      <span>{date}</span>
      <span>{time}</span>
    </time>
  );
}
