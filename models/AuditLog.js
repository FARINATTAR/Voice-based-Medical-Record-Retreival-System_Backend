import mongoose from 'mongoose';

// Append-only, tamper-evident audit log. Each entry stores the hash of the
// previous entry, forming a blockchain-like hash chain. Any modification to a
// past entry breaks every subsequent hash, which the /api/audit/verify
// endpoint detects.
const auditLogSchema = new mongoose.Schema({
  index: { type: Number, required: true, unique: true },      // sequence in chain
  timestamp: { type: Date, default: Date.now },

  actorId: { type: String },                                  // who performed it
  actorRole: { type: String },
  actorName: { type: String },

  action: { type: String, required: true },                   // e.g. RECORD_VIEW
  resourceType: { type: String },                             // e.g. MedicalRecord
  resourceId: { type: String },
  details: { type: String },                                  // human-readable
  hospitalId: { type: String },

  prevHash: { type: String, required: true },                 // hash of previous block
  hash: { type: String, required: true }                      // hash of this block
}, { timestamps: false });

export default mongoose.model('AuditLog', auditLogSchema);
