import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type PageInput = {
  page: number;
  text: string;
};

type DocumentInput = {
  sourceFileId: string;
  fileName: string;
  sourcePath: string;
  modifiedTime?: string;
  languageHint?: string | null;
  documentGroupHint?: string | null;
};

type MapNode = {
  nodeType: string;
  sectionId: string | null;
  parentSection: string | null;
  title: string | null;
  topics: string[];
  summary: string;
  pageStart: number;
  pageEnd: number;
};

const MAX_PAGES = 6;
const MAX_TOTAL_TEXT = 45000;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function parseJsonObject(text: string) {
  const trimmed = String(text || "").trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  const cleaned = candidates[candidates.length - 1];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
  throw new Error("Could not parse document-map JSON");
}

function cleanNullable(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 220) : null;
}

function cleanTopics(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.slice(0, 80))
    )
  ).slice(0, 10);
}

function clampPage(value: unknown, minPage: number, maxPage: number) {
  const page = Number(value);
  if (!Number.isInteger(page)) return minPage;
  return Math.max(minPage, Math.min(maxPage, page));
}

async function stableId(parts: string[]) {
  const bytes = new TextEncoder().encode(parts.join("\u001f"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `map-${hex.slice(0, 40)}`;
}

async function analyzeDocumentWindow(
  document: DocumentInput,
  pages: PageInput[],
  apiKey: string
): Promise<MapNode[]> {
  const firstPage = pages[0]?.page || 1;
  const lastPage = pages[pages.length - 1]?.page || firstPage;

  const prompt = `
You are building a structured knowledge map for a professional elevator-engineering assistant.
Analyze ONLY the supplied document pages. Do not use outside knowledge.

Document:
${JSON.stringify({
  fileName: document.fileName,
  sourcePath: document.sourcePath,
  languageHint: document.languageHint || null,
  documentGroupHint: document.documentGroupHint || null,
})}

Return exactly one JSON object:
{
  "items": [
    {
      "nodeType": "standard-clause | section | fault | procedure | parameter | component | planning-topic | table | general",
      "sectionId": "exact clause/section identifier when explicitly present, otherwise null",
      "parentSection": "explicit parent clause/section when safely derivable from the visible numbering, otherwise null",
      "title": "exact or concise section title, or null",
      "topics": ["short retrieval topics"],
      "summary": "concise factual description grounded only in these pages",
      "pageStart": ${firstPage},
      "pageEnd": ${lastPage}
    }
  ]
}

Rules:
- Build a navigation/knowledge map, not a user-facing answer.
- Preserve exact standard clause numbers, fault codes, controller names, component names, table numbers and technical terms when explicitly visible.
- Never invent a clause, value, requirement, manufacturer, controller, fault code, relationship or technical fact.
- Do not turn cross-references into requirements unless the requirement itself is visible in these pages.
- A node should represent one coherent retrievable concept.
- Prefer section/clause-level nodes over generic page summaries.
- For broad subjects, include useful topical labels such as shaft, structure, pit, headroom, lighting, access, doors, separation, drive, controller, fault, wiring, commissioning, maintenance, planning, traffic-analysis, or other document-specific terms.
- pageStart/pageEnd must stay inside the supplied page range.
- If these pages do not contain a useful retrievable concept, return {"items":[]}.
- No prose outside JSON.

Pages:
${JSON.stringify(pages)}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          maxOutputTokens: 3500,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini document-map error: ${await response.text()}`);
  }

  const data: any = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  if (!raw) return [];

  const parsed = parseJsonObject(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];

  return items
    .map((item: any): MapNode | null => {
      const summary = typeof item?.summary === "string" ? item.summary.trim() : "";
      if (!summary) return null;
      const pageStart = clampPage(item.pageStart, firstPage, lastPage);
      const pageEnd = Math.max(pageStart, clampPage(item.pageEnd, pageStart, lastPage));
      const nodeType =
        typeof item?.nodeType === "string" && item.nodeType.trim()
          ? item.nodeType.trim().toLowerCase().slice(0, 80)
          : "general";

      return {
        nodeType,
        sectionId: cleanNullable(item.sectionId),
        parentSection: cleanNullable(item.parentSection),
        title: cleanNullable(item.title),
        topics: cleanTopics(item.topics),
        summary: summary.slice(0, 1800),
        pageStart,
        pageEnd,
      };
    })
    .filter((item: MapNode | null): item is MapNode => Boolean(item))
    .slice(0, 30);
}

export async function POST(request: NextRequest) {
  try {
    const expectedToken = process.env.INGESTION_TOKEN;
    const auth = request.headers.get("authorization") || "";
    if (!expectedToken || auth !== `Bearer ${expectedToken}`) return unauthorized();

    const body: any = await request.json();
    const document: DocumentInput = body?.document;
    const pages: PageInput[] = Array.isArray(body?.pages) ? body.pages : [];

    if (
      !document ||
      typeof document.sourceFileId !== "string" ||
      typeof document.fileName !== "string" ||
      typeof document.sourcePath !== "string"
    ) {
      return NextResponse.json({ ok: false, error: "Invalid document payload" }, { status: 400 });
    }

    if (!pages.length || pages.length > MAX_PAGES) {
      return NextResponse.json(
        { ok: false, error: `pages must contain 1-${MAX_PAGES} items` },
        { status: 400 }
      );
    }

    let totalText = 0;
    for (const page of pages) {
      if (!Number.isInteger(page?.page) || typeof page?.text !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid page payload" }, { status: 400 });
      }
      totalText += page.text.length;
    }
    if (totalText > MAX_TOTAL_TEXT) {
      return NextResponse.json({ ok: false, error: "Document window is too large" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const { env } = getCloudflareContext();
    const ai = (env as any).AI;
    const vectorize = (env as any).VECTORIZE;
    if (!apiKey || !ai || !vectorize) throw new Error("Document-map dependencies are not configured");

    const nodes = await analyzeDocumentWindow(document, pages, apiKey);
    if (!nodes.length) return NextResponse.json({ ok: true, upserted: 0, ids: [], nodes: [] });

    const mapTexts = nodes.map((node) => {
      const lines = [
        "[DOCUMENT KNOWLEDGE MAP]",
        `Document: ${document.fileName}`,
        node.nodeType ? `Type: ${node.nodeType}` : "",
        node.sectionId ? `Section: ${node.sectionId}` : "",
        node.parentSection ? `Parent: ${node.parentSection}` : "",
        node.title ? `Title: ${node.title}` : "",
        node.topics.length ? `Topics: ${node.topics.join(", ")}` : "",
        `Pages: ${node.pageStart}-${node.pageEnd}`,
        `Summary: ${node.summary}`,
      ];
      return lines.filter(Boolean).join("\n");
    });

    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", { text: mapTexts });
    const embeddings = (embeddingResult as any).data;
    if (!Array.isArray(embeddings) || embeddings.length !== nodes.length) {
      throw new Error("Document-map embedding count mismatch");
    }

    const vectors = await Promise.all(
      nodes.map(async (node, index) => {
        const id = await stableId([
          document.sourceFileId,
          document.modifiedTime || "",
          String(node.pageStart),
          String(node.pageEnd),
          node.nodeType,
          node.sectionId || "",
          node.title || "",
          node.summary,
        ]);

        const metadata: Record<string, string | number> = {
          text: mapTexts[index],
          sourceFileId: document.sourceFileId,
          fileName: document.fileName,
          sourcePath: document.sourcePath,
          page: node.pageStart,
          pageEnd: node.pageEnd,
          chunkIndex: -1,
          contentType: "document-map",
          mapNodeType: node.nodeType,
        };
        if (document.modifiedTime) metadata.modifiedTime = document.modifiedTime;
        if (document.languageHint) metadata.language = document.languageHint;
        if (document.documentGroupHint) metadata.documentGroup = document.documentGroupHint;
        if (node.sectionId) metadata.sectionId = node.sectionId;
        if (node.parentSection) metadata.parentSection = node.parentSection;
        if (node.title) metadata.sectionTitle = node.title;
        if (node.topics.length) metadata.topics = node.topics.join(",");

        return { id, values: embeddings[index], metadata };
      })
    );

    await vectorize.upsert(vectors);

    return NextResponse.json({
      ok: true,
      upserted: vectors.length,
      ids: vectors.map((vector) => vector.id),
      nodes,
    });
  } catch (error) {
    console.error("Document-map ingestion error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
