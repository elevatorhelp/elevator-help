import {stageExactEvidence,publishFullGeneration} from "../../lib/ingestion-full-publication";
import {hasExactStagedVectorReadback,hasBoundedFullPublicationManifest,hasBoundedRawPublicationManifest,hasReadyRawStagedVectors} from "../../lib/ingestion-vector-readback";
import {claimIngestionLease,renewIngestionLease,leaseDuration} from "../../lib/ingestion-lease-operations";
import {stagedVectorId,recordStagedBatch,publishExactStagedManifest} from "../../lib/ingestion-generation-publication";
import { assertActiveIngestionLease, guardedIngestionSideEffect, parseIngestionLease } from "../../lib/ingestion-lease-guard";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import {
  canonicalManufacturer,
  extractFaultCode,
} from "../../lib/fault-context";
import {
  MULTILINGUAL_EMBEDDING_VERSION,
  embedRetrievalDocuments,
} from "../../lib/multilingual-embedding";
import {
  createGeminiCallBudget,
  type FetchLike,
} from "../../lib/gemini-cost-control";
import {
  extractClauseNumbers,
} from "../../lib/standard-identifiers";
import { extractReferenceIdentifiers } from "../../lib/reference-identifiers";

type IncomingChunk = {
  id: string;
  text: string;
  sourceFileId: string;
  fileName: string;
  sourcePath: string;
  page: number;
  chunkIndex: number;
  modifiedTime?: string;
  sourceFingerprint?: string;
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
  retrievalContext: string | null;
};

const MAX_BATCH_SIZE = 8;
const MAX_TEXT_LENGTH = 5000;
const MAX_RETRIEVAL_CONTEXT_LENGTH = 700;
const RAW_EMBEDDING_VERSION = MULTILINGUAL_EMBEDDING_VERSION;
const ARCHIVE_INDEX_VERSION = 3;

async function runD1Batch(db: any, statements: any[]) {
  for (let index = 0; index < statements.length; index += 80) {
    await db.batch(statements.slice(index, index + 80));
  }
}

async function archiveFtsEnabled(db: any) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE name = 'archive_chunk_search_fts'").first();
  return Boolean(row);
}

async function removeArchiveChunks(db: any, ids: string[]) {
  if (!db || !ids.length) return;
  const ftsEnabled = await archiveFtsEnabled(db);
  const statements = ids.flatMap((id) => [
    db.prepare("DELETE FROM archive_chunk_identifiers WHERE chunk_id = ?").bind(id),
    db.prepare("DELETE FROM archive_chunk_clauses WHERE chunk_id = ?").bind(id),
    ...(ftsEnabled ? [db.prepare(
      "DELETE FROM archive_chunk_search_fts WHERE rowid IN (SELECT rowid FROM archive_chunk_search WHERE chunk_id = ?)"
    ).bind(id)] : []),
    db.prepare("DELETE FROM archive_chunk_search WHERE chunk_id = ?").bind(id),
    db.prepare("DELETE FROM archive_chunks WHERE id = ?").bind(id),
  ]);
  await runD1Batch(db, statements);
}

async function indexArchiveChunks(
  db: any,
  chunks: IncomingChunk[],
  enriched: EnrichedMetadata[],
) {
  if (!db) throw new Error("Archive evidence index is not configured");
  const ftsEnabled = await archiveFtsEnabled(db);
  const now = Date.now();
  const statements: any[] = [];
  // Repeated archive scans must not rewrite unchanged evidence, compact JSON,
  // or FTS rows. D1's free-tier row-write quota is shared with live traffic.
  const existingRows = await Promise.all(chunks.map((chunk) =>
    db.prepare(`SELECT c.text, c.source_file_id, c.file_name, c.source_path,
      c.page, c.chunk_index, c.content_type, c.source_fingerprint,
      EXISTS(SELECT 1 FROM archive_chunk_search s WHERE s.chunk_id = c.id) AS has_search
      FROM archive_chunks c WHERE c.id = ?`).bind(chunk.id).first(),
  ));
  chunks.forEach((chunk, index) => {
    const metadata = enriched[index];
    const existing = existingRows[index];
    if (existing && existing.has_search === 1 &&
      existing.text === chunk.text &&
      existing.source_file_id === chunk.sourceFileId &&
      existing.file_name === chunk.fileName &&
      existing.source_path === chunk.sourcePath &&
      existing.page === chunk.page &&
      existing.chunk_index === chunk.chunkIndex &&
      existing.content_type === (metadata?.contentType || null) &&
      existing.source_fingerprint === (chunk.sourceFingerprint || null)) {
      return;
    }
    const sourceLabels = [
      ...chunk.sourcePath.split(/[\\/]/g),
      chunk.fileName.replace(/\.[^.]+$/i, ""),
      chunk.documentGroupHint,
      metadata?.manufacturer,
      metadata?.controller,
      metadata?.faultFamily,
      metadata?.faultCode,
      metadata?.faultName,
      metadata?.documentGroup,
    ];
    const identifiers = extractReferenceIdentifiers(chunk.text, sourceLabels);
    const clauses = extractClauseNumbers(chunk.text);
    statements.push(
      db
        .prepare(
          `INSERT INTO archive_chunks
            (id, text, source_file_id, file_name, source_path, page, chunk_index,
             content_type, source_fingerprint, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             text = excluded.text,
             source_file_id = excluded.source_file_id,
             file_name = excluded.file_name,
             source_path = excluded.source_path,
             page = excluded.page,
             chunk_index = excluded.chunk_index,
             content_type = excluded.content_type,
             source_fingerprint = excluded.source_fingerprint,
             updated_at = excluded.updated_at`,
        )
        .bind(
          chunk.id,
          chunk.text,
          chunk.sourceFileId,
          chunk.fileName,
          chunk.sourcePath,
          chunk.page,
          chunk.chunkIndex,
          metadata?.contentType || null,
          chunk.sourceFingerprint || null,
          now,
        ),
      // A single compact reference row replaces N per-identifier writes.
      // Historical rows remain readable until their chunks are reindexed.
      db.prepare(
        `INSERT INTO archive_chunk_search (chunk_id, identifiers_json, clauses_json)
         VALUES (?, ?, ?)
         ON CONFLICT(chunk_id) DO UPDATE SET
           identifiers_json = excluded.identifiers_json,
           clauses_json = excluded.clauses_json`,
      ).bind(chunk.id, JSON.stringify(identifiers), JSON.stringify(clauses)),
      // FTS narrows candidates before the exact JSON verification.
      ...(ftsEnabled ? [db.prepare(
        `INSERT OR REPLACE INTO archive_chunk_search_fts (rowid, identifier_keys)
         SELECT rowid, ? FROM archive_chunk_search WHERE chunk_id = ?`
      ).bind(identifiers.map((item) => item.key).join(" "), chunk.id)] : []),
    );
  });
  await runD1Batch(db, statements);
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 },
  );
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

  // Enrichment is optional metadata. If Gemini emits malformed JSON, keep the
  // raw chunk ingestible instead of failing the entire batch; deterministic
  // manufacturer/fault extraction below still preserves exact identifiers.
  return { items: [] };
}

function normalizeNullable(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "null" ||
    trimmed.toLowerCase() === "unknown"
  ) {
    return null;
  }
  return trimmed;
}

function normalizeRetrievalContext(value: unknown) {
  const normalized = normalizeNullable(value);
  return normalized ? normalized.slice(0, MAX_RETRIEVAL_CONTEXT_LENGTH) : null;
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

  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "general";
  return allowed.has(normalized) ? normalized : "general";
}

async function enrichChunks(
  chunks: IncomingChunk[],
  apiKey: string,
  fetchImpl: FetchLike = fetch,
) {
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
      "documentGroup": "stable document family string or null",
      "retrievalContext": "short English retrieval description or null"
    }
  ]
}

Rules:
- Use only evidence present in the file name, source path, hints, or chunk text.
- Never invent manufacturer, controller, fault code, fault family, fault name, clause/section identifiers, requirements, values, or relationships.
- Preserve exact manufacturer/controller/fault naming when it is explicit.
- A folder name such as 02_NEW-Lift, 10_KONE, 11_Schindler, 12_Otis, 13_TKE, 21_Sematic, 03_Weber, or 05_Ziehl-Abegg is valid manufacturer evidence.
- If the chunk is a fault/error description, use contentType "fault".
- Prefer languageHint and documentGroupHint when supplied and plausible.
- retrievalContext is ONLY for semantic retrieval, never final evidence. Write it in concise technical English so an English embedding model can retrieve non-English source chunks.
- In retrievalContext, include exact visible standard/clause/section identifiers, component/controller/fault identifiers, and the main technical topic when present. Translate the topic into English when useful, but do not invent or reconstruct a requirement.
- Keep retrievalContext under ${MAX_RETRIEVAL_CONTEXT_LENGTH} characters. Use null only when the chunk contains no useful retrievable technical concept.
- Do not add explanations outside the JSON.

Chunks:
${JSON.stringify(payload)}
`;

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          maxOutputTokens: 3200,
        },
      }),
    },
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
  const byId = new Map<string, any>(
    items.map((item: any) => [String(item?.id || ""), item]),
  );

  return chunks.map((chunk): EnrichedMetadata => {
    const item = byId.get(chunk.id) || {};
    const faultDocument = /(?:fault|error|fehler|code|خطا|کد)/i.test(
      `${chunk.sourcePath} ${chunk.fileName}`,
    );
    const deterministicFaultCode = extractFaultCode(chunk.text, faultDocument);
    const deterministicManufacturer = canonicalManufacturer(
      `${chunk.sourcePath} ${chunk.fileName} ${chunk.text.slice(0, 500)}`,
    );
    const retrievalContext = normalizeRetrievalContext(item.retrievalContext);

    return {
      id: chunk.id,
      manufacturer:
        normalizeNullable(item.manufacturer) || deterministicManufacturer,
      controller: normalizeNullable(item.controller),
      contentType: deterministicFaultCode
        ? "fault"
        : normalizeContentType(item.contentType),
      faultFamily: normalizeNullable(item.faultFamily),
      faultCode: normalizeNullable(item.faultCode) || deterministicFaultCode,
      faultName: normalizeNullable(item.faultName),
      language:
        normalizeNullable(item.language) ||
        normalizeNullable(chunk.languageHint),
      documentGroup:
        normalizeNullable(item.documentGroup) ||
        normalizeNullable(chunk.documentGroupHint),
      retrievalContext:
        deterministicFaultCode &&
        !retrievalContext?.includes(deterministicFaultCode)
          ? `Exact fault code ${deterministicFaultCode}. ${retrievalContext || ""}`.trim()
          : retrievalContext,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    // Cloudflare runtime secrets are env bindings; process.env is not guaranteed
    // to mirror them (notably under deployed OpenNext Workers).
    const { env: runtimeEnv } = getCloudflareContext();
    const runtimeValue = (name: string): string | undefined => {
      const value = (runtimeEnv as any)?.[name];
      return typeof value === "string" ? value : process.env[name];
    };
    const expectedToken = runtimeValue("INGESTION_TOKEN");
    const auth = request.headers.get("authorization") || "";

    if (!expectedToken || auth !== `Bearer ${expectedToken}`) {
      return unauthorized();
    }

    const body: any = await request.json();
    // Standalone document-scoped lease actions run BEFORE the normal lease preflight.
    // They require the same private INGESTION_TOKEN; never enable public access.
    if (body?.action === "lease_claim" || body?.action === "lease_renew") {
      if (runtimeValue("INGESTION_STAGED_PUBLICATION") !== "true" ||
          runtimeValue("INGESTION_LEASE_PREFLIGHT") !== "true")
        return NextResponse.json({ok:false,error:"STAGED_LEASE_DISABLED"},{status:409});
      const db=(runtimeEnv as any).CORTEX_DB;
      try {
        const duration=leaseDuration(body?.durationMs);
        if(body.action === "lease_claim") {
          const lease=await claimIngestionLease(db,body?.documentId,body?.owner,duration);
          if(lease){
            await db.prepare("INSERT OR IGNORE INTO ingestion_document_publications "+
              "(document_id,job_key,active_generation,updated_at_ms) VALUES(?,?,0,?)")
              .bind(lease.jobKey,lease.jobKey,Date.now()).run();
          }
          return NextResponse.json({ok:Boolean(lease),lease},
            {status:lease?200:409});
        }
        const lease=parseIngestionLease(body?.lease);
        if(!lease)return NextResponse.json({ok:false,error:"INVALID_LEASE"},{status:400});
        const renewed=await renewIngestionLease(db,lease,duration);
        return NextResponse.json({ok:renewed,renewed},{status:renewed?200:409});
      } catch {
        return NextResponse.json({ok:false,error:"LEASE_ACTION_FAILED"},{status:409});
      }
    }

    const guardWrite = async <T,>(operation: () => Promise<T>): Promise<T> => {
      if (runtimeValue("INGESTION_LEASE_PREFLIGHT") !== "true") return operation();
      const lease = parseIngestionLease(body?.lease);
      if (!lease) throw new Error("INGESTION_LEASE_REQUIRED");
      const { env: leaseEnv } = getCloudflareContext();
      return guardedIngestionSideEffect((leaseEnv as any).CORTEX_DB, lease, operation);
    };

    // Opt-in preflight only. Not sufficient for safe parallel Vectorize writes:
    // a lease may expire after validation, before an external side effect.
    if (runtimeValue("INGESTION_LEASE_PREFLIGHT") === "true") {
      const lease = parseIngestionLease(body?.lease);
      if (!lease) return NextResponse.json({ ok: false, error: "INGESTION_LEASE_REQUIRED" }, { status: 409 });
      const { env: leaseEnv } = getCloudflareContext();
      try {
        await assertActiveIngestionLease((leaseEnv as any).CORTEX_DB, lease);
      } catch {
        return NextResponse.json({ ok: false, error: "INGESTION_LEASE_INVALID" }, { status: 409 });
      }
    }

    if (body?.action === "publish_full") {
      if(runtimeValue("INGESTION_COMPLETE_PUBLICATION") !== "true" ||
         runtimeValue("INGESTION_STAGED_PUBLICATION") !== "true" ||
         runtimeValue("INGESTION_LEASE_PREFLIGHT") !== "true")
        return NextResponse.json({ok:false,error:"FULL_PUBLICATION_DISABLED"},{status:409});
      const lease=parseIngestionLease(body?.lease);
      const rawIds=body?.rawIds, evidenceIds=body?.evidenceIds, mapIds=body?.mapIds;
      if(!lease||lease.jobKey!==body?.documentId||
         !Array.isArray(rawIds)||!Array.isArray(evidenceIds)||!Array.isArray(mapIds)||
         typeof body?.sourceFingerprint!=="string")
        return NextResponse.json({ok:false,error:"INVALID_FULL_PUBLICATION_REQUEST"},{status:400});
      if(!hasBoundedFullPublicationManifest(rawIds,evidenceIds,mapIds,body.sourceFingerprint))
        return NextResponse.json({ok:false,error:"INVALID_FULL_PUBLICATION_MANIFEST"},{status:400});
      try{
        const {env: fullEnv}=getCloudflareContext();
        const db=(fullEnv as any).CORTEX_DB;
        await assertActiveIngestionLease(db,lease);
        // Vectorize acknowledgement is not search readiness. Verify *every*
        // staged RAW/MAP vector in both bindings before changing D1 visibility.
        const ids=[...rawIds,...mapIds].map((id:string)=>stagedVectorId(id,lease.generation));
        if(ids.length>100000||new Set(ids).size!==ids.length||ids.some((id:string)=>id.length>512))
          return NextResponse.json({ok:false,error:"FULL_MANIFEST_TOO_LARGE"},{status:400});
        for(const index of [(fullEnv as any).VECTORIZE,(fullEnv as any).VECTORIZE_V2]){
          if(!index?.getByIds)return NextResponse.json({ok:false,error:"VECTOR_READ_UNAVAILABLE"},{status:409});
          for(let start=0;start<ids.length;start+=20){
            const expected=ids.slice(start,start+20);
            const found=await index.getByIds(expected);
            if(!hasExactStagedVectorReadback(found,expected,body.documentId,body.sourceFingerprint))
              return NextResponse.json({ok:false,error:"STAGED_VECTOR_NOT_READY"},{status:409});
          }
        }
        const published=await publishFullGeneration(db,lease,body.sourceFingerprint,
          rawIds,evidenceIds,mapIds);
        return NextResponse.json({ok:published,published},{status:published?200:409});
      }catch{
        return NextResponse.json({ok:false,error:"FULL_PUBLICATION_FAILED"},{status:409});
      }
    }
    if (body?.action === "publish_staged") {
      if (runtimeValue("INGESTION_COMPLETE_PUBLICATION") === "true")
        return NextResponse.json({ok:false,error:"RAW_ONLY_PUBLICATION_DISABLED"},{status:409});
      if (runtimeValue("INGESTION_STAGED_PUBLICATION") !== "true" ||
          runtimeValue("INGESTION_LEASE_PREFLIGHT") !== "true")
        return NextResponse.json({ok:false,error:"STAGED_PUBLICATION_DISABLED"},{status:409});
      const lease = parseIngestionLease(body?.lease);
      const documentId = body?.documentId;
      const manifestIds = body?.manifestIds;
      const sourceFingerprint = body?.sourceFingerprint;
      if (!lease || typeof documentId !== "string" || lease.jobKey !== documentId ||
          !Array.isArray(manifestIds) || typeof sourceFingerprint !== "string")
        return NextResponse.json({ok:false,error:"INVALID_PUBLICATION_REQUEST"},{status:400});
      // Reject oversized or malformed RAW manifests before any remote Vectorize
      // reads. The D1 CAS alone cannot prove vectors are query-ready.
      if(!hasBoundedRawPublicationManifest(manifestIds,lease.generation,documentId,sourceFingerprint))
        return NextResponse.json({ok:false,error:"INVALID_PUBLICATION_MANIFEST"},{status:400});
      const {env: publishEnv} = getCloudflareContext();
      try {
        const ready = await hasReadyRawStagedVectors(
          [(publishEnv as any).VECTORIZE,(publishEnv as any).VECTORIZE_V2],
          manifestIds,lease.generation,documentId,sourceFingerprint);
        if(!ready)
          return NextResponse.json({ok:false,error:"STAGED_VECTOR_NOT_READY"},{status:409});
        const published = await publishExactStagedManifest(
          (publishEnv as any).CORTEX_DB,lease,documentId,sourceFingerprint,manifestIds);
        return NextResponse.json({ok:published,published},
          {status:published?200:409});
      } catch {
        return NextResponse.json({ok:false,error:"PUBLICATION_FAILED"},{status:409});
      }
    }
    const action = body?.action || "upsert";
    const { env } = getCloudflareContext();
    const vectorize = (env as any).VECTORIZE;
    const vectorizeV2 = (env as any).VECTORIZE_V2;
    const archiveDb = (env as any).CORTEX_DB;

    // The staged protocol currently covers RAW vectors only. Evidence rows use
    // active unversioned D1 identifiers, while delete can remove live rows.
    // Until evidence has generation-qualified storage and atomic publication,
    // reject these actions before any D1/Vectorize side effects.
    if (runtimeValue("INGESTION_STAGED_PUBLICATION") === "true" &&
        (action === "delete" || (action === "index_evidence" &&
          runtimeValue("INGESTION_COMPLETE_PUBLICATION") !== "true"))) {
      return NextResponse.json(
        { ok: false, error: "STAGED_EVIDENCE_PUBLICATION_NOT_IMPLEMENTED" },
        { status: 409 },
      );
    }

    if (action === "status") {
      return NextResponse.json({
        ok: true,
        rawEmbeddingVersion: RAW_EMBEDDING_VERSION,
        archiveIndexVersion: ARCHIVE_INDEX_VERSION,
        legacyConfigured: Boolean(vectorize),
        multilingualConfigured: Boolean(vectorizeV2),
        archiveIndexConfigured: Boolean(archiveDb),
      });
    }

    if (!vectorize || !vectorizeV2) {
      throw new Error("Vectorize ingestion bindings are not configured");
    }

    if (action === "delete") {
      const ids = Array.isArray(body?.ids)
        ? body.ids
            .filter((id: unknown) => typeof id === "string" && id.length > 0)
            .slice(0, 500)
        : [];

      if (!ids.length) {
        return NextResponse.json({ ok: true, deleted: 0 });
      }

      await Promise.all([
        guardWrite(() => vectorize.deleteByIds(ids)),
        guardWrite(() => vectorizeV2.deleteByIds(ids)),
      ]);
      await guardWrite(() => removeArchiveChunks(archiveDb, ids));
      return NextResponse.json({ ok: true, deleted: ids.length });
    }

    const chunks: IncomingChunk[] = Array.isArray(body?.chunks)
      ? body.chunks
      : [];

    if (!chunks.length || chunks.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { ok: false, error: `chunks must contain 1-${MAX_BATCH_SIZE} items` },
        { status: 400 },
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
        return NextResponse.json(
          { ok: false, error: "Invalid chunk payload" },
          { status: 400 },
        );
      }

      if (chunk.text.length > MAX_TEXT_LENGTH) {
        return NextResponse.json(
          { ok: false, error: "Chunk text is too large" },
          { status: 400 },
        );
      }
    }

    if (action === "index_evidence" &&
        runtimeValue("INGESTION_COMPLETE_PUBLICATION") === "true") {
      const lease=parseIngestionLease(body?.lease);
      if(!lease||chunks.some(chunk=>chunk.sourceFileId!==lease.jobKey))
        return NextResponse.json({ok:false,error:"INVALID_STAGED_EVIDENCE_LEASE"},{status:409});
      try{
        for(const chunk of chunks){
          const labels=[...chunk.sourcePath.split(/[\\/]/g),
            chunk.fileName.replace(/\\.[^.]+$/,""),chunk.documentGroupHint];
          const identifiers=extractReferenceIdentifiers(chunk.text,labels);
          const clauses=extractClauseNumbers(chunk.text);
          await stageExactEvidence(archiveDb,lease,{
            id:chunk.id,text:chunk.text,sourceFileId:chunk.sourceFileId,
            fileName:chunk.fileName,sourcePath:chunk.sourcePath,page:chunk.page,
            chunkIndex:chunk.chunkIndex,sourceFingerprint:chunk.sourceFingerprint||"",
            identifiersJson:JSON.stringify(identifiers),clausesJson:JSON.stringify(clauses)
          });
        }
        return NextResponse.json({ok:true,staged:true,indexed:chunks.length,
          archiveIndexVersion:ARCHIVE_INDEX_VERSION,ids:chunks.map(x=>x.id)});
      }catch{
        return NextResponse.json({ok:false,error:"STAGED_EVIDENCE_WRITE_FAILED"},{status:409});
      }
    }

    if (action === "index_evidence") {
      await guardWrite(() => indexArchiveChunks(
        archiveDb,
        chunks,
        chunks.map((chunk) => ({
          id: chunk.id,
          manufacturer: null,
          controller: null,
          contentType: "general",
          faultFamily: null,
          faultCode: null,
          faultName: null,
          language: chunk.languageHint || null,
          documentGroup: chunk.documentGroupHint || null,
          retrievalContext: null,
        })),
      ));
      return NextResponse.json({
        ok: true,
        indexed: chunks.length,
        archiveIndexVersion: ARCHIVE_INDEX_VERSION,
        ids: chunks.map((chunk) => chunk.id),
      });
    }

    // Validate staged revision before any paid embeddings or external Vectorize writes.
    // Never persist a receipt for an inconsistent source revision.
    if (runtimeValue("INGESTION_STAGED_PUBLICATION") === "true" &&
        chunks.some((v) => !v.sourceFingerprint ||
          v.sourceFingerprint !== chunks[0].sourceFingerprint)) {
      return NextResponse.json({ok:false,error:"STAGED_FINGERPRINT_MISMATCH"},{status:409});
    }

    const apiKey = runtimeValue("GEMINI_API_KEY");
    const ai = (env as any).AI;

    if (!apiKey || !ai) {
      throw new Error("Ingestion dependencies are not configured");
    }

    const geminiBudget = createGeminiCallBudget(
      (env as any).GEMINI_MAX_CALLS_PER_INGEST_REQUEST ?? 2,
    );
    const enriched = await enrichChunks(chunks, apiKey, geminiBudget.fetch);
    const embeddingTexts = chunks.map((chunk, index) => {
      const context = enriched[index]?.retrievalContext;
      return context
        ? `[RETRIEVAL CONTEXT]\n${context}\n\n[RAW SOURCE]\n${chunk.text}`
        : chunk.text;
    });
    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
      text: embeddingTexts,
    });

    const embeddings = (embeddingResult as any).data;
    const multilingualEmbeddings = await embedRetrievalDocuments(
      chunks.map((chunk) => chunk.text),
      apiKey,
      geminiBudget.fetch,
    );

    if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
      throw new Error("Embedding count does not match chunk count");
    }

    const vectorRecords = chunks.map((chunk, index) => {
      const meta = enriched[index];
      const metadata: Record<string, string | number> = {
        // Final standards evidence must remain the exact raw source text. The
        // Gemini retrieval context affects only vector values and is never stored
        // in this evidence field.
        text: chunk.text,
        sourceFileId: chunk.sourceFileId,
        fileName: chunk.fileName,
        sourcePath: chunk.sourcePath,
        page: chunk.page,
        chunkIndex: chunk.chunkIndex,
        status: "active",
      };

      if (chunk.modifiedTime) metadata.modifiedTime = chunk.modifiedTime;
      if (chunk.sourceFingerprint)
        metadata.sourceFingerprint = chunk.sourceFingerprint;
      if (meta.manufacturer) metadata.manufacturer = meta.manufacturer;
      if (meta.controller) metadata.controller = meta.controller;
      if (meta.contentType) metadata.contentType = meta.contentType;
      if (meta.faultFamily) metadata.faultFamily = meta.faultFamily;
      if (meta.faultCode) metadata.faultCode = meta.faultCode;
      if (meta.faultName) metadata.faultName = meta.faultName;
      if (meta.language) metadata.language = meta.language;
      if (meta.documentGroup) metadata.documentGroup = meta.documentGroup;

      return { chunk, metadata, index };
    });

    // Opt-in staged publication. Only one source document per request, and its
    // lease key must equal the sourceFileId. Otherwise fail closed.
    const staged = runtimeValue("INGESTION_STAGED_PUBLICATION") === "true";
    const publicationLease = staged ? parseIngestionLease(body?.lease) : null;
    const sourceId = chunks[0]?.sourceFileId;
    if (staged && (!publicationLease || !archiveDb ||
        chunks.some((chunk) => chunk.sourceFileId !== sourceId) ||
        publicationLease.jobKey !== sourceId ||
        runtimeValue("INGESTION_LEASE_PREFLIGHT") !== "true")) {
      return NextResponse.json({ok:false,error:"STAGED_PUBLICATION_REQUIRES_DOCUMENT_LEASE"},{status:409});
    }
    const legacyVectors = vectorRecords.map(({ chunk, metadata, index }) => ({
      id: staged ? stagedVectorId(chunk.id, publicationLease!.generation) : chunk.id,
      values: embeddings[index],
      metadata: { ...metadata, embeddingVersion: 2 },
    }));
    const multilingualVectors = vectorRecords.map(
      ({ chunk, metadata, index }) => ({
        id: staged ? stagedVectorId(chunk.id, publicationLease!.generation) : chunk.id,
        values: multilingualEmbeddings[index],
        metadata: { ...metadata, embeddingVersion: RAW_EMBEDDING_VERSION },
      }),
    );

    await guardWrite(() => vectorize.upsert(legacyVectors));
    await guardWrite(() => vectorizeV2.upsert(multilingualVectors));
    if (staged) {
      // Staging is intentionally NOT published per batch: a multi-batch file
      // must be fully staged and validated before a single final CAS commit.
      await recordStagedBatch(archiveDb,publicationLease!,sourceId,chunks.map(v=>v.id),chunks[0].sourceFingerprint);
      return NextResponse.json({
        ok:true,staged:true,published:false,
        upserted:multilingualVectors.length,
        rawEmbeddingVersion:RAW_EMBEDDING_VERSION,
        archiveIndexVersion:ARCHIVE_INDEX_VERSION,
        ids:multilingualVectors.map(v=>v.id)
      });
    } else {
      await guardWrite(() => indexArchiveChunks(archiveDb, chunks, enriched));
    }

    return NextResponse.json({
      ok: true,
      upserted: multilingualVectors.length,
      rawEmbeddingVersion: RAW_EMBEDDING_VERSION,
      archiveIndexVersion: ARCHIVE_INDEX_VERSION,
      ids: multilingualVectors.map((vector) => vector.id),
      enrichment: enriched.map(
        ({ retrievalContext: _retrievalContext, ...metadata }) => metadata,
      ),
    });
  } catch (error) {
    console.error("Drive ingestion error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
