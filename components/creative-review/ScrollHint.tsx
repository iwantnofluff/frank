import { copyFieldsFor, hasVideoFormat } from "@/lib/formats";

// The note under a review's phone (direct instruction): for any format
// that takes a caption, written yet or not, as the phone's screen scrolls
// to it; a video's says it plays too. Nothing for a format with no caption.
export function ScrollHint({ formats }: { formats: string[] }) {
  if (!copyFieldsFor(formats).includes("caption")) return null;
  return (
    <p className="dk-scrollhint">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
      {hasVideoFormat(formats)
        ? "Scroll inside the phone to read the caption or play the video"
        : "Scroll inside the phone to read the caption"}
    </p>
  );
}

// Whether there's one, for the room kept under the phone.
export const hasScrollHint = (formats: string[]) => copyFieldsFor(formats).includes("caption");
