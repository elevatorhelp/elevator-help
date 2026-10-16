import assert from "node:assert/strict";
import { retrieveInternalEvidence } from "../app/lib/internal-retrieval.ts";
import { extractReferenceIdentifiers } from "../app/lib/reference-identifiers.ts";
import type { RouterResult } from "../app/lib/router.ts";

const identifiers = extractReferenceIdentifiers(
  "NOVA 5500 controller DRIVE-X35/50 reports error code E14 at ratio 4:1",
  ["supplier-catalogs", "NOVA"],
);
const keys = new Set(identifiers.map((item) => item.key));
for (const expected of ["NOVA5500", "DRIVEX3550", "E14", "41", "NOVA"]) {
  assert.equal(keys.has(expected), true, `Missing generic reference ${expected}`);
}

const hierarchicalKeys = new Set(
  extractReferenceIdentifiers("", ["QRS_SPEC_900_7_2026.pdf"]).map(
    (item) => item.key,
  ),
);
for (const expected of ["QRSSPEC9007", "SPEC9007", "QRSSPEC90072026"]) {
  assert.equal(
    hierarchicalKeys.has(expected),
    true,
    `Missing hierarchical source alias ${expected}`,
  );
}

const bidirectionalKeys = new Set(
  extractReferenceIdentifiers(
    "Fault ZX-42; 73 error; Fehler 19; E88 Störung; model Q7",
  ).map((item) => item.key),
);
for (const expected of ["ZX42", "73", "19", "E88", "Q7"]) {
  assert.equal(
    bidirectionalKeys.has(expected),
    true,
    `Missing bidirectional contextual reference ${expected}`,
  );
}

const route: RouterResult = {
  intent: "troubleshooting",
  evidenceNeed: "internal",
  questionLanguage: "en",
  preferredSourceLanguage: "en",
  manufacturer: "NOVA",
  productFamily: "5500",
  controller: "DRIVE-X35/50",
  faultCode: "E14",
  faultFamily: null,
  faultName: null,
  topics: [],
  components: [],
  confidence: "high",
  needsClarification: false,
  clarificationQuestion: null,
  searchStrategy: "filtered",
  normalizedQuestion: null,
  interpretation: null,
};

const archiveDb = {
  prepare: () => ({
    bind: () => ({
      all: async () => ({
        results: [
          {
            id: "catalog-evidence",
            text: "E14 means that the DRIVE-X35/50 door position reference was not detected.",
            source_file_id: "source-1",
            file_name: "NOVA 5500 service catalog.pdf",
            source_path: "/supplier-catalogs/NOVA/DRIVE-X35-50/",
            page: 18,
            chunk_index: 2,
            content_type: "fault",
            source_fingerprint: "source-v1",
            identifier_labels: "NOVA 5500,DRIVE-X35/50,E14",
            matched_identifiers: 4,
          },
        ],
      }),
    }),
  }),
};

const evidence = await retrieveInternalEvidence(
  "What does error E14 mean on NOVA 5500 DRIVE-X35/50?",
  route,
  { run: async () => ({ data: [[1, 0]] }) },
  { query: async () => ({ matches: [] }) },
  undefined,
  archiveDb,
);
assert.equal(evidence[0]?.id, "catalog-evidence");
assert.match(evidence[0]?.text || "", /E14/);

console.log(
  "PASS: generic exact index resolves supplier, model, controller and error references",
);
