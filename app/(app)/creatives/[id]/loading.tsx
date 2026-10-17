// Shown the moment a post is opened, while the server reads it (reported
// directly: a click on a table row seemed to do nothing for a second or
// two). The same words the page itself shows while it loads.
export default function Loading() {
  return (
    <div className="pad">
      <p className="sub">Frank is working…</p>
    </div>
  );
}
