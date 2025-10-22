import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import Hospital from '../models/Hospital.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';

dotenv.config();

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Decode token
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔓 Token decoded:', payload);

    let user;
    
    // Find user based on role
    if (payload.role === 'hospital') {
      user = await Hospital.findById(payload.id).select('-password');
    } else if (payload.role === 'doctor') {
      user = await Doctor.findById(payload.id).select('-password');
    } else if (payload.role === 'patient') {
      user = await Patient.findById(payload.id).select('-password');
    }

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    console.log('👤 User from DB:', {
      id: user._id,
      role: payload.role,
      name: user.name
    });

    // Build req.user object
    req.user = {
      id: user._id.toString(),
      role: payload.role,
      name: user.name
    };

    // For hospital role
    if (payload.role === 'hospital') {
      req.user.hospitalId = user._id.toString();
    }

    // For doctor role - get from payload (selected hospital)
    if (payload.role === 'doctor') {
      req.user.hospitalId = payload.hospitalId || null;
      req.user.hospitals = user.hospitals || [];
    }

    console.log('✅ Final req.user:', req.user);

    next();
  } catch (err) {
    console.error('❌ Auth error:', err.message);
    return res.status(401).json({ message: 'Invalid/expired token', error: err.message });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log('❌ No req.user found!');
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    console.log('🔐 Authorization check:', {
      userRole: req.user.role,
      allowedRoles: roles,
      match: roles.includes(req.user.role)
    });
    
    if (!roles.includes(req.user.role)) {
      console.log('❌ Authorization FAILED!');
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    
    console.log('✅ Authorization PASSED!');
    next();
  };
};