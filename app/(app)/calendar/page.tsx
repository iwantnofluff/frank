// Placeholder — no calendar/scheduling feature exists yet (see
// docs/css-coverage.md's deferred "calendar" bucket, the full resizable
// custom-column grid this would eventually become). This page exists so
// the rail's Calendar link renders the app shell instead of a bare 404;
// it is not the feature.
export default function CalendarPage() {
  return (
    <div className="pad">
      <h1 className="h1">Calendar</h1>
      <div className="empty">
        <b>Calendar isn&rsquo;t built yet</b>
        <span>This screen is coming in a later phase.</span>
      </div>
    </div>
  );
}
