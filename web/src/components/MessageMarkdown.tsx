import { useState } from "react";
import type { ReactNode } from "react";

interface MessageMarkdownProps {
  content: string;
  className?: string;
}

const FENCE = /^\s*```(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const LIST = /^\s*([-*]|\d+\.)\s+(.*)$/;

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : null;
  } catch {
    return null;
  }
}

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      className={`md-spoiler${shown ? " md-spoiler--shown" : ""}`}
      aria-label={shown ? "Hide spoiler" : "Show spoiler"}
      onClick={(event) => {
        event.stopPropagation();
        setShown((value) => !value);
      }}
    >
      {children}
    </button>
  );
}


function CustomEmoji({
  name,
  id,
  animated,
}: {
  name: string;
  id: string;
  animated: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="md-emoji md-emoji--fallback" title={`:${name}:`}>
        {name}
      </span>
    );
  }
  return (
    <img
      className="md-emoji"
      src={`https://cdn.discordapp.com/emojis/${id}.${
        animated ? "gif" : "png"
      }?size=32`}
      alt={`:${name}:`}
      title={`:${name}:`}
      width={20}
      height={20}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function timestampLabel(raw: string): string {
  const match = raw.match(/^t:(-?\d+)/);
  const seconds = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(seconds)) return raw;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function renderInline(text: string, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;

  function flush() {
    if (buffer) {
      nodes.push(buffer);
      buffer = "";
    }
  }

  function push(node: ReactNode) {
    flush();
    nodes.push(node);
  }

  while (index < text.length) {
    const char = text[index];

    if (char === "\\" && index + 1 < text.length) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    if (char === "\n") {
      push(<br key={`${prefix}-br-${index}`} />);
      index += 1;
      continue;
    }

    if (char === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        push(
          <code key={`${prefix}-code-${index}`}>
            {text.slice(index + 1, end)}
          </code>
        );
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        push(
          <strong key={`${prefix}-strong-${index}`}>
            {renderInline(text.slice(index + 2, end), `${prefix}-b-${index}`)}
          </strong>
        );
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith("__", index)) {
      const end = text.indexOf("__", index + 2);
      if (end > index + 2) {
        push(
          <u key={`${prefix}-underline-${index}`}>
            {renderInline(text.slice(index + 2, end), `${prefix}-u-${index}`)}
          </u>
        );
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith("~~", index)) {
      const end = text.indexOf("~~", index + 2);
      if (end > index + 2) {
        push(
          <s key={`${prefix}-strike-${index}`}>
            {renderInline(text.slice(index + 2, end), `${prefix}-s-${index}`)}
          </s>
        );
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith("||", index)) {
      const end = text.indexOf("||", index + 2);
      if (end > index + 2) {
        push(
          <Spoiler key={`${prefix}-spoiler-${index}`}>
            {renderInline(text.slice(index + 2, end), `${prefix}-sp-${index}`)}
          </Spoiler>
        );
        index = end + 2;
        continue;
      }
    }

    if (
      (char === "*" || char === "_") &&
      text[index + 1] &&
      !/\s/.test(text[index + 1])
    ) {
      const end = text.indexOf(char, index + 1);
      if (end > index + 1) {
        push(
          <em key={`${prefix}-em-${index}`}>
            {renderInline(text.slice(index + 1, end), `${prefix}-e-${index}`)}
          </em>
        );
        index = end + 1;
        continue;
      }
    }

    if (char === ":") {
      const shortcode = text.slice(index).match(/^:([A-Za-z0-9_~]{2,32}):/);
      if (shortcode && /[A-Z_]/.test(shortcode[1])) {
        push(
          <span
            className="md-emoji md-emoji--fallback"
            key={`${prefix}-shortcode-${index}`}
            title={shortcode[0]}
          >
            {shortcode[1]}
          </span>
        );
        index += shortcode[0].length;
        continue;
      }
    }

    if (char === "[") {
      const middle = text.indexOf("](", index + 1);
      const end = middle >= 0 ? text.indexOf(")", middle + 2) : -1;
      if (middle > index && end > middle + 2) {
        const label = text.slice(index + 1, middle);
        const href = safeUrl(text.slice(middle + 2, end));
        if (href) {
          push(
            <a
              key={`${prefix}-link-${index}`}
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {renderInline(label, `${prefix}-l-${index}`)}
            </a>
          );
          index = end + 1;
          continue;
        }
      }
    }

    if (char === "<") {
      const end = text.indexOf(">", index + 1);
      if (end > index) {
        const token = text.slice(index + 1, end);
        const angleUrl = token.match(/^https?:\/\/\S+$/i);
        if (angleUrl) {
          const href = safeUrl(token);
          if (href) {
            push(
              <a
                key={`${prefix}-angle-${index}`}
                href={href}
                target="_blank"
                rel="noreferrer"
              >
                {token}
              </a>
            );
            index = end + 1;
            continue;
          }
        }
        const user = token.match(/^@!?(\d+)$/);
        if (user) {
          push(
            <span
              className="md-mention"
              key={`${prefix}-user-${index}`}
              title={`User ${user[1]}`}
            >
              @user
            </span>
          );
          index = end + 1;
          continue;
        }
        const channel = token.match(/^#(\d+)$/);
        if (channel) {
          push(
            <span
              className="md-mention"
              key={`${prefix}-channel-${index}`}
              title={`Channel ${channel[1]}`}
            >
              #channel
            </span>
          );
          index = end + 1;
          continue;
        }
        const role = token.match(/^@&(\d+)$/);
        if (role) {
          push(
            <span
              className="md-mention"
              key={`${prefix}-role-${index}`}
              title={`Role ${role[1]}`}
            >
              @role
            </span>
          );
          index = end + 1;
          continue;
        }
        const emoji = token.match(/^(a)?:([A-Za-z0-9_~]+):(\d+)$/);
        if (emoji) {
          push(
            <CustomEmoji
              key={`${prefix}-emoji-${index}`}
              name={emoji[2]}
              id={emoji[3]}
              animated={Boolean(emoji[1])}
            />
          );
          index = end + 1;
          continue;
        }
        const time = token.match(/^t:(-?\d+)(?::[tTdDfFR])?$/);
        if (time) {
          push(
            <span
              className="md-timestamp"
              key={`${prefix}-time-${index}`}
            >
              {timestampLabel(token)}
            </span>
          );
          index = end + 1;
          continue;
        }
      }
    }

    if (text.startsWith("http://", index) || text.startsWith("https://", index)) {
      const match = text.slice(index).match(/^https?:\/\/[^\s<]+/i);
      if (match) {
        let raw = match[0];
        let trailing = "";
        while (/[.,!?;:)\]]$/.test(raw)) {
          trailing = raw.slice(-1) + trailing;
          raw = raw.slice(0, -1);
        }
        const href = safeUrl(raw);
        if (href) {
          push(
            <a
              key={`${prefix}-url-${index}`}
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {raw}
            </a>
          );
          buffer += trailing;
          index += match[0].length;
          continue;
        }
      }
    }

    buffer += char;
    index += 1;
  }

  flush();
  return nodes;
}

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    QUOTE.test(line) ||
    HEADING.test(line) ||
    LIST.test(line)
  );
}

function renderBlocks(content: string): ReactNode[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const language = (fence[1] ?? "").trim();
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <div className="md-code" key={`code-${key++}`}>
          {language ? (
            <span className="md-code-lang">{language}</span>
          ) : null}
          <pre>
            <code>{code.join("\n")}</code>
          </pre>
        </div>
      );
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const current = lines[index].match(QUOTE);
        if (!current) break;
        quoteLines.push(current[1]);
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${key++}`}>
          {quoteLines.map((value, lineIndex) => (
            <p key={`quote-${lineIndex}`}>
              {renderInline(value, `q-${key}-${lineIndex}`)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      const HeadingTag = `h${Math.min(level + 2, 6)}` as
        | "h3"
        | "h4"
        | "h5";
      blocks.push(
        <HeadingTag className="md-heading" key={`heading-${key++}`}>
          {renderInline(heading[2], `h-${key}`)}
        </HeadingTag>
      );
      index += 1;
      continue;
    }

    const list = line.match(LIST);
    if (list) {
      const ordered = /^\d+\.$/.test(list[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].match(LIST);
        if (!current) break;
        if (/^\d+\.$/.test(current[1]) !== ordered) break;
        items.push(current[2]);
        index += 1;
      }
      const ListTag = (ordered ? "ol" : "ul") as "ol" | "ul";
      blocks.push(
        <ListTag key={`list-${key++}`}>
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>
              {renderInline(item, `li-${key}-${itemIndex}`)}
            </li>
          ))}
        </ListTag>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${key++}`}>
        {renderInline(paragraph.join("\n"), `p-${key}`)}
      </p>
    );
  }

  return blocks;
}

/**
 * Discord-flavoured markdown rendered as React nodes. It never injects HTML,
 * so exported message text cannot act as markup on the console.
 */
export default function MessageMarkdown({
  content,
  className = "",
}: MessageMarkdownProps) {
  if (!content.trim()) return null;
  return (
    <div className={`message-markdown${className ? ` ${className}` : ""}`}>
      {renderBlocks(content)}
    </div>
  );
}
