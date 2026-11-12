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
  exportId: string;
  localAttachments: boolean;
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
      <span>
        Not available — the file was not archived and the Discord link has
        expired.
      </span>
    </div>
  );
}

function ImageAttachment({
  attachment,
  sources,
}: {
  attachment: AttachmentMeta;
  sources: string[];
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const href = sources[sourceIndex];

  if (!href) return <MissingAttachment attachment={attachment} />;

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
          key={href}
          src={href}
          alt={attachment.filename ?? "attachment"}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setSourceIndex((value) => value + 1);
          }}
        />
      </span>
      <span className="attachment-caption">
        <strong>{attachment.filename ?? "image"}</strong>
        <span>{metaLine(attachment)}</span>
      </span>
    </a>
  );
}

export default function AttachmentGrid({
  attachments,
  exportId,
  localAttachments,
}: AttachmentGridProps) {
  return (
    <div className="attachment-grid">
      {attachments.map((attachment, index) => {
        const signed = safeUrl(attachment.url ?? attachment.proxy_url);
        const local =
          localAttachments && attachment.id
            ? `/api/exports/${encodeURIComponent(
                exportId
              )}/attachments/${encodeURIComponent(attachment.id)}`
            : null;
        const href = local ?? signed;
        const isImage = attachment.content_type?.startsWith("image/");
        const key = attachment.id ?? index;

        if (isImage) {
          const sources = [local, signed].filter(
            (value): value is string => Boolean(value)
          );
          return (
            <ImageAttachment
              key={key}
              attachment={attachment}
              sources={sources}
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
