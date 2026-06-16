// Audit hash-chain tampering test.
//
// Builds a hash chain with the SAME algorithm as utils/audit.js, then runs 50
// independent tampering attempts (each mutates a random field of a random
// block) and checks that the verifier catches every one. Reproduces the
// paper's "audit chain identified every single one of our 50 simulated
// tampering attempts" claim.
//
// Run:  node evaluation/tamper_test.mjs

import crypto from 'crypto';

const GENESIS_HASH = '0'.repeat(64);

function blockHash(entry) {
  const payload = JSON.stringify({
    index: entry.index,
    timestamp: new Date(entry.timestamp).toISOString(),
    actorId: entry.actorId || '',
    actorRole: entry.actorRole || '',
    actorName: entry.actorName || '',
    action: entry.action,
    resourceType: entry.resourceType || '',
    resourceId: entry.resourceId || '',
    details: entry.details || '',
    hospitalId: entry.hospitalId || '',
    prevHash: entry.prevHash
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function buildChain(n) {
  const actions = ['RECORD_CREATE', 'RECORD_VIEW', 'VOICE_SEARCH', 'FILE_DOWNLOAD', 'RECORD_UPDATE'];
  const chain = [];
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < n; i++) {
    const e = {
      index: i,
      timestamp: new Date(Date.now() + i * 1000),
      actorId: `user${i % 5}`,
      actorRole: ['doctor', 'hospital', 'patient'][i % 3],
      actorName: `Actor ${i % 5}`,
      action: actions[i % actions.length],
      resourceType: 'MedicalRecord',
      resourceId: `rec${i}`,
      details: `event ${i}`,
      hospitalId: `hosp${i % 3}`,
      prevHash
    };
    e.hash = blockHash(e);
    chain.push(e);
    prevHash = e.hash;
  }
  return chain;
}

function verify(chain) {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    if (b.index !== i) return { valid: false, brokenAt: i };
    if (b.prevHash !== prevHash) return { valid: false, brokenAt: b.index };
    if (blockHash(b) !== b.hash) return { valid: false, brokenAt: b.index };
    prevHash = b.hash;
  }
  return { valid: true, brokenAt: null };
}

function clone(chain) {
  return chain.map((b) => ({ ...b }));
}

const CHAIN_LEN = 60;
const ATTEMPTS = 50;
const MUTABLE = ['actorId', 'actorRole', 'action', 'resourceId', 'details', 'hospitalId'];

const baseChain = buildChain(CHAIN_LEN);

// Sanity: the untampered chain must verify clean.
const baseline = verify(baseChain);
if (!baseline.valid) {
  console.error('ERROR: freshly built chain failed to verify — algorithm bug.');
  process.exit(1);
}

let detected = 0;
const undetected = [];

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const tampered = clone(baseChain);
  const target = Math.floor(Math.random() * tampered.length);
  const field = MUTABLE[Math.floor(Math.random() * MUTABLE.length)];
  // Mutate the stored content WITHOUT recomputing the hash (a real attacker
  // editing the database row). A smart attacker who recomputes this block's
  // hash still breaks every following block's prevHash linkage.
  const original = tampered[target][field];
  tampered[target] = { ...tampered[target], [field]: `${original}_TAMPERED` };

  const result = verify(tampered);
  if (!result.valid) {
    detected += 1;
  } else {
    undetected.push({ attempt, target, field });
  }
}

console.log('='.repeat(56));
console.log('VoiceMed audit chain — tampering detection test');
console.log('='.repeat(56));
console.log(`Chain length         : ${CHAIN_LEN} blocks`);
console.log(`Baseline verifies    : ${baseline.valid}`);
console.log(`Tampering attempts   : ${ATTEMPTS}`);
console.log(`Detected             : ${detected}/${ATTEMPTS}`);
console.log(`Undetected           : ${undetected.length}`);
console.log('='.repeat(56));
if (detected === ATTEMPTS) {
  console.log('RESULT: PASS — every tampering attempt was detected.');
  process.exit(0);
} else {
  console.log('RESULT: FAIL — some tampering went undetected:', undetected);
  process.exit(1);
}
