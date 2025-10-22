// // import mongoose from 'mongoose';

// // const medicalRecordSchema = new mongoose.Schema({
// //   patientId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Patient',
// //     required: true
// //   },
// //   doctorId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Doctor',
// //     required: true
// //   },
// //   hospitalId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Hospital',
// //     required: true
// //   },
  
// //   visitDate: {
// //     type: Date,
// //     default: Date.now
// //   },
// //   visitType: {
// //     type: String,
// //     enum: ['OPD', 'Emergency', 'Follow-up', 'Consultation'],
// //     default: 'OPD'
// //   },
  
// //   // Medical Details
// //   symptoms: {
// //     type: String
// //   },
// //   diagnosis: {
// //     type: String,
// //     required: true
// //   },
// //   prescription: {
// //     type: String
// //   },
// //   notes: {
// //     type: String
// //   },
// //   voiceTranscript: {
// //     type: String
// //   },
  
// //   // Test Reports (files)
// //   fileName: {
// //     type: String
// //   },
// //   fileData: {
// //     type: Buffer
// //   },
  
// //   prescriptions: [{
// //     type: String
// //   }],
  
// //   // Vital Signs
// //   vitals: {
// //     bloodPressure: String,
// //     temperature: Number,
// //     pulse: Number,
// //     weight: Number,
// //     height: Number
// //   },
  
// //   // Follow-up
// //   nextVisit: {
// //     type: Date
// //   }
  
// // }, { timestamps: true });

// // export default mongoose.model('MedicalRecord', medicalRecordSchema);

// import mongoose from 'mongoose';

// const medicalRecordSchema = new mongoose.Schema({
//   patientId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Patient',
//     required: true
//   },
//   doctorId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Doctor',
//     required: true
//   },
//   hospitalId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Hospital',
//     required: true
//   },
  
//   visitDate: {
//     type: Date,
//     default: Date.now
//   },
//   visitType: {
//     type: String,
//     enum: ['OPD', 'Emergency', 'Follow-up', 'Consultation'],
//     default: 'OPD'
//   },
  
//   // Medical Details
//   symptoms: {
//     type: String
//   },
//   diagnosis: {
//     type: String,
//     required: true
//   },
//   prescription: {
//     type: String
//   },
//   notes: {
//     type: String
//   },
//   voiceTranscript: {
//     type: String
//   },
  
//   // 🔥 FILE STORAGE - Multiple Files Support
//   files: [
//     {
//       fileName: String,          // "blood_report_123.pdf"
//       originalName: String,      // "Blood Test Report.pdf"
//       fileType: {
//         type: String,
//         enum: ['X-Ray', 'ECG', 'Blood Test', 'MRI', 'CT Scan', 'Ultrasound', 
//                'Prescription', 'Discharge Summary', 'Lab Report', 'Other'],
//         default: 'Other'
//       },
//       mimeType: String,          // "application/pdf"
//       fileSize: Number,          // bytes
//       fileData: Buffer,          // Store file as buffer
//       uploadedBy: {
//         type: String,
//         enum: ['admin', 'doctor'],
//         default: 'admin'
//       },
//       uploadDate: {
//         type: Date,
//         default: Date.now
//       },
//       description: String
//     }
//   ],
  
//   prescriptions: [{
//     type: String
//   }],
  
//   // Vital Signs
//   vitals: {
//     bloodPressure: String,
//     temperature: Number,
//     pulse: Number,
//     weight: Number,
//     height: Number
//   },
  
//   // Search keywords for voice retrieval
//   searchKeywords: [String],
  
//   nextVisit: Date
  
// }, { timestamps: true });

// // Text index for search
// medicalRecordSchema.index({ 
//   diagnosis: 'text',
//   symptoms: 'text',
//   notes: 'text',
//   searchKeywords: 'text'
// });

// export default mongoose.model('MedicalRecord', medicalRecordSchema);

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