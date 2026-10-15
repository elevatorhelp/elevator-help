export type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "emphasis"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

export type MarkdownBlock = {
  type: "paragraph" | "bullet" | "numbered" | "heading";
  level?: number;
  marker?: string;
  tokens: InlineToken[];
};

const INLINE_PATTERN =
  /(\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_))/g;

export function tokenizeInlineMarkdown(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;

  for (const match of value.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ type: "text", value: value.slice(cursor, index) });
    }

    if (match[2] || match[3]) {
      tokens.push({ type: "strong", value: match[2] || match[3] });
    } else if (match[4]) {
      tokens.push({ type: "code", value: match[4] });
    } else if (match[5] && match[6]) {
      tokens.push({ type: "link", value: match[5], href: match[6] });
    } else {
      tokens.push({ type: "emphasis", value: match[7] || match[8] || "" });
    }

    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    tokens.push({ type: "text", value: value.slice(cursor) });
  }

  return tokens.length ? tokens : [{ type: "text", value }];
}

export function parseSafeMarkdown(text: string): MarkdownBlock[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line): MarkdownBlock => {
      const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
      if (heading) {
        return {
          type: "heading",
          level: heading[1].length,
          tokens: tokenizeInlineMarkdown(heading[2]),
        };
      }

      const bullet = line.match(/^\s*[-+•]\s+(.+)$/);
      if (bullet) {
        return { type: "bullet", tokens: tokenizeInlineMarkdown(bullet[1]) };
      }

      const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (numbered) {
        return {
          type: "numbered",
          marker: line.trimStart().match(/^\d+/)?.[0] || "1",
          tokens: tokenizeInlineMarkdown(numbered[1]),
        };
      }

      return { type: "paragraph", tokens: tokenizeInlineMarkdown(line) };
    });
}
