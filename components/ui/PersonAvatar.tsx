"use client";

// Initials when there's no photo — the circle's own class (.who, .avatar)
// decides size and colour; the photo just fills it. With hasPhoto, the
// circle stays blank until the photo's address arrives rather than showing
// initials first (direct instruction: no photo flashing in).
export function PersonAvatar({
  initials,
  photoUrl,
  hasPhoto = false,
  className,
  style,
}: {
  initials: string;
  photoUrl?: string | null;
  hasPhoto?: boolean;
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`${className} pavatar`} style={style}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img src={photoUrl} alt="" />
      ) : hasPhoto ? null : (
        initials
      )}
    </span>
  );
}
