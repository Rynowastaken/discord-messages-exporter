import { useEffect, useState } from "react";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  round?: boolean;
}

export default function Avatar({ src, name, round = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  const shape = round ? " avatar-icon--round" : "";

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        className={`avatar-icon avatar-icon--fallback${shape}`}
        aria-hidden="true"
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      className={`avatar-icon${shape}`}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
