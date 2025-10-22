import express from 'express';
import MedicalRecord from '../models/MedicalRecord.js';
import HospitalPatientLink from '../models/HospitalPatientLink.js';
import { authenticate, authorize } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Get All Records (Hospital-specific)
router.get('/', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;

    const records = await MedicalRecord.find({ hospitalId })
      .populate('patientId', 'name email age gender')
      .populate('doctorId', 'name specialization')
      .populate('hospitalId', 'name')
      .sort({ createdAt: -1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Create Medical Record
router.post('/', authenticate, authorize('doctor', 'hospital'), async (req, res) => {
  try {
    const { patientId, doctorId, diagnosis, symptoms, prescription, notes, voiceTranscript, prescriptions, vitals, nextVisit } = req.body;
    const hospitalId = req.user.hospitalId;

    // Determine doctor ID
    const finalDoctorId = req.user.role === 'doctor' ? req.user.id : doctorId;

    if (!patientId || !hospitalId || !finalDoctorId || !diagnosis) {
      return res.status(400).json({ message: 'Missing required fields: patientId, hospitalId, doctorId, diagnosis' });
    }

    const record = new MedicalRecord({
      patientId,
      doctorId: finalDoctorId,
      hospitalId,
      diagnosis,
      symptoms,
      prescription,
      notes,
      voiceTranscript,
      prescriptions: Array.isArray(prescriptions) ? prescriptions : [],
      vitals,
      nextVisit
    });

    await record.save();

    // Update hospital-patient link
    await HospitalPatientLink.findOneAndUpdate(
      { patientId, hospitalId },
      { 
        lastVisitDate: new Date(),
        $inc: { totalVisits: 1 }
      },
      { upsert: true }
    );

    res.status(201).json({
      message: 'Medical record created successfully',
      record
    });
  } catch (err) {
    console.error('Create record error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ✅ Upload Record with File (Admin/Hospital)
router.post('/upload', authenticate, authorize('hospital', 'doctor'), upload.single('file'), async (req, res) => {
  try {
    const { patientId, doctorId, diagnosis, notes, prescriptions } = req.body;
    const hospitalId = req.user.hospitalId;

    if (!patientId || !doctorId || !hospitalId || !diagnosis) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const record = new MedicalRecord({
      patientId,
      doctorId,
      hospitalId,
      diagnosis,
      notes,
      prescriptions: prescriptions ? prescriptions.split(',').map(p => p.trim()) : []
    });

    if (req.file) {
      record.fileName = req.file.originalname;
      record.fileData = req.file.buffer;
    }

    await record.save();

    // Update hospital-patient link
    await HospitalPatientLink.findOneAndUpdate(
      { patientId, hospitalId },
      { 
        lastVisitDate: new Date(),
        $inc: { totalVisits: 1 }
      },
      { upsert: true }
    );

    res.status(201).json({ 
      message: 'Record uploaded successfully', 
      record 
    });
  } catch (err) {
    console.error('Upload record error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get Doctor's Records (Current Hospital Only)
router.get('/doctor/:doctorId', authenticate, authorize('doctor', 'hospital'), async (req, res) => {
  try {
    const { doctorId } = req.params;
    const hospitalId = req.user.hospitalId;

    // Authorization check
    if (req.user.role === 'doctor' && req.user.id !== doctorId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const records = await MedicalRecord.find({ 
      doctorId, 
      hospitalId 
    })
      .populate('patientId', 'name age gender')
      .sort({ createdAt: -1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get Patient's Records (All Hospitals or Specific)
router.get('/patient/:patientId', authenticate, authorize('doctor', 'patient', 'hospital'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { allHospitals } = req.query; // Optional: get records from all hospitals

    // Authorization check for patient role
    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    let query = { patientId };

    // If not patient role and not requesting all hospitals, filter by current hospital
    if (req.user.role !== 'patient' && !allHospitals) {
      query.hospitalId = req.user.hospitalId;
    }

    const records = await MedicalRecord.find(query)
      .populate('doctorId', 'name specialization')
      .populate('hospitalId', 'name address')
      .sort({ createdAt: -1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Update Record (Doctor Only - Own Records)
router.put('/:id', authenticate, authorize('doctor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { diagnosis, symptoms, prescription, notes, prescriptions, vitals, nextVisit } = req.body;

    const record = await MedicalRecord.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Check if doctor owns this record
    if (record.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own records' });
    }

    // Update fields
    if (diagnosis) record.diagnosis = diagnosis;
    if (symptoms) record.symptoms = symptoms;
    if (prescription) record.prescription = prescription;
    if (notes) record.notes = notes;
    if (prescriptions) record.prescriptions = prescriptions;
    if (vitals) record.vitals = vitals;
    if (nextVisit) record.nextVisit = nextVisit;

    await record.save();

    res.json({
      message: 'Record updated successfully',
      record
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Delete Record (Hospital Admin Only)
router.delete('/:id', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { id } = req.params;

    const record = await MedicalRecord.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Check if record belongs to this hospital
    if (record.hospitalId.toString() !== req.user.hospitalId) {
      return res.status(403).json({ message: 'Cannot delete records from other hospitals' });
    }

    await MedicalRecord.findByIdAndDelete(id);

    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;