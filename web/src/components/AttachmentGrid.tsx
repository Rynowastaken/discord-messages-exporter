import { useState } from "react";
import { ExternalLink, FileText, ImageOff } from "lucide-react";
import { fmt } from "../lib/format";

export interface AttachmentMeta {
  id?: string;
  filename?: string;
  size?: number;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  url?: string;
  proxy_url?: string;
}

interface AttachmentGridProps {
  attachments: AttachmentMeta[];
}

function safeUrl(value: string | undefined): string | null {
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

function metaLine(attachment: AttachmentMeta): string {
  const type = attachment.content_type ?? "unknown type";
  return attachment.size ? `${type} · ${fmt(attachment.size)} bytes` : type;
}

function MissingAttachment({ attachment }: { attachment: AttachmentMeta }) {
  return (
    <div className="attachment-card attachment-card--missing">
      <ImageOff size={18} strokeWidth={1.5} aria-hidden="true" />
      <strong>{attachment.filename ?? "attachment"}</strong>
      <span>Link expired — attachment bytes were not archived.</span>
    </div>
  );
}

function ImageAttachment({
  attachment,
  href,
}: {
  attachment: AttachmentMeta;
  href: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) return <MissingAttachment attachment={attachment} />;

  return (
    <a
      className="attachment-card attachment-card--image"
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        if (!loaded) event.preventDefault();
      }}
    >
      <span className="attachment-media">
        {!loaded ? <span className="attachment-loading" aria-hidden="true" /> : null}
        <img
          src={href}
          alt={attachment.filename ?? "attachment"}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </span>
      <span className="attachment-caption">
        <strong>{attachment.filename ?? "image"}</strong>
        <span>{metaLine(attachment)}</span>
      </span>
    </a>
  );
}

export default function AttachmentGrid({ attachments }: AttachmentGridProps) {
  return (
    <div className="attachment-grid">
      {attachments.map((attachment, index) => {
        const href = safeUrl(attachment.url ?? attachment.proxy_url);
        const isImage = attachment.content_type?.startsWith("image/");
        const key = attachment.id ?? index;

        if (isImage && href) {
          return (
            <ImageAttachment
              key={key}
              attachment={attachment}
              href={href}
            />
          );
        }

        if (href) {
          return (
            <a
              className="attachment-card attachment-card--file"
              key={key}
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              <span className="attachment-file-icon" aria-hidden="true">
                <FileText size={18} strokeWidth={1.5} />
              </span>
              <span className="attachment-caption">
                <strong>{attachment.filename ?? "attachment"}</strong>
                <span>{metaLine(attachment)}</span>
              </span>
              <ExternalLink
                size={13}
                strokeWidth={1.5}
                aria-hidden="true"
                className="attachment-open"
              />
            </a>
          );
        }

        return (
          <div className="attachment-card attachment-card--file" key={key}>
            <span className="attachment-file-icon" aria-hidden="true">
              <FileText size={18} strokeWidth={1.5} />
            </span>
            <span className="attachment-caption">
              <strong>{attachment.filename ?? "attachment"}</strong>
              <span>{metaLine(attachment)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
