import express from 'express';
import MedicalRecord from '../models/MedicalRecord.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import HospitalPatientLink from '../models/HospitalPatientLink.js';
import { authenticate, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { extractEntities } from '../utils/nerClient.js';
import { encrypt } from '../utils/encryption.js';
import { audit } from '../utils/audit.js';
import { checkInteractions, extractDrugs } from '../utils/drugInteractions.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Build the plaintext search tokens for a record from NER entities + free text.
function buildSearchIndex(entities, extraTexts = []) {
  const tokens = [
    ...(entities.diseases || []),
    ...(entities.drugs || []),
    ...(entities.doses || []),
    ...(entities.vitals || []),
    ...extraTexts
  ];
  return [...new Set(
    tokens
      .filter(Boolean)
      .flatMap((t) => String(t).toLowerCase().split(/[\s,;.]+/))
      .map((t) => t.trim())
      .filter((t) => t.length > 1)
  )];
}

// Run cross-institutional drug interaction check for a patient across ALL
// their records (every hospital), optionally including freshly added drugs.
async function patientInteractionWarnings(patientId, newDrugs = []) {
  const records = await MedicalRecord.find({ patientId }).select('medicalEntities prescription prescriptions');
  const drugs = [...newDrugs];
  for (const r of records) {
    if (r.medicalEntities?.drugs) drugs.push(...r.medicalEntities.drugs);
    // prescription may be encrypted; extractDrugs only works on plaintext, so
    // we rely primarily on medicalEntities.drugs (always stored plaintext).
  }
  return checkInteractions(drugs);
}

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

    // �� Run the medical NER pipeline over all clinical text.
    const combinedText = [diagnosis, symptoms, prescription, notes, voiceTranscript]
      .filter(Boolean).join('. ');
    const entities = await extractEntities(combinedText);

    const searchIndex = buildSearchIndex(entities, keywords);

    // �� Cross-institutional drug interaction check (across all hospitals).
    const interactionWarnings = await patientInteractionWarnings(patientId, entities.drugs);

    const record = new MedicalRecord({
      patientId,
      doctorId: finalDoctorId,
      hospitalId,
      // �� Sensitive free-text fields are encrypted at rest (no-op if no key).
      diagnosis: encrypt(diagnosis),
      symptoms: encrypt(symptoms),
      prescription: encrypt(prescription),
      notes: encrypt(notes),
      voiceTranscript: encrypt(voiceTranscript),
      prescriptions: Array.isArray(prescriptions) ? prescriptions.map((p) => encrypt(p)) : [],
      vitals,
      nextVisit,
      visitType,
      searchKeywords: [...new Set(keywords)],
      medicalEntities: {
        diseases: entities.diseases,
        drugs: entities.drugs,
        doses: entities.doses,
        vitals: entities.vitals,
        nerBackend: entities.backend
      },
      searchIndex
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

    audit(req, 'RECORD_CREATE', { resourceType: 'MedicalRecord', resourceId: record._id, details: `Created record for patient ${patientId}` });

    await record.populate('patientId', 'name age gender');
    await record.populate('doctorId', 'name specialization');

    res.status(201).json({
      message: 'Medical record created successfully',
      record,
      entities: record.medicalEntities,
      interactionWarnings
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

      const prescriptionList = prescriptions ? prescriptions.split(',').map(p => p.trim()) : [];
      const fileText = filesData.map((f) => `${f.fileType} ${f.description} ${f.originalName}`).join(' ');
      const combinedText = [diagnosis, notes, prescriptionList.join(' '), fileText].filter(Boolean).join('. ');
      const entities = await extractEntities(combinedText);
      const searchIndex = buildSearchIndex(entities, [
        diagnosis, notes, ...prescriptionList, ...filesData.map((f) => `${f.fileType} ${f.description}`)
      ]);
      const interactionWarnings = await patientInteractionWarnings(patientId, entities.drugs);

      const record = new MedicalRecord({
        patientId,
        doctorId,
        hospitalId,
        diagnosis: encrypt(diagnosis),
        notes: encrypt(notes),
        prescriptions: prescriptionList.map((p) => encrypt(p)),
        files: filesData,
        medicalEntities: {
          diseases: entities.diseases,
          drugs: entities.drugs,
          doses: entities.doses,
          vitals: entities.vitals,
          nerBackend: entities.backend
        },
        searchIndex
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

      audit(req, 'RECORD_UPLOAD', { resourceType: 'MedicalRecord', resourceId: record._id, details: `Uploaded ${filesData.length} file(s) for patient ${patientId}` });

      res.status(201).json({ 
        message: 'Record with files uploaded successfully', 
        record: {
          _id: record._id,
          filesCount: filesData.length
        },
        entities: record.medicalEntities,
        interactionWarnings
      });
    } catch (err) {
      console.error('Upload record error:', err);
      res.status(500).json({ message: err.message });
    }
  }
);

// �� SMART Voice Search - Extracts patient names intelligently!
router.post('/voice-search', authenticate, authorize('doctor', 'patient'), async (req, res) => {
  try {
    const { query, patientId } = req.body;

    if (!query) {
      return res.status(400).json({ message: 'Search query required' });
    }

    console.log('�� Voice search query:', query);

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

    console.log('�� Base filter:', filter);

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

    console.log('�� Extracted search term:', extractedName);

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
        console.log('�� Found matching patients:', patients.map(p => p.name));
      }
    }

    // ✅ STEP 2: Build search conditions.
    // Diagnosis/symptoms/prescription/notes may be AES-256 encrypted at rest,
    // so we search the plaintext NER index (searchIndex / medicalEntities) and
    // non-sensitive file metadata instead of regex over the encrypted text.
    const queryTokens = [...new Set(
      [searchTerm, extractedName].join(' ').toLowerCase().split(/[\s,;.]+/).filter((t) => t.length > 1)
    )];

    const searchConditions = [
      { searchIndex: { $in: queryTokens } },
      { searchKeywords: { $in: queryTokens } },
      { 'medicalEntities.diseases': { $regex: extractedName, $options: 'i' } },
      { 'medicalEntities.drugs': { $regex: extractedName, $options: 'i' } },
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

    audit(req, 'VOICE_SEARCH', { resourceType: 'MedicalRecord', details: `Query: "${searchTerm}" → ${records.length} result(s)` });

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

// �� DEBUG: See all files in database
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

    // �� Ownership check: a patient may only access their own records; a
    // doctor/hospital may only access records from their own hospital.
    if (req.user.role === 'patient' && record.patientId.toString() !== req.user.id) {
      audit(req, 'FILE_ACCESS_DENIED', { resourceType: 'MedicalRecord', resourceId: recordId, details: `fileIndex ${fileIndex}` });
      return res.status(403).json({ message: 'Forbidden: not your record' });
    }
    if ((req.user.role === 'doctor' || req.user.role === 'hospital') &&
        record.hospitalId.toString() !== req.user.hospitalId) {
      audit(req, 'FILE_ACCESS_DENIED', { resourceType: 'MedicalRecord', resourceId: recordId, details: `fileIndex ${fileIndex}` });
      return res.status(403).json({ message: 'Forbidden: record belongs to another hospital' });
    }

    const file = record.files[fileIndex];
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    audit(req, 'FILE_DOWNLOAD', { resourceType: 'MedicalRecord', resourceId: recordId, details: `${file.originalName} (${download === 'true' ? 'download' : 'view'})` });

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

    audit(req, 'RECORD_VIEW', { resourceType: 'Patient', resourceId: patientId, details: `Viewed ${records.length} record(s)${allHospitals ? ' across all hospitals' : ''}` });

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

    if (diagnosis !== undefined) record.diagnosis = encrypt(diagnosis);
    if (symptoms !== undefined) record.symptoms = encrypt(symptoms);
    if (prescription !== undefined) record.prescription = encrypt(prescription);
    if (notes !== undefined) record.notes = encrypt(notes);
    if (prescriptions) record.prescriptions = prescriptions.map((p) => encrypt(p));
    if (vitals) record.vitals = vitals;
    if (nextVisit) record.nextVisit = nextVisit;

    // Re-run NER on the updated clinical text and refresh the search index.
    const combinedText = [diagnosis, symptoms, prescription, notes].filter(Boolean).join('. ');
    if (combinedText) {
      const entities = await extractEntities(combinedText);
      record.medicalEntities = {
        diseases: entities.diseases, drugs: entities.drugs,
        doses: entities.doses, vitals: entities.vitals, nerBackend: entities.backend
      };
      record.searchIndex = buildSearchIndex(entities, [diagnosis, symptoms, prescription].filter(Boolean));
    }

    await record.save();

    audit(req, 'RECORD_UPDATE', { resourceType: 'MedicalRecord', resourceId: record._id, details: 'Record fields updated' });

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

    audit(req, 'RECORD_DELETE', { resourceType: 'MedicalRecord', resourceId: id, details: 'Record deleted' });

    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// �� Cross-institutional drug interaction report for a patient.
// Aggregates every drug recorded for the patient across ALL hospitals.
router.get('/:patientId/interactions', authenticate, authorize('doctor', 'hospital', 'patient'), async (req, res) => {
  try {
    const { patientId } = req.params;

    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const records = await MedicalRecord.find({ patientId })
      .select('medicalEntities hospitalId createdAt')
      .populate('hospitalId', 'name');

    const drugSources = {}; // drug -> set of hospital names
    const allDrugs = [];
    for (const r of records) {
      const hosp = r.hospitalId?.name || 'Unknown hospital';
      for (const d of (r.medicalEntities?.drugs || [])) {
        allDrugs.push(d);
        const key = d.toLowerCase();
        drugSources[key] = drugSources[key] || new Set();
        drugSources[key].add(hosp);
      }
    }

    const warnings = checkInteractions(allDrugs).map((w) => ({
      ...w,
      // Show which hospitals prescribed each interacting drug (cross-institution).
      sources: w.drugs.map((d) => ({ drug: d, hospitals: [...(drugSources[d] || [])] }))
    }));

    audit(req, 'INTERACTION_CHECK', { resourceType: 'Patient', resourceId: patientId, details: `${warnings.length} interaction(s) found` });

    res.json({
      patientId,
      totalDrugs: [...new Set(allDrugs.map((d) => d.toLowerCase()))],
      warnings
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;