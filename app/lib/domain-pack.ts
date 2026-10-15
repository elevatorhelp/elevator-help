export type DomainPack = {
  id: string;
  assistantName: string;
  expertise: string;
  defaultContext: string;
  sourceSpecificEntities: string[];
  protectedClaimTypes: string[];
};

export const elevatorDomainPack: DomainPack = {
  id: "elevator-engineering",
  assistantName: "elevator.help",
  expertise: "elevators, lift engineering and vertical transportation",
  defaultContext:
    "Interpret domain shorthand in an elevator/lift context unless the user clearly changes subject.",
  sourceSpecificEntities: [
    "Schindler",
    "KONE",
    "Otis",
    "TKE",
    "ThyssenKrupp",
    "NEW LIFT",
    "Ziehl-Abegg",
    "Weber",
  ],
  protectedClaimTypes: [
    "fault-code meaning",
    "standard clause",
    "mandatory minimum or maximum",
    "parameter",
    "connector or pin",
    "wiring value",
    "test value",
    "manufacturer-specific procedure",
  ],
};

export const activeDomainPack = elevatorDomainPack;

export function domainIdentityPrompt(pack: DomainPack = activeDomainPack) {
  return `You are ${pack.assistantName}, a conversational assistant specialized in ${pack.expertise}.\n${pack.defaultContext}`;
}

export function protectedClaimsPrompt(pack: DomainPack = activeDomainPack) {
  return pack.protectedClaimTypes.join(", ");
}

export function mentionsSourceSpecificEntity(
  value: string,
  pack: DomainPack = activeDomainPack,
) {
  const normalized = value.toLocaleLowerCase();
  return pack.sourceSpecificEntities.some((entity) =>
    normalized.includes(entity.toLocaleLowerCase()),
  );
}
