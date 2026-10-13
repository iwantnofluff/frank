// Instagram's reply bar under a Story (direct instruction: the phone is a
// true iPhone 15, and a 9:16 story sits on it as Instagram lays it out,
// full width under the status bar with this bar below). Drawn only; the
// review's own comments are where replies go.
export function StoryReplyBar() {
  return (
    <div className="ig-reply" aria-hidden="true">
      <span className="ig-reply-msg">Send message</span>
      <svg viewBox="0 0 24 24">
        <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
      </svg>
      <svg viewBox="0 0 24 24">
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4z" />
      </svg>
    </div>
  );
}
