// Tamper-evident audit hash chain.
//
// recordAudit() appends a block whose hash covers the previous block's hash,
// so the whole history is linked. verifyChain() recomputes every hash to
// detect tampering. Appends are serialised through a small in-process queue
// so concurrent requests can't fork the chain.

import crypto from 'crypto';
import AuditLog from '../models/AuditLog.js';

const GENESIS_HASH = '0'.repeat(64);

// Canonical payload that the hash commits to. Order matters and must match
// in verifyChain().
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

let chainQueue = Promise.resolve();

export async function recordAudit(event) {
  // Serialise appends to keep prevHash linkage consistent.
  chainQueue = chainQueue.then(() => appendBlock(event)).catch((e) => {
    console.error('[audit] append failed:', e.message);
  });
  return chainQueue;
}

async function appendBlock(event) {
  const last = await AuditLog.findOne().sort({ index: -1 });
  const index = last ? last.index + 1 : 0;
  const prevHash = last ? last.hash : GENESIS_HASH;

  const entry = {
    index,
    timestamp: new Date(),
    actorId: event.actorId,
    actorRole: event.actorRole,
    actorName: event.actorName,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    details: event.details,
    hospitalId: event.hospitalId,
    prevHash
  };
  entry.hash = blockHash(entry);

  await AuditLog.create(entry);
  return entry;
}

// Convenience wrapper that derives actor fields from req.user and never throws
// (auditing should not break the request it is logging).
export function audit(req, action, { resourceType, resourceId, details } = {}) {
  try {
    const u = req.user || {};
    recordAudit({
      actorId: u.id,
      actorRole: u.role,
      actorName: u.name,
      hospitalId: u.hospitalId,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : undefined,
      details
    });
  } catch (e) {
    console.error('[audit] error:', e.message);
  }
}

// Recompute the whole chain and report the first break, if any.
export async function verifyChain() {
  const blocks = await AuditLog.find().sort({ index: 1 }).lean();
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.index !== i) {
      return { valid: false, totalBlocks: blocks.length, brokenAt: i,
        reason: `Sequence gap: expected index ${i}, found ${b.index}` };
    }
    if (b.prevHash !== prevHash) {
      return { valid: false, totalBlocks: blocks.length, brokenAt: b.index,
        reason: `Broken link at block ${b.index}: prevHash mismatch (tampering detected)` };
    }
    const recomputed = blockHash(b);
    if (recomputed !== b.hash) {
      return { valid: false, totalBlocks: blocks.length, brokenAt: b.index,
        reason: `Hash mismatch at block ${b.index}: contents were altered (tampering detected)` };
    }
    prevHash = b.hash;
  }
  return { valid: true, totalBlocks: blocks.length, brokenAt: null,
    reason: 'Audit chain intact — no tampering detected.' };
}

export { blockHash, GENESIS_HASH };
