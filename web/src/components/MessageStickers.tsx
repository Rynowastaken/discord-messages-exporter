import { useState } from "react";
import { Sticker } from "lucide-react";

export interface StickerLike {
  id?: string;
  name?: string | null;
  format_type?: number | null;
}

interface MessageStickersProps {
  stickers: StickerLike[];
  className?: string;
}

function stickerUrl(sticker: StickerLike): string | null {
  if (!sticker.id) return null;
  if (sticker.format_type === 3) return null;
  const extension = sticker.format_type === 4 ? "gif" : "png";
  return `https://cdn.discordapp.com/stickers/${sticker.id}.${extension}?size=160`;
}

function StickerImage({ sticker }: { sticker: StickerLike }) {
  const [failed, setFailed] = useState(false);
  const url = stickerUrl(sticker);
  const name = sticker.name?.trim() || "Sticker";
  if (!url || failed) {
    return (
      <span className="message-sticker-fallback" aria-hidden="true">
        <Sticker size={24} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <img
      className="message-sticker-img"
      src={url}
      alt={`${name} sticker`}
      width={96}
      height={96}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export default function MessageStickers({
  stickers,
  className = "",
}: MessageStickersProps) {
  if (!stickers.length) return null;
  return (
    <div className={`message-stickers${className ? ` ${className}` : ""}`}>
      {stickers.map((sticker, index) => (
        <figure
          className="message-sticker"
          key={sticker.id || `sticker-${index}`}
        >
          <StickerImage sticker={sticker} />
          <figcaption>{sticker.name?.trim() || "Sticker"}</figcaption>
        </figure>
      ))}
    </div>
  );
}
