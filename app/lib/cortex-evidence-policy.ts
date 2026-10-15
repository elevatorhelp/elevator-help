export type EvidenceFallbackState = {
  evidenceNeed?: string | null;
  explicitWebRequest: boolean;
  internalEvidenceMissing: boolean;
  requiredVerificationMissing: boolean;
};

export function shouldUsePublicWebFallback(state: EvidenceFallbackState) {
  return Boolean(
    state.evidenceNeed === "web_current" ||
      state.explicitWebRequest ||
      state.internalEvidenceMissing ||
      state.requiredVerificationMissing,
  );
}
