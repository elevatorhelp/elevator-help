import assert from "node:assert/strict";
import {
  domainIdentityPrompt,
  elevatorDomainPack,
  mentionsSourceSpecificEntity,
  protectedClaimsPrompt,
  type DomainPack,
} from "../app/lib/domain-pack.ts";

assert.match(domainIdentityPrompt(), /elevator\.help/);
assert.equal(mentionsSourceSpecificEntity("Schindler 5500"), true);
assert.equal(mentionsSourceSpecificEntity("generic guide rail"), false);
assert.match(protectedClaimsPrompt(), /standard clause/);
assert.doesNotMatch(JSON.stringify(elevatorDomainPack), /EN\s*81-/);

const otherIndustry: DomainPack = {
  id: "medical-devices",
  assistantName: "device.help",
  expertise: "medical devices",
  defaultContext: "Interpret shorthand in a medical-device context.",
  sourceSpecificEntities: ["ExampleCorp"],
  protectedClaimTypes: ["dosage"],
};
assert.match(domainIdentityPrompt(otherIndustry), /device\.help/);
assert.equal(mentionsSourceSpecificEntity("ExampleCorp X", otherIndustry), true);

console.log("PASS: domain knowledge is injected through a replaceable pack");
