import mongoose from 'mongoose';

const transcriptionSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true  // Only doctor is required
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: false  // ✅ MAKE THIS OPTIONAL
  },
  transcriptText: {
    type: String,
    required: true
  },
  searchType: {
    type: String,
    enum: ['global_search', 'patient_specific'],
    default: 'global_search'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Transcription', transcriptionSchema);