import { fmt } from "../lib/format";

interface WordCloudProps {
  exportId: string;
  words: Array<{ word: string; count: number }>;
}

export default function WordCloud({ exportId, words }: WordCloudProps) {
  if (!words.length) return null;
  const max = Math.max(1, ...words.map((word) => word.count));
  const min = Math.min(...words.map((word) => word.count));
  return (
    <article className="insight-panel">
      <header className="insight-panel-head">
        <div>
          <span className="module-kicker">Words</span>
          <h2>What keeps coming up</h2>
        </div>
        <p>Click a word to search · stop words removed</p>
      </header>
      <div className="word-cloud">
        {words.map((word) => {
          const ratio = (word.count - min) / Math.max(1, max - min);
          const size = 0.88 + ratio * 1.45;
          return (
            <a
              key={word.word}
              className="word-chip"
              style={{
                fontSize: `${size.toFixed(2)}rem`,
                opacity: 0.55 + ratio * 0.45,
              }}
              href={`#/explorer/${encodeURIComponent(
                exportId
              )}/messages?q=${encodeURIComponent(word.word)}`}
              title={`${fmt(word.count)} occurrences — search messages`}
            >
              {word.word}
              <sup>{fmt(word.count)}</sup>
            </a>
          );
        })}
      </div>
    </article>
  );
}
