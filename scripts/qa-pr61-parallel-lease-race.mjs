// Real QA API concurrency probe. Two independent clients claim one fresh
// document at the same instant. This checks D1 fencing, not 2 deployed Workers
// or parallel Google Drive processing. Never invokes Gemini or writes vectors.
import assert from 'node:assert/strict';

export async function verifyParallelLeaseClaims(post, runId, {rounds=3}={}) {
  assert.equal(typeof post,'function');
  assert.match(runId,/^[0-9]+-[1-9][0-9]{0,5}$/);
  assert.ok(Number.isInteger(rounds)&&rounds>=1&&rounds<=5);
  for(let i=0;i<rounds;i++){
    const documentId='qa61-race-'+runId+'-'+i;
    const ownerA='qa-race-a-'+runId+'-'+i;
    const ownerB='qa-race-b-'+runId+'-'+i;
    const [a,b]=await Promise.all([
      post({action:'lease_claim',documentId,owner:ownerA,durationMs:180000}),
      post({action:'lease_claim',documentId,owner:ownerB,durationMs:180000}),
    ]);
    const winners=[a,b].filter(x=>x.status===200);
    const losers=[a,b].filter(x=>x.status===409);
    assert.equal(winners.length,1,'QA_PARALLEL_DOUBLE_LEASE_OR_NO_OWNER');
    assert.equal(losers.length,1,'QA_PARALLEL_LOSER_NOT_FENCED');
    const lease=winners[0].lease;
    assert.equal(lease?.jobKey,documentId);
    assert.equal(lease?.generation,1,'fresh document must start at generation 1');
    assert.ok(lease?.owner===ownerA||lease?.owner===ownerB);
    const winnerRenew=await post({action:'lease_renew',lease,durationMs:180000});
    assert.equal(winnerRenew.status,200,'QA_PARALLEL_WINNER_RENEW_DENIED');
    const wrongOwner=lease.owner===ownerA?ownerB:ownerA;
    const loserRenew=await post({action:'lease_renew',lease:{...lease,owner:wrongOwner},durationMs:180000});
    assert.equal(loserRenew.status,409,'QA_PARALLEL_LOSER_RENEW_ALLOWED');
    const loserPublish=await post({
      action:'publish_staged',
      lease:{...lease,owner:wrongOwner},
      documentId,
      sourceFingerprint:'synthetic-'+runId+'-'+i,
      manifestIds:[documentId+':not-written'],
    });
    assert.equal(loserPublish.status,409,'QA_PARALLEL_LOSER_PUBLISH_ALLOWED');
  }
  return 'QA_PARALLEL_LEASE_CLAIM_FENCING_VERIFIED';
}
