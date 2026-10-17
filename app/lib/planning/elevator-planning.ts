/**
 * Internal planning kernel, not yet an ISO-compliant traffic calculation.
 * Never invent normative coefficients, waiting targets or catalogue evidence.
 */
export type Building = {
  use: "office" | "residential" | "hotel" | "mixed" | "other";
  servedFloors: number;
  population?: number;
  riseM?: number;
  existingBuilding?: boolean;
  shaft?: { widthMm:number; depthMm:number; pitMm:number; headroomMm:number };
};
export type LiftModel = {
  manufacturer:string; model:string; ratedLoadKg:number; speedMps:number;
  minShaftWidthMm:number; minShaftDepthMm:number; minPitMm:number; minHeadroomMm:number;
  evidence?: { document:string; page:number; edition?:string };
};
export type Check = { field:string; outcome:"pass"|"fail"|"unknown"; reason:string };
export function checkInputs(b:Building):Check[] {
  const checks:Check[]=[];
  if (!Number.isInteger(b.servedFloors) || b.servedFloors < 2) checks.push({field:"servedFloors",outcome:"fail",reason:"Need at least two served floors"});
  if (b.population===undefined) checks.push({field:"population",outcome:"unknown",reason:"Building population required"});
  else if(!Number.isInteger(b.population)||b.population<=0) checks.push({field:"population",outcome:"fail",reason:"Population must be positive"});
  if(b.riseM===undefined) checks.push({field:"riseM",outcome:"unknown",reason:"Travel rise required"});
  else if(!Number.isFinite(b.riseM)||b.riseM<=0) checks.push({field:"riseM",outcome:"fail",reason:"Travel rise must be positive"});
  if(b.shaft) for(const [field,value] of Object.entries(b.shaft)) {
    if(!Number.isFinite(value)||value<=0) checks.push({field,outcome:"fail",reason:"Shaft measurement must be positive"});
  }
  return checks;
}
/** Arithmetic-only capacity ratio; not a lift traffic forecast. */
export function handlingCapacity5MinPct(personsMoved:number,population:number):number {
  if(!Number.isFinite(personsMoved)||personsMoved<0||!Number.isFinite(population)||population<=0)
    throw new RangeError("Invalid traffic arithmetic inputs");
  return personsMoved*100/population;
}
/** Envelope matching against DOCUMENTED supplier minima, never a safety certificate. */
export function checkSupplierEnvelope(building:Building,lift:LiftModel):Check[] {
  const bad=checkInputs(building).filter(c=>c.outcome==="fail");
  if(bad.length) return bad;
  if(!building.shaft) return [{field:"shaft",outcome:"unknown",reason:"As-built shaft dimensions unavailable"}];
  if(!lift.evidence?.document?.trim()||!Number.isInteger(lift.evidence.page)||lift.evidence.page<1)
    return [{field:"catalogue",outcome:"unknown",reason:"Verified manufacturer document and page required"}];
  const pairs:[string,number,number][]=[
    ["widthMm",building.shaft.widthMm,lift.minShaftWidthMm],
    ["depthMm",building.shaft.depthMm,lift.minShaftDepthMm],
    ["pitMm",building.shaft.pitMm,lift.minPitMm],
    ["headroomMm",building.shaft.headroomMm,lift.minHeadroomMm],
  ];
  return pairs.map(([field,actual,minimum])=>!Number.isFinite(minimum)||minimum<=0
    ? {field,outcome:"unknown",reason:"Missing supplier minimum"}
    : {field,outcome:actual>=minimum?"pass":"fail",reason:`Actual ${actual} mm; documented minimum ${minimum} mm`});
}
export function initialPlanningAssessment(b:Building) {
  const missing=checkInputs(b);
  if(!b.shaft) missing.push({field:"shaft",outcome:"unknown" as const,reason:"Shaft width/depth, pit and headroom needed for matching"});
  return {
    status:missing.length?"needs_data":"needs_verified_traffic_method",
    checks:missing,
    proposedLiftCount:null,
    proposedCapacityKg:null,
    proposedSpeedMps:null,
    standardsToVerify:["ISO 8100-32:2020 Clauses 7 and 8","EN 81-20:2020","EN 81-50:2020","EN 81-70:2021+A1:2022",...(b.existingBuilding?["EN 81-21:2022"]:[])],
    message:"Do not claim normative traffic sizing until the actual standard's applicable parameters and verified worked examples are available.",
  };
}
