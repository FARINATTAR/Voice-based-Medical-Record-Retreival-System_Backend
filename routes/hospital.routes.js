import express from 'express';
import jwt from 'jsonwebtoken';
import Hospital from '../models/Hospital.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// ✅ Hospital Signup (Self-registration)
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, address, phone, licenseNumber } = req.body;
    
    if (!name || !email || !password || !address || !phone || !licenseNumber) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if hospital already exists
    const existingHospital = await Hospital.findOne({ email });
    if (existingHospital) {
      return res.status(400).json({ message: 'Hospital already exists with this email' });
    }

    // Create new hospital
    const hospital = new Hospital({
      name,
      email,
      password,
      address,
      phone,
      licenseNumber
    });

    await hospital.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: hospital._id.toString(), 
        role: 'hospital',
        hospitalId: hospital._id.toString()
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ 
      message: 'Hospital registered successfully',
      token, 
      hospital: { 
        id: hospital._id, 
        name: hospital.name, 
        email: hospital.email,
        role: 'hospital'
      } 
    });
  } catch (err) {
    console.error('Hospital signup error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Hospital Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find hospital with password field
    const hospital = await Hospital.findOne({ email }).select('+password');
    if (!hospital) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await hospital.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: hospital._id.toString(), 
        role: 'hospital',
        hospitalId: hospital._id.toString()
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ 
      message: 'Login successful',
      token, 
      user: { 
        id: hospital._id, 
        name: hospital.name, 
        email: hospital.email,
        role: 'hospital',
        hospitalId: hospital._id
      } 
    });
  } catch (err) {
    console.error('Hospital login error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Get Hospital Profile
router.get('/profile', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    res.json(hospital);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;