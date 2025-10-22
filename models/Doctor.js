import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  phone: {
    type: String,
    required: true
  },
  specialization: {
    type: String,
    required: true
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true
  },
  qualification: {
    type: String
  },
  experience: {
    type: Number  // years
  },
  
  // ⭐ IMPORTANT: Multiple hospitals array
  hospitals: [
    {
      hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
      },
      role: {
        type: String,
        enum: ['Permanent', 'Visiting', 'Consultant'],
        default: 'Permanent'
      },
      department: {
        type: String
      },
      joinDate: {
        type: Date,
        default: Date.now
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }
  ],
  
  primaryHospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
  
}, { timestamps: true });

// Hash password
doctorSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
doctorSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('Doctor', doctorSchema);