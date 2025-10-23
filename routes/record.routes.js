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
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Get All Records
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

// Create Medical Record
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
        message: 'Missing required fields' 
      });
    }

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
      searchKeywords: [...new Set(keywords)]
    });

    await record.save();

    await HospitalPatientLink.findOneAndUpdate(
      { patientId, hospitalId },
      { 
        lastVisitDate: new Date(),
        $inc: { totalVisits: 1 }
      },
      { upsert: true }
    );

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

// Upload Record with Files
router.post('/upload-files', 
  authenticate, 
  authorize('hospital', 'doctor'), 
  upload.array('files', 10),
  async (req, res) => {
    try {
      const { 
        patientId, 
        doctorId, 
        diagnosis, 
        notes, 
        prescriptions,
        fileTypes,
        fileDescriptions
      } = req.body;
      
      const hospitalId = req.user.hospitalId;

      if (!patientId || !doctorId || !hospitalId || !diagnosis) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const types = fileTypes ? JSON.parse(fileTypes) : [];
      const descriptions = fileDescriptions ? JSON.parse(fileDescriptions) : [];

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

// 🔥 SMART Voice Search - Extracts patient names intelligently!
router.post('/voice-search', authenticate, authorize('doctor', 'patient'), async (req, res) => {
  try {
    const { query, patientId } = req.body;

    if (!query) {
      return res.status(400).json({ message: 'Search query required' });
    }

    console.log('🔍 Voice search query:', query);

    // Base filter
    let filter = {};
    if (req.user.role === 'patient') {
      filter.patientId = req.user.id;
    } else if (patientId) {
      filter.patientId = patientId;
      filter.hospitalId = req.user.hospitalId;
    } else {
      filter.hospitalId = req.user.hospitalId;
    }

    console.log('📋 Base filter:', filter);

    const searchTerm = query.trim();

    // ✅ SMART NAME EXTRACTION: Remove common phrases to get patient name
    const commonPhrases = [
      'show me all reports of',
      'show me reports of',
      'give me all reports of',
      'give me reports of',
      'show all reports of',
      'find reports of',
      'get reports of',
      'show me',
      'give me',
      'find',
      'get',
      'all reports of',
      'reports of',
      'reports for',
      'records of',
      'records for'
    ];

    let extractedName = searchTerm.toLowerCase();
    
    // Remove common phrases
    commonPhrases.forEach(phrase => {
      extractedName = extractedName.replace(new RegExp(phrase, 'gi'), '').trim();
    });

    console.log('🔑 Extracted search term:', extractedName);

    // ✅ STEP 1: Search for matching patients by name
    let matchingPatientIds = [];
    
    if (!patientId) {
      // Try both full query and extracted name
      const patients = await Patient.find({
        $or: [
          { name: { $regex: extractedName, $options: 'i' } },
          { name: { $regex: searchTerm, $options: 'i' } }
        ]
      }).select('_id name');

      matchingPatientIds = patients.map(p => p._id);
      
      if (patients.length > 0) {
        console.log('👥 Found matching patients:', patients.map(p => p.name));
      }
    }

    // ✅ STEP 2: Build search conditions
    const searchConditions = [
      { diagnosis: { $regex: searchTerm, $options: 'i' } },
      { diagnosis: { $regex: extractedName, $options: 'i' } },
      { symptoms: { $regex: searchTerm, $options: 'i' } },
      { symptoms: { $regex: extractedName, $options: 'i' } },
      { notes: { $regex: searchTerm, $options: 'i' } },
      { prescription: { $regex: searchTerm, $options: 'i' } },
      { 'files.fileType': { $regex: searchTerm, $options: 'i' } },
      { 'files.fileType': { $regex: extractedName, $options: 'i' } },
      { 'files.originalName': { $regex: searchTerm, $options: 'i' } },
      { 'files.originalName': { $regex: extractedName, $options: 'i' } },
      { 'files.description': { $regex: searchTerm, $options: 'i' } },
      { 'files.description': { $regex: extractedName, $options: 'i' } }
    ];

    // Add patient IDs to search if found
    if (matchingPatientIds.length > 0) {
      searchConditions.push({ patientId: { $in: matchingPatientIds } });
    }

    // ✅ STEP 3: Search records
    const records = await MedicalRecord.find({
      ...filter,
      $or: searchConditions
    })
      .populate('patientId', 'name age gender phone')
      .populate('doctorId', 'name specialization')
      .populate('hospitalId', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    console.log('✅ Found records:', records.length);

    if (records.length > 0) {
      console.log('📄 First result:', {
        patient: records[0].patientId?.name,
        diagnosis: records[0].diagnosis,
        files: records[0].files.map(f => f.originalName)
      });
    }

    res.json({
      query: searchTerm,
      extractedTerm: extractedName,
      count: records.length,
      records
    });
  } catch (err) {
    console.error('❌ Voice search error:', err);
    res.status(500).json({ message: err.message });
  }
});

// 🔍 DEBUG: See all files in database
router.get('/debug-files', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    
    const records = await MedicalRecord.find({ 
      hospitalId,
      'files.0': { $exists: true }
    })
      .select('diagnosis files.originalName files.fileType files.description patientId createdAt')
      .populate('patientId', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    const fileList = records.map(r => ({
      recordId: r._id,
      date: r.createdAt,
      patient: r.patientId?.name,
      diagnosis: r.diagnosis,
      files: r.files.map(f => ({
        name: f.originalName,
        type: f.fileType,
        description: f.description || 'No description'
      }))
    }));

    res.json({
      totalRecordsWithFiles: records.length,
      records: fileList
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download/View File
router.get('/file/:recordId/:fileIndex', authenticate, async (req, res) => {
  try {
    const { recordId, fileIndex } = req.params;
    const { download } = req.query;

    const record = await MedicalRecord.findById(recordId);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const file = record.files[fileIndex];
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (download === 'true') {
      res.set({
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.originalName}"`,
        'Content-Length': file.fileSize
      });
    } else {
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

// Get Doctor's Records
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

// Get Patient's Records
router.get('/patient/:patientId', authenticate, authorize('doctor', 'patient', 'hospital'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { allHospitals } = req.query;

    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    let query = { patientId };

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

// Update Record
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

// Delete Record
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