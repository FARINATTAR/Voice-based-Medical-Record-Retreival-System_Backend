import express from 'express';
import jwt from 'jsonwebtoken';
import Patient from '../models/Patient.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// ✅ Patient Login (NO Signup!)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find patient with password
    const patient = await Patient.findOne({ email }).select('+password');
    if (!patient) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await patient.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: patient._id.toString(), 
        role: 'patient'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ 
      message: 'Login successful',
      token, 
      user: { 
        id: patient._id, 
        name: patient.name, 
        email: patient.email,
        role: 'patient',
        age: patient.age,
        gender: patient.gender
      } 
    });
  } catch (err) {
    console.error('Patient login error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Get All Patients (Hospital Admin/Doctor can see)
router.get('/', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
  try {
    const patients = await Patient.find().select('-password');
    res.json(patients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Search Patient by Email/Phone (for linking)
router.get('/search', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { query } = req.query; // email or phone

    if (!query) {
      return res.status(400).json({ message: 'Search query (email/phone) is required' });
    }

    const patient = await Patient.findOne({
      $or: [
        { email: query },
        { phone: query }
      ]
    }).select('-password');

    if (patient) {
      res.json({ found: true, patient });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get Patient Profile
router.get('/profile', authenticate, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findById(req.user.id);
    res.json(patient);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get Patient by ID (for doctors/hospital)
router.get('/:id', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).select('-password');
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.json(patient);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;