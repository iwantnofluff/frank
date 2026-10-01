"use client";

// Initials until there's a photo — the circle's own class (.who, .avatar)
// decides size and colour; the photo just fills it.
export function PersonAvatar({
  initials,
  photoUrl,
  className,
  style,
}: {
  initials: string;
  photoUrl?: string | null;
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`${className} pavatar`} style={style}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img src={photoUrl} alt="" />
      ) : (
        initials
      )}
    </span>
  );
}
