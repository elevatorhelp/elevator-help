/** Verify that every read-back vector belongs to the exact staged source revision.
 * Vector IDs can be reused after a D1 Time Travel restore; ID-only checks can
 * therefore mistake stale Vectorize contents for a newly staged generation.
 * This guard is pure and performs no network calls or mutations.
 */
export function hasExactStagedVectorReadback(
  found: unknown,
  expectedIds: readonly string[],
  documentId: string,
  sourceFingerprint: string,
  kind?: "raw" | "map",
): boolean {
  if (!Array.isArray(found) || !Array.isArray(expectedIds) ||
      expectedIds.length < 1 || expectedIds.length > 20 ||
      expectedIds.some(id => typeof id !== "string" || !id) ||
      typeof documentId !== "string" || !documentId ||
      typeof sourceFingerprint !== "string" || !sourceFingerprint)
    return false;
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length) return false;
  const seen = new Set<string>();
  for (const vector of found) {
    if (!vector || typeof vector.id !== "string" ||
        !expected.has(vector.id) || seen.has(vector.id) ||
        !vector.metadata || typeof vector.metadata !== "object" ||
        vector.metadata.sourceFileId !== documentId ||
        vector.metadata.sourceFingerprint !== sourceFingerprint)
      return false;
    // A matching ID/revision is insufficient if its physical page or vector
    // kind is invalid; citations require an actual positive PDF page anchor.
    if (kind) {
      const meta = vector.metadata;
      if (!Number.isSafeInteger(meta.page) || meta.page < 1 ||
          (kind === "raw"
            ? meta.contentType === "document-map" ||
              !Number.isSafeInteger(meta.chunkIndex) || meta.chunkIndex < 0
            : meta.contentType !== "document-map" ||
              meta.chunkIndex !== -1 ||
              !Number.isSafeInteger(meta.pageEnd) || meta.pageEnd < meta.page))
        return false;
    }
    seen.add(vector.id);
  }
  return seen.size === expected.size;
}

/** Bound remote Vectorize getByIds calls before any external read or D1 CAS.
 * Each RAW/MAP ID is read from two physical indices in 20-ID batches.
 * Larger documents require a separately reviewed paginated verification flow.
 */
export const MAX_FULL_PUBLICATION_VECTOR_READBACK_IDS = 4096;
export function hasBoundedFullPublicationManifest(
  rawIds: unknown, evidenceIds: unknown, mapIds: unknown, fingerprint: unknown,
): boolean {
  const groups = [rawIds, evidenceIds, mapIds];
  if (typeof fingerprint !== "string" || !fingerprint.trim() ||
      fingerprint.length > 512 ||
      groups.some(xs => !Array.isArray(xs) || xs.length < 1 ||
        xs.length > MAX_FULL_PUBLICATION_VECTOR_READBACK_IDS ||
        xs.some(id => typeof id !== "string" || !id.trim() || id.length > 512) ||
        new Set(xs).size !== xs.length)) return false;
  const vectors = [...(rawIds as string[]), ...(mapIds as string[])];
  return vectors.length <= MAX_FULL_PUBLICATION_VECTOR_READBACK_IDS &&
    new Set(vectors).size === vectors.length;
}


/** Bound all RAW-only dual-Vectorize reads before D1 generation publication. */
export function hasBoundedRawPublicationManifest(ids:unknown,generation:number,documentId:string,fingerprint:string):boolean{
 if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_FULL_PUBLICATION_VECTOR_READBACK_IDS||
    ids.some(id=>typeof id!=="string"||!id.trim()||id.length>512)||
    new Set(ids).size!==ids.length||
    !Number.isSafeInteger(generation)||generation<1||
    typeof documentId!=="string"||!documentId||documentId.length>200||
    typeof fingerprint!=="string"||!fingerprint.trim()||fingerprint.length>512)return false;
 return ids.every(id=>`g${generation}:${id}`.length<=512);
}
/** Both independent indices must return every exact generation-qualified ID
 * with the expected document and revision before a RAW-only publication CAS. */
export async function hasReadyRawStagedVectors(indices:readonly unknown[],ids:unknown,
 generation:number,documentId:string,fingerprint:string):Promise<boolean>{
 if(!hasBoundedRawPublicationManifest(ids,generation,documentId,fingerprint)||
    !Array.isArray(indices)||indices.length!==2||
    indices.some(x=>!x||typeof (x as {getByIds?:unknown}).getByIds!=="function"))return false;
 const staged=(ids as string[]).map(id=>`g${generation}:${id}`);
 try{
  for(const index of indices){
   const reader=index as {getByIds(ids:string[]):Promise<unknown>};
   for(let start=0;start<staged.length;start+=20){
    const expected=staged.slice(start,start+20);
    if(!hasExactStagedVectorReadback(await reader.getByIds(expected),
      expected,documentId,fingerprint,"raw"))return false;
   }
  }
 }catch{return false;}
 return true;
}
