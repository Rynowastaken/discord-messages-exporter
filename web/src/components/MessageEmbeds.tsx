import { useState } from "react";
import { Play } from "lucide-react";
import type { ExplorerEmbed } from "../types";

interface MessageEmbedsProps {
  embeds: ExplorerEmbed[];
  limit?: number;
  className?: string;
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : null;
  } catch {
    return null;
  }
}

function EmbedMedia({
  src,
  href,
  video,
  label,
}: {
  src: string;
  href: string | null;
  video: boolean;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const media = (
    <>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      {video ? (
        <span className="message-embed-play" aria-hidden="true">
          <Play size={18} strokeWidth={1.5} fill="currentColor" />
        </span>
      ) : null}
    </>
  );
  return href ? (
    <a
      className="message-embed-media"
      href={href}
      target="_blank"
      rel="noreferrer"
      tabIndex={-1}
      aria-label={label}
    >
      {media}
    </a>
  ) : (
    <span className="message-embed-media">{media}</span>
  );
}

export default function MessageEmbeds({
  embeds,
  limit = 2,
  className = "",
}: MessageEmbedsProps) {
  const shown = (embeds ?? []).slice(0, limit);
  if (!shown.length) return null;
  return (
    <div
      className={`message-embeds${className ? ` ${className}` : ""}`}
      aria-label="Link previews"
    >
      {shown.map((embed, index) => {
        const href = safeUrl(embed.url);
        const media =
          safeUrl(embed.thumbnail_url) ??
          safeUrl(embed.image_url) ??
          safeUrl(embed.video_url);
        const label =
          embed.provider || embed.author || (embed.type === "video" ? "Video" : "");
        const title = embed.title || embed.url || "Embedded link";
        return (
          <article
            className={`message-embed${media ? "" : " message-embed--text"}`}
            key={`${href ?? "embed"}-${index}`}
          >
            {media ? (
              <EmbedMedia
                src={media}
                href={href}
                video={embed.type === "video" || Boolean(embed.video_url)}
                label={`${title}${label ? ` · ${label}` : ""}`}
              />
            ) : null}
            <div className="message-embed-body">
              {label ? (
                <span className="message-embed-provider">{label}</span>
              ) : null}
              {href ? (
                <a
                  className="message-embed-title"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {title}
                </a>
              ) : (
                <strong className="message-embed-title">{title}</strong>
              )}
              {embed.description ? (
                <p className="message-embed-description">
                  {embed.description}
                </p>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
