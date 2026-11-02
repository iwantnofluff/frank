// Shown the moment this page is opened, while the server answers (as the
// post page's own loading.tsx): a click is never a pause with nothing
// happening. The same words the page itself shows while it loads.
export default function Loading() {
  return (
    <div className="pad">
      <p className="sub">Frank is working…</p>
    </div>
  );
}
