import { SettingsHead } from "./SettingsHead";

// A Settings page that's in the menu but not built yet (decided directly:
// shown, marked Coming soon, saying what it will hold).
export function ComingSoon({ title, description, what }: { title: string; description: string; what: string[] }) {
  return (
    <div className="pad" style={{ maxWidth: 760 }}>
      <SettingsHead title={title} description={description} />
      <div className="panel">
        <div className="panel-h">
          <b>Coming soon</b>
        </div>
        <ul className="soonlist">
          {what.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
