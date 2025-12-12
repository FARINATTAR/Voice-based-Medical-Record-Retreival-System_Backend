import mongoose from 'mongoose';

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
  
  // 🔥 FILE STORAGE - Multiple Files Support
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
  
  nextVisit: Date
  
}, { timestamps: true });

// Text index for search
medicalRecordSchema.index({ 
  diagnosis: 'text',
  symptoms: 'text',
  notes: 'text',
  searchKeywords: 'text'
});

export default mongoose.model('MedicalRecord', medicalRecordSchema);