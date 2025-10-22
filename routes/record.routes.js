// import express from 'express';
// import MedicalRecord from '../models/MedicalRecord.js';
// import HospitalPatientLink from '../models/HospitalPatientLink.js';
// import { authenticate, authorize } from '../middleware/auth.js';
// import multer from 'multer';

// const router = express.Router();
// const storage = multer.memoryStorage();
// const upload = multer({ storage });

// // ✅ Get All Records (Hospital-specific)
// router.get('/', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
//   try {
//     const hospitalId = req.user.hospitalId;

//     const records = await MedicalRecord.find({ hospitalId })
//       .populate('patientId', 'name email age gender')
//       .populate('doctorId', 'name specialization')
//       .populate('hospitalId', 'name')
//       .sort({ createdAt: -1 });

//     res.json(records);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// // ✅ Create Medical Record
// router.post('/', authenticate, authorize('doctor', 'hospital'), async (req, res) => {
//   try {
//     const { patientId, doctorId, diagnosis, symptoms, prescription, notes, voiceTranscript, prescriptions, vitals, nextVisit } = req.body;
//     const hospitalId = req.user.hospitalId;

//     // Determine doctor ID
//     const finalDoctorId = req.user.role === 'doctor' ? req.user.id : doctorId;

//     if (!patientId || !hospitalId || !finalDoctorId || !diagnosis) {
//       return res.status(400).json({ message: 'Missing required fields: patientId, hospitalId, doctorId, diagnosis' });
//     }

//     const record = new MedicalRecord({
//       patientId,
//       doctorId: finalDoctorId,
//       hospitalId,
//       diagnosis,
//       symptoms,
//       prescription,
//       notes,
//       voiceTranscript,
//       prescriptions: Array.isArray(prescriptions) ? prescriptions : [],
//       vitals,
//       nextVisit
//     });

//     await record.save();

//     // Update hospital-patient link
//     await HospitalPatientLink.findOneAndUpdate(
//       { patientId, hospitalId },
//       { 
//         lastVisitDate: new Date(),
//         $inc: { totalVisits: 1 }
//       },
//       { upsert: true }
//     );

//     res.status(201).json({
//       message: 'Medical record created successfully',
//       record
//     });
//   } catch (err) {
//     console.error('Create record error:', err);
//     res.status(500).json({ message: err.message });
//   }
// });

// // ✅ Upload Record with File (Admin/Hospital)
// router.post('/upload', authenticate, authorize('hospital', 'doctor'), upload.single('file'), async (req, res) => {
//   try {
//     const { patientId, doctorId, diagnosis, notes, prescriptions } = req.body;
//     const hospitalId = req.user.hospitalId;

//     if (!patientId || !doctorId || !hospitalId || !diagnosis) {
//       return res.status(400).json({ message: 'Missing required fields' });
//     }

//     const record = new MedicalRecord({
//       patientId,
//       doctorId,
//       hospitalId,
//       diagnosis,
//       notes,
//       prescriptions: prescriptions ? prescriptions.split(',').map(p => p.trim()) : []
//     });

//     if (req.file) {
//       record.fileName = req.file.originalname;
//       record.fileData = req.file.buffer;
//     }

//     await record.save();

//     // Update hospital-patient link
//     await HospitalPatientLink.findOneAndUpdate(
//       { patientId, hospitalId },
//       { 
//         lastVisitDate: new Date(),
//         $inc: { totalVisits: 1 }
//       },
//       { upsert: true }
//     );

//     res.status(201).json({ 
//       message: 'Record uploaded successfully', 
//       record 
//     });
//   } catch (err) {
//     console.error('Upload record error:', err);
//     res.status(500).json({ message: err.message });
//   }
// });

// // ✅ Get Doctor's Records (Current Hospital Only)
// router.get('/doctor/:doctorId', authenticate, authorize('doctor', 'hospital'), async (req, res) => {
//   try {
//     const { doctorId } = req.params;
//     const hospitalId = req.user.hospitalId;

//     // Authorization check
//     if (req.user.role === 'doctor' && req.user.id !== doctorId) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }

//     const records = await MedicalRecord.find({ 
//       doctorId, 
//       hospitalId 
//     })
//       .populate('patientId', 'name age gender')
//       .sort({ createdAt: -1 });

//     res.json(records);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// // ✅ Get Patient's Records (All Hospitals or Specific)
// router.get('/patient/:patientId', authenticate, authorize('doctor', 'patient', 'hospital'), async (req, res) => {
//   try {
//     const { patientId } = req.params;
//     const { allHospitals } = req.query; // Optional: get records from all hospitals

//     // Authorization check for patient role
//     if (req.user.role === 'patient' && req.user.id !== patientId) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }

//     let query = { patientId };

//     // If not patient role and not requesting all hospitals, filter by current hospital
//     if (req.user.role !== 'patient' && !allHospitals) {
//       query.hospitalId = req.user.hospitalId;
//     }

//     const records = await MedicalRecord.find(query)
//       .populate('doctorId', 'name specialization')
//       .populate('hospitalId', 'name address')
//       .sort({ createdAt: -1 });

//     res.json(records);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// // ✅ Update Record (Doctor Only - Own Records)
// router.put('/:id', authenticate, authorize('doctor'), async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { diagnosis, symptoms, prescription, notes, prescriptions, vitals, nextVisit } = req.body;

//     const record = await MedicalRecord.findById(id);
//     if (!record) {
//       return res.status(404).json({ message: 'Record not found' });
//     }

//     // Check if doctor owns this record
//     if (record.doctorId.toString() !== req.user.id) {
//       return res.status(403).json({ message: 'You can only update your own records' });
//     }

//     // Update fields
//     if (diagnosis) record.diagnosis = diagnosis;
//     if (symptoms) record.symptoms = symptoms;
//     if (prescription) record.prescription = prescription;
//     if (notes) record.notes = notes;
//     if (prescriptions) record.prescriptions = prescriptions;
//     if (vitals) record.vitals = vitals;
//     if (nextVisit) record.nextVisit = nextVisit;

//     await record.save();

//     res.json({
//       message: 'Record updated successfully',
//       record
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// // ✅ Delete Record (Hospital Admin Only)
// router.delete('/:id', authenticate, authorize('hospital'), async (req, res) => {
//   try {
//     const { id } = req.params;

//     const record = await MedicalRecord.findById(id);
//     if (!record) {
//       return res.status(404).json({ message: 'Record not found' });
//     }

//     // Check if record belongs to this hospital
//     if (record.hospitalId.toString() !== req.user.hospitalId) {
//       return res.status(403).json({ message: 'Cannot delete records from other hospitals' });
//     }

//     await MedicalRecord.findByIdAndDelete(id);

//     res.json({ message: 'Record deleted successfully' });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// export default router;

import express from 'express';
import MedicalRecord from '../models/MedicalRecord.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import HospitalPatientLink from '../models/HospitalPatientLink.js';
import { authenticate, authorize } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ✅ Get All Records (Hospital-specific)
router.get('/', authenticate, authorize('hospital', 'doctor'), async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;

    const records = await MedicalRecord.find({ hospitalId })
      .populate('patientId', 'name email age gender phone')
      .populate('doctorId', 'name specialization')
      .populate('hospitalId', 'name')
      .sort({ createdAt: -1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Create Medical Record (Voice or Manual)
router.post('/', authenticate, authorize('doctor', 'hospital'), async (req, res) => {
  try {
    const { 
      patientId, 
      doctorId, 
      diagnosis, 
      symptoms, 
      prescription, 
      notes, 
      voiceTranscript, 
      prescriptions, 
      vitals, 
      nextVisit,
      visitType 
    } = req.body;
    
    const hospitalId = req.user.hospitalId;
    const finalDoctorId = req.user.role === 'doctor' ? req.user.id : doctorId;

    if (!patientId || !hospitalId || !finalDoctorId || !diagnosis) {
      return res.status(400).json({ 
        message: 'Missing required fields: patientId, hospitalId, doctorId, diagnosis' 
      });
    }

    // Create search keywords for voice search
    const keywords = [
      diagnosis,
      symptoms,
      prescription
    ].filter(Boolean).join(' ').toLowerCase().split(' ');

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
      nextVisit,
      visitType,
      searchKeywords: [...new Set(keywords)] // unique keywords
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

    // Populate before sending response
    await record.populate('patientId', 'name age gender');
    await record.populate('doctorId', 'name specialization');

    res.status(201).json({
      message: 'Medical record created successfully',
      record
    });
  } catch (err) {
    console.error('Create record error:', err);
    res.status(500).json({ message: err.message });
  }
});

// 🔥 NEW: Upload Record with Multiple Files
router.post('/upload-files', 
  authenticate, 
  authorize('hospital', 'doctor'), 
  upload.array('files', 10), // Max 10 files
  async (req, res) => {
    try {
      const { 
        patientId, 
        doctorId, 
        diagnosis, 
        notes, 
        prescriptions,
        fileTypes, // JSON string: ["X-Ray", "Blood Test"]
        fileDescriptions // JSON string: ["Chest X-ray", "CBC report"]
      } = req.body;
      
      const hospitalId = req.user.hospitalId;

      if (!patientId || !doctorId || !hospitalId || !diagnosis) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Parse file metadata
      const types = fileTypes ? JSON.parse(fileTypes) : [];
      const descriptions = fileDescriptions ? JSON.parse(fileDescriptions) : [];

      // Process uploaded files
      const filesData = req.files.map((file, index) => ({
        fileName: `${Date.now()}_${file.originalname}`,
        originalName: file.originalname,
        fileType: types[index] || 'Other',
        mimeType: file.mimetype,
        fileSize: file.size,
        fileData: file.buffer,
        uploadedBy: req.user.role,
        description: descriptions[index] || ''
      }));

      const record = new MedicalRecord({
        patientId,
        doctorId,
        hospitalId,
        diagnosis,
        notes,
        prescriptions: prescriptions ? prescriptions.split(',').map(p => p.trim()) : [],
        files: filesData
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
        message: 'Record with files uploaded successfully', 
        record: {
          _id: record._id,
          diagnosis: record.diagnosis,
          filesCount: filesData.length
        }
      });
    } catch (err) {
      console.error('Upload record error:', err);
      res.status(500).json({ message: err.message });
    }
  }
);

// 🔥 NEW: Voice-Based File Search
router.post('/voice-search', authenticate, authorize('doctor', 'patient'), async (req, res) => {
  try {
    const { query, patientId } = req.body; // query: "ecg report", patientId: optional

    if (!query) {
      return res.status(400).json({ message: 'Search query required' });
    }

    // Parse query for keywords
    const keywords = query.toLowerCase().split(' ');
    
    // Build search filter
    let filter = {};

    // If patient role, search only their records
    if (req.user.role === 'patient') {
      filter.patientId = req.user.id;
    } else if (patientId) {
      // Doctor searching for specific patient
      filter.patientId = patientId;
      filter.hospitalId = req.user.hospitalId;
    } else {
      // Doctor searching all patients in their hospital
      filter.hospitalId = req.user.hospitalId;
    }

    // Text search on diagnosis, symptoms, keywords
    const records = await MedicalRecord.find({
      ...filter,
      $or: [
        { diagnosis: { $regex: keywords.join('|'), $options: 'i' } },
        { symptoms: { $regex: keywords.join('|'), $options: 'i' } },
        { searchKeywords: { $in: keywords } },
        { 'files.fileType': { $regex: keywords.join('|'), $options: 'i' } },
        { 'files.description': { $regex: keywords.join('|'), $options: 'i' } }
      ]
    })
      .populate('patientId', 'name age gender phone')
      .populate('doctorId', 'name specialization')
      .populate('hospitalId', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      query,
      count: records.length,
      records
    });
  } catch (err) {
    console.error('Voice search error:', err);
    res.status(500).json({ message: err.message });
  }
});

// // 🔥 NEW: Download File
// router.get('/file/:recordId/:fileIndex', authenticate, async (req, res) => {
//   try {
//     const { recordId, fileIndex } = req.params;

//     const record = await MedicalRecord.findById(recordId);
//     if (!record) {
//       return res.status(404).json({ message: 'Record not found' });
//     }

//     const file = record.files[fileIndex];
//     if (!file) {
//       return res.status(404).json({ message: 'File not found' });
//     }

//     // Set headers for file download
//     res.set({
//       'Content-Type': file.mimeType,
//       'Content-Disposition': `attachment; filename="${file.originalName}"`,
//       'Content-Length': file.fileSize
//     });

//     res.send(file.fileData);
//   } catch (err) {
//     console.error('Download file error:', err);
//     res.status(500).json({ message: err.message });
//   }
// });
// 🔥 UPDATED: Download/View File
router.get('/file/:recordId/:fileIndex', authenticate, async (req, res) => {
  try {
    const { recordId, fileIndex } = req.params;
    const { download } = req.query; // Check if download or view

    const record = await MedicalRecord.findById(recordId);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const file = record.files[fileIndex];
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // ✅ FIX: Different headers for view vs download
    if (download === 'true') {
      // Download mode
      res.set({
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.originalName}"`,
        'Content-Length': file.fileSize
      });
    } else {
      // View mode (inline)
      res.set({
        'Content-Type': file.mimeType || 'application/pdf',
        'Content-Disposition': `inline; filename="${file.originalName}"`,
        'Content-Length': file.fileSize,
        'Cache-Control': 'no-cache'
      });
    }

    res.send(file.fileData);
  } catch (err) {
    console.error('File access error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get Doctor's Records (Current Hospital Only)
router.get('/doctor/:doctorId', authenticate, authorize('doctor', 'hospital'), async (req, res) => {
  try {
    const { doctorId } = req.params;
    const hospitalId = req.user.hospitalId;

    if (req.user.role === 'doctor' && req.user.id !== doctorId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const records = await MedicalRecord.find({ 
      doctorId, 
      hospitalId 
    })
      .populate('patientId', 'name age gender phone bloodGroup')
      .populate('hospitalId', 'name')
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
    const { allHospitals } = req.query;

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

// ✅ Update Record
router.put('/:id', authenticate, authorize('doctor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { diagnosis, symptoms, prescription, notes, prescriptions, vitals, nextVisit } = req.body;

    const record = await MedicalRecord.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    if (record.doctorId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own records' });
    }

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

// ✅ Delete Record
router.delete('/:id', authenticate, authorize('hospital'), async (req, res) => {
  try {
    const { id } = req.params;

    const record = await MedicalRecord.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

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