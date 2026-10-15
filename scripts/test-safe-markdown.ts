import { parseSafeMarkdown } from "../app/lib/safe-markdown.ts";

const blocks = parseSafeMarkdown(
  "### Result\n**Requirement:** 50 mm\n- *Verified* in [source](https://example.com/doc)\n<script>alert(1)</script>",
);

if (blocks[0]?.type !== "heading" || blocks[0]?.level !== 3) {
  throw new Error("Markdown headings must be recognized");
}
if (blocks[1]?.tokens[0]?.type !== "strong") {
  throw new Error("Bold response labels must not be displayed as raw asterisks");
}
if (
  blocks[2]?.type !== "bullet" ||
  !blocks[2].tokens.some((token) => token.type === "link")
) {
  throw new Error("Bullets and safe HTTP links must be recognized");
}
if (
  blocks[3]?.tokens.length !== 1 ||
  blocks[3].tokens[0]?.type !== "text"
) {
  throw new Error("Raw HTML must remain inert text");
}

console.log("PASS: safe assistant Markdown rendering contract");
