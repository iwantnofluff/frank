// The heading every Settings page starts with.
export function SettingsHead({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h1 className="h1">{title}</h1>
      <p className="sub" style={{ marginBottom: 16 }}>
        {description}
      </p>
    </>
  );
}
