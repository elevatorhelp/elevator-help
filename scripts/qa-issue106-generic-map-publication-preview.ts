/** Offline/backward-compatible test import; implementation lives in app/lib.
 * Still DEFAULT OFF and never invoked by any production API unless explicitly
 * audited and enabled by the separate Map revision feature flag.
 */
export {
 stageGenericMapCandidatePreview,
 activateGenericMapRevisionPreview,
 blockGenericMapRevisionPreview,
 filterGenericPublishedMapPreview,
 filterGenericPublishedRawPreview,
 readGenericPublishedEvidencePreview,
} from "../app/lib/ingestion-map-revision-visibility.ts";
export type {
 MapRevisionScope,MapEntry,MapRevisionPayload,GenericExactEvidence,
} from "../app/lib/ingestion-map-revision-visibility.ts";
