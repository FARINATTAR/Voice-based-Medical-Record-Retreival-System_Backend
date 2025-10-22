import express from 'express';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import MedicalRecord from '../models/MedicalRecord.js';
import HospitalPatientLink from '../models/HospitalPatientLink.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// ✅ Admin Stats (Hospital-specific)
router.get('/stats', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;

    // Count doctors at this hospital
    const totalDoctors = await Doctor.countDocuments({
      'hospitals.hospitalId': hospitalId
    });

    // Count patients linked to this hospital
    const totalPatients = await HospitalPatientLink.countDocuments({
      hospitalId: hospitalId
    });

    // Count records at this hospital
    const totalRecords = await MedicalRecord.countDocuments({
      hospitalId: hospitalId
    });

    res.json({
      doctors: totalDoctors,
      patients: totalPatients,
      records: totalRecords,
      appointments: 0 // Placeholder
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Recent Activity (Hospital-specific)
router.get('/recent', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;

    const recentRecords = await MedicalRecord.find({
      hospitalId: hospitalId
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('patientId', 'name')
      .populate('doctorId', 'name');

    const activities = recentRecords.map((rec) => ({
      type: 'Record Uploaded',
      description: `Record for ${rec.patientId?.name || 'Unknown'} by Dr. ${rec.doctorId?.name || 'Unknown'}`,
      date: rec.createdAt,
    }));

    res.json(activities);
  } catch (err) {
    console.error('Error in /recent:', err);
    res.status(500).json({ message: err.message });
  }
});

// ✅ Add Doctor (Hospital Admin)
router.post('/add-doctor', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { name, email, password, phone, specialization, licenseNumber, qualification, experience, role, department } = req.body;
    const hospitalId = req.user.hospitalId;

    if (!name || !email || !password || !phone || !specialization || !licenseNumber) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Check if doctor already exists
    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      return res.status(400).json({ message: 'Doctor already exists with this email' });
    }

    // Create new doctor
    const doctor = new Doctor({
      name,
      email,
      password,
      phone,
      specialization,
      licenseNumber,
      qualification,
      experience,
      hospitals: [{
        hospitalId: hospitalId,
        role: role || 'Permanent',
        department: department,
        joinDate: new Date(),
        isActive: true
      }],
      primaryHospital: hospitalId
    });

    await doctor.save();

    res.status(201).json({
      message: 'Doctor added successfully',
      doctor: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        specialization: doctor.specialization
      }
    });
  } catch (err) {
    console.error('Add doctor error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Link Existing Doctor to Hospital
router.post('/link-doctor', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { doctorId, role, department } = req.body;
    const hospitalId = req.user.hospitalId;

    if (!doctorId) {
      return res.status(400).json({ message: 'Doctor ID is required' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Check if already linked
    const alreadyLinked = doctor.hospitals.some(
      h => h.hospitalId.toString() === hospitalId.toString()
    );

    if (alreadyLinked) {
      return res.status(400).json({ message: 'Doctor already works at this hospital' });
    }

    // Add hospital to doctor's hospitals array
    doctor.hospitals.push({
      hospitalId: hospitalId,
      role: role || 'Visiting',
      department: department,
      joinDate: new Date(),
      isActive: true
    });

    await doctor.save();

    res.json({
      message: 'Doctor linked to hospital successfully',
      doctor: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email
      }
    });
  } catch (err) {
    console.error('Link doctor error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Add Patient (Hospital Admin)
router.post('/add-patient', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { name, email, password, phone, age, gender, bloodGroup, address, emergencyContact } = req.body;
    const hospitalId = req.user.hospitalId;

    if (!name || !email || !password || !phone || !age || !gender) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Check if patient already exists
    const existingPatient = await Patient.findOne({ email });
    if (existingPatient) {
      return res.status(400).json({ message: 'Patient already exists with this email' });
    }

    // Create new patient
    const patient = new Patient({
      name,
      email,
      password,
      phone,
      age,
      gender,
      bloodGroup,
      address,
      emergencyContact
    });

await patient.save();

    // Create hospital-patient link
    const link = new HospitalPatientLink({
      patientId: patient._id,
      hospitalId: hospitalId,
      firstVisitDate: new Date(),
      lastVisitDate: new Date(),
      totalVisits: 0,
      status: 'Active'
    });

    await link.save();

    res.status(201).json({
      message: 'Patient added successfully',
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email,
        age: patient.age,
        gender: patient.gender
      }
    });
  } catch (err) {
    console.error('Add patient error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Link Existing Patient to Hospital
router.post('/link-patient', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { patientId } = req.body;
    const hospitalId = req.user.hospitalId;

    if (!patientId) {
      return res.status(400).json({ message: 'Patient ID is required' });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Check if already linked
    const existingLink = await HospitalPatientLink.findOne({
      patientId: patientId,
      hospitalId: hospitalId
    });

    if (existingLink) {
      return res.status(400).json({ message: 'Patient already linked to this hospital' });
    }

    // Create new link
    const link = new HospitalPatientLink({
      patientId: patientId,
      hospitalId: hospitalId,
      firstVisitDate: new Date(),
      lastVisitDate: new Date(),
      totalVisits: 0,
      status: 'Active'
    });

    await link.save();

    res.json({
      message: 'Patient linked to hospital successfully',
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email
      }
    });
  } catch (err) {
    console.error('Link patient error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;