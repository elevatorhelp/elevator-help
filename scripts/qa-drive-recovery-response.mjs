/** Preserve the actual HTTP status even if an untrusted JSON body has a `status` field. */
export async function parseQaDriveRecoveryResponse(response) {
  const body = await response.json();
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("QA_DRIVE_RESPONSE_NOT_OBJECT");
  }
  return {...body, status: response.status};
}
