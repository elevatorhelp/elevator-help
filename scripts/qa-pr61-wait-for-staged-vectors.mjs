// QA-only retry after asynchronous Cloudflare Vectorize writes.
// A successful upsert is not an immediately readable vector publication.
// Never write again or contact Gemini while polling this existing manifest.
// The API still checks BOTH physical indexes before permitting D1 publication.
export const QA_VECTOR_READBACK_ATTEMPTS = 24;
export const QA_VECTOR_READBACK_DELAY_MS = 5000;

export async function publishAfterVectorsAreReady(
  publishOnce,
  {sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {},
) {
  if (typeof publishOnce !== 'function' || typeof sleep !== 'function')
    throw new Error('QA_INVALID_READINESS_POLL_CALLBACK');
  for (let attempt = 1; attempt <= QA_VECTOR_READBACK_ATTEMPTS; attempt++) {
    const response = await publishOnce();
    if (response?.status === 200 && response.published === true) return response;
    if (response?.status !== 409 || response.error !== 'STAGED_VECTOR_NOT_READY')
      return response;
    if (attempt < QA_VECTOR_READBACK_ATTEMPTS)
      await sleep(QA_VECTOR_READBACK_DELAY_MS);
  }
  throw new Error('QA_STAGED_VECTORS_NOT_READY_AFTER_BOUNDED_RETRIES');
}
