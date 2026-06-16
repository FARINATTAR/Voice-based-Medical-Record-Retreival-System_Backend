import mongoose from 'mongoose';
import { decrypt } from '../utils/encryption.js';

const medicalRecordSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  
  visitDate: {
    type: Date,
    default: Date.now
  },
  visitType: {
    type: String,
    enum: ['OPD', 'Emergency', 'Follow-up', 'Consultation'],
    default: 'OPD'
  },
  
  symptoms: {
    type: String
  },
  diagnosis: {
    type: String,
    required: true
  },
  prescription: {
    type: String
  },
  notes: {
    type: String
  },
  voiceTranscript: {
    type: String
  },
  
  // �� FILE STORAGE - Multiple Files Support
  files: [
    {
      fileName: String,
      originalName: String,
      fileType: {
        type: String,
        enum: ['X-Ray', 'ECG', 'Blood Test', 'MRI', 'CT Scan', 'Ultrasound', 
               'Prescription', 'Discharge Summary', 'Lab Report', 'Other'],
        default: 'Other'
      },
      mimeType: String,
      fileSize: Number,
      fileData: Buffer,
      uploadedBy: {
        type: String,
        enum: ['admin', 'doctor', 'hospital'], // ✅ FIXED: Added 'hospital'
        default: 'admin'
      },
      uploadDate: {
        type: Date,
        default: Date.now
      },
      description: String
    }
  ],
  
  prescriptions: [{
    type: String
  }],
  
  vitals: {
    bloodPressure: String,
    temperature: Number,
    pulse: Number,
    weight: Number,
    height: Number
  },
  
  searchKeywords: [String],

  // �� Auto-extracted medical entities (from the NER pipeline). Kept as
  // plaintext so encrypted free-text fields remain searchable through these.
  medicalEntities: {
    diseases: [String],
    drugs: [String],
    doses: [String],
    vitals: [String],
    nerBackend: String
  },

  // Lowercased searchable tokens (entities + keywords). Drives voice retrieval
  // even when diagnosis/symptoms/etc are AES-256 encrypted at rest.
  searchIndex: [String],

  nextVisit: Date

}, { timestamps: true });

// Text index for search (over the plaintext search tokens)
medicalRecordSchema.index({
  searchKeywords: 'text',
  searchIndex: 'text'
});

// �� Decrypt sensitive fields when a record is serialised to JSON. If
// field-level encryption is disabled (no key), values pass through unchanged.
const ENCRYPTED_FIELDS = ['symptoms', 'diagnosis', 'prescription', 'notes', 'voiceTranscript'];
function decryptTransform(doc, ret) {
  for (const f of ENCRYPTED_FIELDS) {
    if (typeof ret[f] === 'string') ret[f] = decrypt(ret[f]);
  }
  if (Array.isArray(ret.prescriptions)) {
    ret.prescriptions = ret.prescriptions.map((p) => decrypt(p));
  }
  return ret;
}
medicalRecordSchema.set('toJSON', { transform: decryptTransform });
medicalRecordSchema.set('toObject', { transform: decryptTransform });

export default mongoose.model('MedicalRecord', medicalRecordSchema);