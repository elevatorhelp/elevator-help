/** Preserve the transport status in isolated PR61 QA assertions.
 * A response JSON field named "status" must never override the HTTP status.
 * Do not include response bodies in thrown errors: QA payloads may be sensitive.
 */
export async function parseQaHttpResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('QA_NON_JSON_HTTP_' + response.status);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('QA_INVALID_JSON_HTTP_' + response.status);
  }
  return {...payload, status: response.status};
}
