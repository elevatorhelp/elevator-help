import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type IncomingChunk = {
  id: string;
  text: string;
  sourceFileId: string;
  fileName: string;
  sourcePath: string;
  page: number;
  chunkIndex: number;
  modifiedTime?: string;
  languageHint?: string | null;
  documentGroupHint?: string | null;
};

type EnrichedMetadata = {
  id: string;
  manufacturer: string | null;
  controller: string | null;
  contentType: string;
  faultFamily: string | null;
  faultCode: string | null;
  faultName: string | null;
  language: string | null;
  documentGroup: string | null;
};

const MAX_BATCH_SIZE = 8;
const MAX_TEXT_LENGTH = 5000;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(withoutFence);
  } catch {}

  const first = withoutFence.indexOf("{");
  const last = withoutFence.lastIndexOf("}");

  if (first !== -1 && last > first) {
    return JSON.parse(withoutFence.slice(first, last + 1));
  }

  throw new Error("Could not parse enrichment JSON");
}

function normalizeNullable(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "unknown") {
    return null;
  }
  return trimmed;
}

function normalizeContentType(value: unknown) {
  const allowed = new Set([
    "fault",
    "wiring",
    "commissioning",
    "parameter",
    "door",
    "maintenance",
    "standard",
    "planning",
    "traffic-analysis",
    "general",
  ]);

  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "general";
  return allowed.has(normalized) ? normalized : "general";
}

async function enrichChunks(chunks: IncomingChunk[], apiKey: string) {
  const payload = chunks.map((chunk) => ({
    id: chunk.id,
    fileName: chunk.fileName,
    sourcePath: chunk.sourcePath,
    page: chunk.page,
    languageHint: chunk.languageHint || null,
    documentGroupHint: chunk.documentGroupHint || null,
    text: chunk.text,
  }));

  const prompt = `
You classify chunks from elevator technical documentation for a retrieval system.

Return exactly one JSON object with this shape:
{
  "items": [
    {
      "id": "same id as input",
      "manufacturer": "string or null",
      "controller": "string or null",
      "contentType": "fault | wiring | commissioning | parameter | door | maintenance | standard | planning | traffic-analysis | general",
      "faultFamily": "string or null",
      "faultCode": "string or null",
      "faultName": "string or null",
      "language": "ISO-style source language code such as de, en, de-en, or null",
      "documentGroup": "stable document family string or null"
    }
  ]
}

Rules:
- Use only evidence present in the file name, source path, hints, or chunk text.
- Never invent manufacturer, controller, fault code, fault family, or fault name.
- Preserve exact manufacturer/controller/fault naming when it is explicit.
- A folder name such as 02_NEW-Lift, 10_KONE, 11_Schindler, 12_Otis, 13_TKE, 21_Sematic, 03_Weber, or 05_Ziehl-Abegg is valid manufacturer evidence.
- If the chunk is a fault/error description, use contentType "fault".
- Prefer languageHint and documentGroupHint when supplied and plausible.
- Do not add explanations outside the JSON.

Chunks:
${JSON.stringify(payload)}
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
          maxOutputTokens: 2200,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini enrichment error: ${await response.text()}`);
  }

  const data: any = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  if (!raw) throw new Error("Gemini returned no enrichment output");

  const parsed = parseJsonObject(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const byId = new Map<string, any>(items.map((item: any) => [String(item?.id || ""), item]));

  return chunks.map((chunk): EnrichedMetadata => {
    const item = byId.get(chunk.id) || {};

    return {
      id: chunk.id,
      manufacturer: normalizeNullable(item.manufacturer),
      controller: normalizeNullable(item.controller),
      contentType: normalizeContentType(item.contentType),
      faultFamily: normalizeNullable(item.faultFamily),
      faultCode: normalizeNullable(item.faultCode),
      faultName: normalizeNullable(item.faultName),
      language: normalizeNullable(item.language) || normalizeNullable(chunk.languageHint),
      documentGroup:
        normalizeNullable(item.documentGroup) || normalizeNullable(chunk.documentGroupHint),
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const expectedToken = process.env.INGESTION_TOKEN;
    const auth = request.headers.get("authorization") || "";

    if (!expectedToken || auth !== `Bearer ${expectedToken}`) {
      return unauthorized();
    }

    const body: any = await request.json();
    const action = body?.action || "upsert";
    const { env } = getCloudflareContext();
    const vectorize = (env as any).VECTORIZE;

    if (action === "delete") {
      const ids = Array.isArray(body?.ids)
        ? body.ids.filter((id: unknown) => typeof id === "string" && id.length > 0).slice(0, 500)
        : [];

      if (!ids.length) {
        return NextResponse.json({ ok: true, deleted: 0 });
      }

      await vectorize.deleteByIds(ids);
      return NextResponse.json({ ok: true, deleted: ids.length });
    }

    const chunks: IncomingChunk[] = Array.isArray(body?.chunks) ? body.chunks : [];

    if (!chunks.length || chunks.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { ok: false, error: `chunks must contain 1-${MAX_BATCH_SIZE} items` },
        { status: 400 }
      );
    }

    for (const chunk of chunks) {
      if (
        !chunk ||
        typeof chunk.id !== "string" ||
        typeof chunk.text !== "string" ||
        typeof chunk.sourceFileId !== "string" ||
        typeof chunk.fileName !== "string" ||
        typeof chunk.sourcePath !== "string" ||
        !Number.isInteger(chunk.page) ||
        !Number.isInteger(chunk.chunkIndex)
      ) {
        return NextResponse.json({ ok: false, error: "Invalid chunk payload" }, { status: 400 });
      }

      if (chunk.text.length > MAX_TEXT_LENGTH) {
        return NextResponse.json({ ok: false, error: "Chunk text is too large" }, { status: 400 });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const ai = (env as any).AI;

    if (!apiKey || !ai || !vectorize) {
      throw new Error("Ingestion dependencies are not configured");
    }

    const enriched = await enrichChunks(chunks, apiKey);
    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
      text: chunks.map((chunk) => chunk.text),
    });

    const embeddings = (embeddingResult as any).data;

    if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
      throw new Error("Embedding count does not match chunk count");
    }

    const vectors = chunks.map((chunk, index) => {
      const meta = enriched[index];
      const metadata: Record<string, string | number> = {
        text: chunk.text,
        sourceFileId: chunk.sourceFileId,
        fileName: chunk.fileName,
        sourcePath: chunk.sourcePath,
        page: chunk.page,
        chunkIndex: chunk.chunkIndex,
      };

      if (chunk.modifiedTime) metadata.modifiedTime = chunk.modifiedTime;
      if (meta.manufacturer) metadata.manufacturer = meta.manufacturer;
      if (meta.controller) metadata.controller = meta.controller;
      if (meta.contentType) metadata.contentType = meta.contentType;
      if (meta.faultFamily) metadata.faultFamily = meta.faultFamily;
      if (meta.faultCode) metadata.faultCode = meta.faultCode;
      if (meta.faultName) metadata.faultName = meta.faultName;
      if (meta.language) metadata.language = meta.language;
      if (meta.documentGroup) metadata.documentGroup = meta.documentGroup;

      return {
        id: chunk.id,
        values: embeddings[index],
        metadata,
      };
    });

    await vectorize.upsert(vectors);

    return NextResponse.json({
      ok: true,
      upserted: vectors.length,
      ids: vectors.map((vector) => vector.id),
      enrichment: enriched,
    });
  } catch (error) {
    console.error("Drive ingestion error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
