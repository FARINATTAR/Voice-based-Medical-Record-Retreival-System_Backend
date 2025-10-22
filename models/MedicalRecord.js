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
  
  // Medical Details
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
  
  // Test Reports (files)
  fileName: {
    type: String
  },
  fileData: {
    type: Buffer
  },
  
  prescriptions: [{
    type: String
  }],
  
  // Vital Signs
  vitals: {
    bloodPressure: String,
    temperature: Number,
    pulse: Number,
    weight: Number,
    height: Number
  },
  
  // Follow-up
  nextVisit: {
    type: Date
  }
  
}, { timestamps: true });

export default mongoose.model('MedicalRecord', medicalRecordSchema);