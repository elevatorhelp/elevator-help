import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalManufacturer,
  asksResponseProvenance,
  extractFaultCode,
  historyEvidenceLabel,
  isBareFaultCodeQuestion,
  manufacturerClarificationQuestion,
  resolveManufacturerClarification,
} from "../app/lib/fault-context.ts";

test("extracts long alphanumeric fault codes without truncating them", () => {
  assert.equal(extractFaultCode("code 22455A"), "22455A");
  assert.equal(extractFaultCode("Fehlercode: S030"), "S030");
  assert.equal(extractFaultCode("کد خطا 22455A"), "22455A");
  assert.equal(extractFaultCode("22455A bedeutet Testantwort", true), "22455A");
  assert.equal(extractFaultCode("22455A bedeutet Testantwort"), null);
});

test("recognizes a code-only question that needs manufacturer context", () => {
  assert.equal(isBareFaultCodeQuestion("Was bedeutet code 22455A?"), true);
  assert.equal(isBareFaultCodeQuestion("code 22455A NEW LIFT"), false);
});

test("uses the requested German manufacturer clarification", () => {
  assert.equal(
    manufacturerClarificationQuestion("Was bedeutet code 22455A?"),
    "Um Ihnen weiterhelfen zu können: Können Sie angeben, von welchem Hersteller oder Steuerungstyp (z. B. Newlift, Weber, Sigma ....) die Meldung stammt?"
  );
});

test("resolves a manufacturer reply into the previous fault question", () => {
  const history = [
    { role: "user", content: "Was bedeutet code 22455A?" },
    {
      role: "assistant",
      content: "Bitte nenne den Hersteller oder Steuerungstyp.",
      mode: "clarification",
    },
  ];

  assert.equal(
    resolveManufacturerClarification("New Lift", history),
    "Was bedeutet code 22455A? Hersteller: NEW LIFT."
  );
  assert.equal(
    resolveManufacturerClarification("نیو ایفت", history),
    "Was bedeutet code 22455A? Hersteller: NEW LIFT."
  );
});

test("maps response modes to truthful provenance labels", () => {
  assert.equal(historyEvidenceLabel("internal_evidence"), "verified from internal source excerpts");
  assert.equal(historyEvidenceLabel("gemini_web"), "answered with public-web grounding");
  assert.equal(
    historyEvidenceLabel("gemini_direct_unverified"),
    "answered by Gemini without verified internal or web evidence"
  );
  assert.equal(historyEvidenceLabel(undefined), null);
});

test("recognizes follow-up questions about where the previous answer came from", () => {
  assert.equal(asksResponseProvenance("از وب جواب دادی یا مدارک داخلیت؟"), true);
  assert.equal(asksResponseProvenance("منبعت کجاست؟"), true);
  assert.equal(asksResponseProvenance("Was ist die Quelle deiner Antwort?"), true);
  assert.equal(asksResponseProvenance("Was bedeutet Fehler 14?"), false);
});

test("canonicalizes the supported NEW LIFT spellings", () => {
  assert.equal(canonicalManufacturer("NewLift"), "NEW LIFT");
  assert.equal(canonicalManufacturer("نیو لیفت"), "NEW LIFT");
});
