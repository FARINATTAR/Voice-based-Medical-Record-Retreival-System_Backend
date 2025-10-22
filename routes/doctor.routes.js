import express from 'express';
import jwt from 'jsonwebtoken';
import Doctor from '../models/Doctor.js';
import Hospital from '../models/Hospital.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// ✅ Doctor Login (NO Signup!)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find doctor with password
    const doctor = await Doctor.findOne({ email }).select('+password').populate('hospitals.hospitalId', 'name');
    if (!doctor) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await doctor.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // If doctor has multiple hospitals, return list for selection
    if (doctor.hospitals.length > 1) {
      return res.json({
        requiresHospitalSelection: true,
        doctorId: doctor._id,
        name: doctor.name,
        hospitals: doctor.hospitals.map(h => ({
          hospitalId: h.hospitalId._id,
          hospitalName: h.hospitalId.name,
          role: h.role,
          department: h.department
        }))
      });
    }

    // Single hospital - direct login
    const hospitalId = doctor.hospitals[0]?.hospitalId._id || null;

    const token = jwt.sign(
      { 
        id: doctor._id.toString(), 
        role: 'doctor',
        hospitalId: hospitalId?.toString()
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ 
      message: 'Login successful',
      token, 
      user: { 
        id: doctor._id, 
        name: doctor.name, 
        email: doctor.email,
        role: 'doctor',
        hospitalId: hospitalId,
        specialization: doctor.specialization
      } 
    });
  } catch (err) {
    console.error('Doctor login error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Select Hospital (for doctors with multiple hospitals)
router.post('/select-hospital', async (req, res) => {
  try {
    const { doctorId, hospitalId } = req.body;

    if (!doctorId || !hospitalId) {
      return res.status(400).json({ message: 'Doctor ID and Hospital ID required' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Check if doctor works at this hospital
    const hospitalLink = doctor.hospitals.find(
      h => h.hospitalId.toString() === hospitalId.toString()
    );

    if (!hospitalLink) {
      return res.status(403).json({ message: 'Doctor does not work at this hospital' });
    }

    // Generate token with selected hospital
    const token = jwt.sign(
      { 
        id: doctor._id.toString(), 
        role: 'doctor',
        hospitalId: hospitalId.toString()
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ 
      message: 'Hospital selected',
      token,
      user: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        role: 'doctor',
        hospitalId: hospitalId
      }
    });
  } catch (err) {
    console.error('Select hospital error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Get All Doctors (Hospital Admin can see)
router.get('/', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    
    // Find doctors who work at this hospital
    const doctors = await Doctor.find({
      'hospitals.hospitalId': hospitalId
    }).select('-password');

    res.json(doctors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Search Doctor by Email (for linking existing doctor)
router.get('/search', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const doctor = await Doctor.findOne({ email }).select('-password').populate('hospitals.hospitalId', 'name');

    if (doctor) {
      res.json({ found: true, doctor });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get Doctor Profile
router.get('/profile', authenticate, authorize('doctor'), async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id).populate('hospitals.hospitalId', 'name');
    res.json(doctor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;