/** Deterministic, synthetic two-page fixture for isolated three-layer publication QA. */
export function buildQaFullAppMultipageFixture(doc, revision) {
  if (typeof doc !== 'string' || !doc || typeof revision !== 'string' || !revision)
    throw Error('QA_FULL_APP_FIXTURE_ID_REQUIRED');
  const common = {sourceFileId:doc, fileName:'qa.txt', sourcePath:'qa/synthetic', sourceFingerprint:revision};
  const chunks = [
    { ...common, id:doc+':r1', text:'EN 81-20 QA synthetic document first technical paragraph.', page:1, chunkIndex:0 },
    { ...common, id:doc+':r2', text:'EN 81-50 QA synthetic document second technical paragraph.', page:2, chunkIndex:1 },
  ];
  const evidence = chunks.map((chunk,i)=>({...chunk,id:doc+':e'+(i+1)}));
  const pages = [
    {page:1,text:'EN 81-20: Sample QA safety equipment description. This page describes technical inspection steps and a maintenance checklist.'},
    {page:2,text:'EN 81-50: Sample QA component verification procedures and section identifiers. This second page describes a different technical inspection procedure.'},
  ];
  return {chunks,evidence,pages,rawIds:chunks.map(c=>c.id),evidenceIds:evidence.map(c=>c.id)};
}
