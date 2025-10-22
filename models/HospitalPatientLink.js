import mongoose from 'mongoose';

const hospitalPatientLinkSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  
  firstVisitDate: {
    type: Date,
    default: Date.now
  },
  lastVisitDate: {
    type: Date,
    default: Date.now
  },
  totalVisits: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  }
  
}, { timestamps: true });

// Compound index for unique patient-hospital pair
hospitalPatientLinkSchema.index({ patientId: 1, hospitalId: 1 }, { unique: true });

export default mongoose.model('HospitalPatientLink', hospitalPatientLinkSchema);