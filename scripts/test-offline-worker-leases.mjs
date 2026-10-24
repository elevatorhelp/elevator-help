import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineJobQueue } from "./offline-worker-leases.mjs";

test("phase prerequisites enforce evidence then raw then map per fingerprint", () => {
  const q = new OfflineJobQueue();
  for (const phase of ["map", "raw", "evidence"]) q.enqueue({ fileId: "doc", fingerprint: "v1", phase });
  const ev = q.claim({ workerId: "a", now: 100, leaseMs: 30 });
  assert.equal(ev.phase, "evidence");
  assert.equal(q.claim({ workerId: "b", now: 101, leaseMs: 30 }), null);
  assert.equal(q.complete(ev, {now: 101}), true);
  const raw = q.claim({ workerId: "b", now: 102, leaseMs: 30 });
  assert.equal(raw.phase, "raw");
  assert.equal(q.complete(raw, {now: 103}), true);
  const map = q.claim({ workerId: "c", now: 104, leaseMs: 30 });
  assert.equal(map.phase, "map");
  assert.equal(q.complete(map, {now: 105}), true);
  assert.equal(q.snapshot().counts.completed, 3);
});

test("the same document/phase/fingerprint is idempotent", () => {
  const q = new OfflineJobQueue();
  const doc = {fileId:"x", fingerprint:"abc", phase:"evidence"};
  assert.equal(q.enqueue(doc), true);
  assert.equal(q.enqueue(doc), false);
  assert.equal(q.snapshot().jobs.length, 1);
  assert.equal(q.enqueue({...doc, fingerprint:"def"}), true);
});

test("an expired worker cannot commit or heartbeat after another worker reclaims", () => {
  const q = new OfflineJobQueue();
  q.enqueue({fileId:"x",fingerprint:"v1",phase:"evidence"});
  const old = q.claim({workerId:"a",now:0,leaseMs:10});
  assert.equal(q.claim({workerId:"b",now:9,leaseMs:10}), null);
  const fresh = q.claim({workerId:"b",now:10,leaseMs:10});
  assert.equal(fresh.generation, old.generation+1);
  assert.equal(q.complete(old,{now:11}),false);
  assert.equal(q.heartbeat(old,{now:11,leaseMs:10}),false);
  assert.equal(q.complete(fresh,{now:11}),true);
});

test("heartbeat extends a live lease and prevents a concurrent claim", () => {
  const q = new OfflineJobQueue();
  q.enqueue({fileId:"x", fingerprint:"v1", phase:"evidence"});
  const l = q.claim({workerId:"a",now:0,leaseMs:10});
  assert.equal(q.heartbeat(l,{now:8,leaseMs:20}),true);
  assert.equal(q.claim({workerId:"b",now:15,leaseMs:10}),null);
  assert.equal(q.complete(l,{now:16}),true);
});

test("failures and expiry reach dead letter at bounded retries", () => {
  const q = new OfflineJobQueue({maxAttempts:2});
  q.enqueue({fileId:"x",fingerprint:"v1",phase:"evidence"});
  const a = q.claim({workerId:"a",now:0,leaseMs:10});
  assert.equal(q.fail(a,{now:1}),true);
  const b = q.claim({workerId:"b",now:2,leaseMs:10});
  assert.equal(q.fail(b,{now:3}),true);
  assert.equal(q.claim({workerId:"c",now:4,leaseMs:10}),null);
  assert.equal(q.snapshot().counts.dead,1);
});

test("input and lease safety guards", () => {
  const q = new OfflineJobQueue();
  assert.throws(()=>q.enqueue({fileId:"",fingerprint:"x",phase:"evidence"}));
  assert.throws(()=>q.enqueue({fileId:"x",fingerprint:"x",phase:"unknown"}));
  q.enqueue({fileId:"x",fingerprint:"v",phase:"evidence"});
  assert.throws(()=>q.claim({workerId:"a",now:0,leaseMs:0}));
  assert.throws(()=>q.claim({workerId:"a",now:Number.MAX_SAFE_INTEGER,leaseMs:10}));
});
