"use client";

import type { ReactNode } from "react";
import { DEFAULT_CTA, postTemplate } from "@/lib/post-templates";
import { StoryReplyBar } from "./StoryReplyBar";

// A post as its platform shows it (decided directly), for the post page and
// the review link, on a computer (in the phone) and on a phone (in its
// card). Instagram as before; a Meta ad as Instagram shows one, Sponsored
// with its call to action; Facebook and LinkedIn as theirs. The artwork
// (`media`) is the caller's, pins, players and slides and all, so it works
// the same in every look. Likes and comment counts are never invented: the
// actions are drawn without numbers.
export function PlatformPost({
  format,
  frame,
  accountName,
  avatarUrl,
  media,
  fields,
  captionNode,
  fallback,
  commentButton,
  footer,
}: {
  format: string | null | undefined;
  // In the phone on a computer, or the phone's own card (where a Story is
  // drawn as a post, as before).
  frame: "phone" | "card";
  accountName: string;
  avatarUrl: string | null;
  media: ReactNode;
  // The copy version's fields.
  fields: Record<string, string> | null | undefined;
  // The caption with comments on it (the post page): used for the main
  // text when that is the caption.
  captionNode?: ReactNode;
  // When there's no main text: the post's other copy, or what's missing.
  fallback?: ReactNode;
  // The comment icon as a button (the review link's jump to comments).
  commentButton?: ReactNode;
  // Under the post: when it was uploaded.
  footer?: ReactNode;
}) {
  const t = postTemplate(format);
  const story = t.story && frame === "phone";
  const raw = fields?.[t.textField]?.trim() ?? "";
  const text = raw ? (t.textField === "caption" && captionNode ? captionNode : <span>{raw}</span>) : null;
  // An ad's headline: the first, where the copy lists several, one a line
  // (a Google ad's alternatives).
  const headline =
    (fields?.headline ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const cta = fields?.cta?.trim() || DEFAULT_CTA;

  const avatar = (
    <div className={`ig-av${t.platform === "linkedin" ? " sq" : t.platform === "facebook" ? " plain" : ""}`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Instagram's or storage's short-lived URL
        <img src={avatarUrl} alt="" />
      ) : (
        <i />
      )}
    </div>
  );
  const comment = commentButton ?? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
    </svg>
  );
  const globe = (
    <svg className="pp-globe" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  );
  const thumb = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 22V11l5-9a2.5 2.5 0 0 1 2.5 3.2L13.5 9H20a2 2 0 0 1 2 2.4l-1.7 8A2 2 0 0 1 18.3 21H7z" />
      <path d="M7 11H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </svg>
  );
  const commentIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
  const send = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
  // The call to action under an ad's artwork, as Meta and LinkedIn lay it.
  const ctaBar = t.ad ? (
    <div className={`pp-ctabar ${t.platform}`}>
      <b>{headline || accountName}</b>
      <span className="pp-ctabtn">{cta}</span>
    </div>
  ) : null;

  const field = (key: string) => fields?.[key]?.trim() ?? "";
  const shareIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
  const saveIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
  const heart = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
    </svg>
  );

  // YouTube's Shorts: full screen, the title over the foot.
  if (t.platform === "youtube" && story) {
    return (
      <div className="ig story yt-short" data-platform="youtube">
        <div className="ig-h">
          {avatar}
          <div>
            <b>{accountName}</b>
          </div>
          <span className="yt-sub">Subscribe</span>
        </div>
        <div className="ig-media">{media}</div>
        <div className="yt-shorttitle">{text ?? fallback}</div>
      </div>
    );
  }

  // YouTube's watch page: the video, its title, the channel, then the
  // description. A pre-roll ad: the video with its call to action.
  if (t.platform === "youtube") {
    const description = field("description");
    return (
      <div className="ig yt" data-platform="youtube">
        <div className="ig-media">{media}</div>
        {t.ad ? (
          <div className="pp-ctabar youtube">
            <span className="pp-adtag">Sponsored</span>
            <b>{headline || accountName}</b>
            <span className="pp-ctabtn">{cta}</span>
          </div>
        ) : (
          <div className="yt-title">{text ?? fallback}</div>
        )}
        <div className="yt-chan">
          {avatar}
          <b>{accountName}</b>
          <span className="yt-sub">Subscribe</span>
        </div>
        <div className="yt-pills">
          <span>{thumb}Like</span>
          <span>{shareIcon}Share</span>
          <span>{saveIcon}Save</span>
        </div>
        {!t.ad && description && <div className="yt-desc">{description}</div>}
        {footer}
      </div>
    );
  }

  // A thumbnail as YouTube's home feed shows a video.
  if (t.platform === "youtube-feed") {
    return (
      <div className="ig ytf" data-platform="youtube">
        <div className="ig-media">{media}</div>
        <div className="ytf-row">
          {avatar}
          <div>
            <b>{text ?? fallback}</b>
            <span className="loc">{accountName}</span>
          </div>
          <div className="dots">⋮</div>
        </div>
        {footer}
      </div>
    );
  }

  // A Pin as Pinterest opens one: the image, Save, then its words.
  if (t.platform === "pinterest") {
    const description = field("description");
    return (
      <div className="ig pin" data-platform="pinterest">
        <div className="ig-media">{media}</div>
        <div className="pin-bar">
          {heart}
          {shareIcon}
          <span className="dots">•••</span>
          <span className="pin-save">Save</span>
        </div>
        <div className="pin-text">
          {text ? <b>{text}</b> : null}
          {description && <p>{description}</p>}
          {!text && !description && fallback}
        </div>
        <div className="pin-acct">
          {avatar}
          <b>{accountName}</b>
        </div>
        {footer}
      </div>
    );
  }

  // A WhatsApp Broadcast: the message in its chat.
  if (t.platform === "whatsapp") {
    return (
      <div className="ig wa" data-platform="whatsapp">
        <div className="ig-h">
          {avatar}
          <div>
            <b>{accountName}</b>
            <span className="loc">Business account</span>
          </div>
        </div>
        <div className="wa-chat">
          <div className="wa-bubble">
            <div className="ig-media">{media}</div>
            <div className="wa-text">{text ?? fallback}</div>
            <span className="wa-time">now</span>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  // An SMS: the text in the phone's messages.
  if (t.platform === "sms") {
    return (
      <div className="ig sms" data-platform="sms">
        <div className="sms-h">
          {avatar}
          <b>{accountName}</b>
        </div>
        <div className="sms-thread">
          <span className="sms-when">Text Message · Today</span>
          <div className="sms-bubble">{text ?? fallback}</div>
        </div>
        {footer}
      </div>
    );
  }

  // A push notification on the lock screen.
  if (t.platform === "push") {
    const body = field("body");
    return (
      <div className="ig push" data-platform="push">
        <div className="push-lock">
          <span className="push-clock">9:41</span>
          <div className="push-card">
            {avatar}
            <div>
              <div className="push-top">
                <b>{accountName}</b>
                <span>now</span>
              </div>
              {text && <b className="push-title">{text}</b>}
              {body && <span className="push-body">{body}</span>}
              {!text && !body && fallback}
            </div>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  // A search ad among Google's results: up to three headlines and two
  // descriptions, one per line of the copy.
  if (t.platform === "google-search") {
    const lines = (key: string, n: number) =>
      field(key)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, n);
    const heads = lines("headline", 3);
    const descs = lines("description", 2);
    return (
      <div className="ig gs" data-platform="google">
        <div className="gs-bar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span>{accountName}</span>
        </div>
        <div className="gs-result">
          <span className="gs-spon">Sponsored</span>
          <div className="gs-site">
            {avatar}
            <b>{accountName}</b>
          </div>
          {heads.length > 0 && <div className="gs-head">{heads.join(" | ")}</div>}
          {descs.length > 0 && <p>{descs.join(" ")}</p>}
          {!heads.length && !descs.length && fallback}
        </div>
        {footer}
      </div>
    );
  }

  // A display ad on a web page, among its text.
  if (t.platform === "web-ad") {
    const description = field("description");
    return (
      <div className="ig webad" data-platform="web">
        <div className="webad-bar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span>A page on the web</span>
        </div>
        <div className="webad-page">
          <i className="webad-line" />
          <i className="webad-line" />
          <i className="webad-line short" />
          <span className="webad-label">Advertisement</span>
          <div className="ig-media">{media}</div>
          {(headline || description) && (
            <div className="webad-native">
              <div>
                {headline && <b>{headline}</b>}
                {description && <span>{description}</span>}
              </div>
              <span className="pp-ctabtn">{cta}</span>
            </div>
          )}
          <i className="webad-line" />
          <i className="webad-line" />
          <i className="webad-line short" />
        </div>
        {footer}
      </div>
    );
  }

  // Other Content's, in an iPad (decided directly).
  const lines = (key: string) =>
    field(key)
      .split("\n")
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
  const skeleton = (n: number) =>
    Array.from({ length: n }, (_, i) => <i key={i} className={`tb-line${i === n - 1 ? " short" : ""}`} />);

  // An Amazon product page: the listing's images beside its title and
  // bullets; an A+ module under "From the brand"; a Sponsored Brands banner
  // over search results; a Storefront tile in the brand's store.
  if (t.platform === "amazon") {
    const listing = format === "amz_main" || format === "amz_info" || format === "amz_gallery";
    const bullets = lines("bullets");
    const description = field("description");
    const body = field("body");
    return (
      <div className="tb amz" data-platform="amazon">
        <div className="amz-top">
          <span className="amz-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            Search
          </span>
        </div>
        {listing ? (
          <div className="amz-listing">
            <div className="ig-media">{media}</div>
            <div className="amz-info">
              <h3>{text ?? <span className="tb-muted">The listing&rsquo;s title</span>}</h3>
              <span className="amz-store">Visit the {accountName} Store</span>
              {bullets.length > 0 && (
                <>
                  <b className="amz-about">About this item</b>
                  <ul>
                    {bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </>
              )}
              {description && <p className="amz-desc">{description}</p>}
              {!text && !bullets.length && !description && fallback}
            </div>
          </div>
        ) : format === "amz_sb" ? (
          <div className="amz-results">
            <div className="amz-sb">
              <div className="ig-media">{media}</div>
              <div className="amz-sb-copy">
                <span className="tb-muted">Sponsored</span>
                <b>{headline || accountName}</b>
                <span className="amz-shop">Shop {accountName}</span>
              </div>
            </div>
            <div className="amz-tiles">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="amz-tile">
                  <i />
                  {skeleton(2)}
                </div>
              ))}
            </div>
          </div>
        ) : format === "amz_store" ? (
          <div className="amz-storefront">
            <div className="amz-brand">
              {avatar}
              <b>{accountName}</b>
            </div>
            <div className="amz-nav">
              <span>Home</span>
              <span>Products</span>
              <span>About</span>
            </div>
            <div className="ig-media">{media}</div>
            {text && <h3>{text}</h3>}
          </div>
        ) : (
          <div className="amz-aplus">
            <b className="amz-from">From the brand</b>
            <div className="ig-media">{media}</div>
            {text && <h3>{text}</h3>}
            {body && <p>{body}</p>}
            {!text && !body && fallback}
          </div>
        )}
        {footer}
      </div>
    );
  }

  // An email, open in the iPad's mail (reported directly: just the
  // message, no inbox): its subject and sender, then the artwork edge to
  // edge, the screen in its shape (screenFit), then any body copy.
  if (t.platform === "email") {
    const preview = field("preview");
    const body = field("body");
    return (
      <div className="tb mail" data-platform="email">
        <div className="mail-head">
          <h3>{text ?? <span className="tb-muted">No subject yet</span>}</h3>
          <div className="mail-from">
            {avatar}
            <div>
              <b>{accountName}</b>
              <span className="tb-muted">{preview || "To: you"}</span>
            </div>
            <span className="tb-muted">now</span>
          </div>
        </div>
        <div className="ig-media">{media}</div>
        {(body || (!text && fallback)) && (
          <div className="mail-body">
            {body && <p>{body}</p>}
            {!text && !body && fallback}
          </div>
        )}
        {footer}
      </div>
    );
  }

  // A web page in the iPad's browser: a hero at the top of a site, a blog
  // post's header over its article, or a landing page.
  if (t.platform === "browser") {
    const body = field("body");
    return (
      <div className="tb web" data-platform="browser">
        <div className="web-bar">
          <span className="web-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="web-url">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            {accountName}
          </span>
        </div>
        <div className="web-page">
          {format !== "lp" && (
            <div className="web-nav">
              {avatar}
              <b>{accountName}</b>
              <span className="tb-muted">Home · Shop · About</span>
            </div>
          )}
          {format === "blog" ? (
            <div className="web-article">
              <div className="ig-media">{media}</div>
              <h2>{text ?? <span className="tb-muted">The post&rsquo;s title</span>}</h2>
              {skeleton(6)}
            </div>
          ) : (
            <>
              <div className="ig-media">{media}</div>
              {(text || body || field("cta")) && (
                <div className="web-copy">
                  {text && <h2>{text}</h2>}
                  {body && <p>{body}</p>}
                  {field("cta") && <span className="web-cta">{cta}</span>}
                </div>
              )}
              {!text && !body && fallback && <div className="tb-copy">{fallback}</div>}
              <div className="web-more">{skeleton(4)}</div>
            </>
          )}
        </div>
        {footer}
      </div>
    );
  }

  // Print, slides, out of home, packaging and Other Creative: the artwork
  // edge to edge (reported directly), the iPad's screen in its shape
  // (PhoneFrame screenRatio), and any copy under it.
  if (t.platform === "board") {
    const body = field("body");
    return (
      <div className="tb board" data-platform="board">
        <div className="ig-media">{media}</div>
        {(text || body || fallback) && (
          <div className="board-copy">
            {text && <b>{text}</b>}
            {body && <p>{body}</p>}
            {!text && !body && fallback}
          </div>
        )}
        {footer}
      </div>
    );
  }

  if (t.platform === "facebook") {
    return (
      <div className="ig fb" data-platform="facebook">
        <div className="ig-h">
          {avatar}
          <div>
            <b>{accountName}</b>
            <span className="loc">Just now · {globe}</span>
          </div>
          <div className="dots">•••</div>
        </div>
        <div className="pp-text">{text ?? fallback}</div>
        <div className="ig-media">{media}</div>
        {ctaBar}
        <div className="pp-acts">
          <span>{thumb}Like</span>
          <span>{commentButton ?? commentIcon}Comment</span>
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13 7l5 5-5 5" />
              <path d="M18 12H9a5 5 0 0 0-5 5v2" />
            </svg>
            Share
          </span>
        </div>
        {footer}
      </div>
    );
  }

  if (t.platform === "linkedin") {
    return (
      <div className="ig li" data-platform="linkedin">
        <div className="ig-h">
          {avatar}
          <div>
            <b>{accountName}</b>
            {t.ad && <span className="loc">Promoted</span>}
            <span className="loc">Now · {globe}</span>
          </div>
          <div className="dots">•••</div>
        </div>
        <div className="pp-text">{text ?? fallback}</div>
        <div className="ig-media">{media}</div>
        {ctaBar}
        <div className="pp-acts">
          <span>{thumb}Like</span>
          <span>{commentButton ?? commentIcon}Comment</span>
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Repost
          </span>
          <span>{send}Send</span>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className={`ig${story ? " story" : ""}`} data-platform="instagram">
      <div className="ig-h">
        {avatar}
        <div>
          <b>{accountName}</b>
          {t.ad && <span className="loc">Sponsored</span>}
        </div>
        <div className="dots">•••</div>
      </div>
      <div className="ig-media">{media}</div>
      {ctaBar}
      <div className="ig-acts">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
        </svg>
        {comment}
        {send}
        <svg className="save" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      {story && !t.ad && <StoryReplyBar />}
      {(text || fallback) && (
        <div className="ig-cap">
          <b>{accountName}</b>
          {text ?? fallback}
        </div>
      )}
      {footer}
    </div>
  );
}
