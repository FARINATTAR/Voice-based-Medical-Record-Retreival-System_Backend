import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Hospital from './models/Hospital.js';
import Doctor from './models/Doctor.js';
import Patient from './models/Patient.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medicalVoiceSystem';

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // Clear existing collections to start fresh
    await Hospital.deleteMany({});
    await Doctor.deleteMany({});
    await Patient.deleteMany({});
    console.log('Cleared existing hospitals, doctors, and patients.');

    // 1. Create Hospital
    const salt = await bcrypt.genSalt(10);
    const hospitalPassword = await bcrypt.hash('#Namo123', salt);
    
    const hospital = new Hospital({
      name: 'Namo Hospital',
      email: 'namo@gmail.com',
      password: hospitalPassword,
      address: '123 Health Street, Pune',
      phone: '9876543210',
      licenseNumber: 'HOSP-12345'
    });
    await hospital.save();
    console.log('Hospital seeded: Namo Hospital (namo@gmail.com / #Namo123)');

    // 2. Create Doctor
    const doctorPassword = await bcrypt.hash('#Ron123', salt);
    const doctor = new Doctor({
      name: 'Ron',
      email: 'ron@gmail.com',
      password: doctorPassword,
      phone: '8765432109',
      specialization: 'General Medicine',
      licenseNumber: 'DOC-54321',
      hospitals: [{
        hospitalId: hospital._id,
        role: 'Permanent',
        department: 'General',
        joinDate: new Date(),
        isActive: true
      }],
      primaryHospital: hospital._id
    });
    await doctor.save();
    console.log('Doctor seeded: Dr. Ron (ron@gmail.com / #Ron123)');

    // 3. Create Patients
    const patientPassword = await bcrypt.hash('#Harry123', salt);
    const harry = new Patient({
      name: 'Harry',
      email: 'harry@gmail.com',
      password: patientPassword,
      phone: '7654321098',
      age: 20,
      gender: 'Male',
      bloodGroup: 'O+',
      address: 'Main Street, Pune',
      emergencyContact: {
        name: 'John Doe',
        phone: '1234567890',
        relation: 'Father'
      },
      allergies: ['Dust', 'Penicillin'],
      chronicConditions: ['Diabetes']
    });
    await harry.save();
    console.log('Patient seeded: Harry (harry@gmail.com / #Harry123)');

    const priya = new Patient({
      name: 'Priya Sharma',
      email: 'patient@gmail.com',
      password: patientPassword,
      phone: '9812345670',
      age: 25,
      gender: 'Female',
      bloodGroup: 'A+',
      address: 'Koregaon Park, Pune',
      emergencyContact: {
        name: 'Sanjay Sharma',
        phone: '9812345678',
        relation: 'Spouse'
      },
      allergies: ['Peanuts'],
      chronicConditions: ['Hypertension']
    });
    await priya.save();
    console.log('Patient seeded: Priya Sharma (patient@gmail.com / #Harry123)');

    console.log('\nDatabase seeding completed successfully! 🎉');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
