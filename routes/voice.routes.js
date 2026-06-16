import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import Transcription from "../models/Transcription.js";
import MedicalRecord from "../models/MedicalRecord.js";
import Patient from "../models/Patient.js";
import FormData from "form-data";
import { authenticate, authorize } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";

// ✅ Voice Interpret + Auto Search Records (SIMPLIFIED)
router.post("/interpret", authenticate, authorize('doctor', 'hospital', 'patient'), upload.single("audio"), async (req, res) => {
  try {
    const doctorId = req.user.id;
    const isPatient = req.user.role === 'patient';
    // Patients can only search their own records (across all hospitals).
    const patientId = isPatient ? req.user.id : req.body.patientId;
    const hospitalId = req.user.hospitalId;
    
    console.log("�� Received:", { 
      doctorId, 
      patientId,
      hospitalId,
      hasAudio: !!req.file 
    });
    
    if (!req.file) {
      return res.status(400).json({ error: "No audio uploaded" });
    }

    const filePath = req.file.path;
    const language = (req.body.language || "en").toLowerCase();
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(filePath));
    formData.append("language", language);

    console.log(`�� Sending to ML service (lang=${language})...`);

    const whisperRes = await axios.post(`${ML_URL}/transcribe`, formData, {
      headers: formData.getHeaders(),
      timeout: 180000
    });

    console.log("✅ Whisper said:", whisperRes.data);

    fs.unlinkSync(filePath);

    // Native-language transcript for display; English translation drives search.
    const text = whisperRes.data.text || whisperRes.data.transcription || "No transcription";
    const searchText = whisperRes.data.translation || text;
    const detectedLanguage = whisperRes.data.language || language;
    const medicalEntities = {
      diseases: whisperRes.data.diseases || [],
      drugs: whisperRes.data.drugs || [],
      doses: whisperRes.data.doses || [],
      vitals: whisperRes.data.vitals || []
    };
    const rawEntities = whisperRes.data.entities || [];

    // ✅ Save transcription
    const transcriptionData = {
      doctorId: doctorId,
      transcriptText: text,
      searchType: patientId ? 'patient_specific' : 'global_search'
    };

    if (patientId && patientId.trim() !== '') {
      transcriptionData.patientId = patientId;
    }

    const transcription = await Transcription.create(transcriptionData);
    console.log("�� Saved transcription:", transcription._id);

    // ✅ SMART AUTO-SEARCH: Extract patient name intelligently
    console.log("�� Searching with query:", text);
    
    let searchFilter = {};
    if (isPatient) {
      // Patient: own records only, across every hospital (no hospital filter).
      searchFilter.patientId = req.user.id;
    } else {
      searchFilter.hospitalId = hospitalId;
      if (patientId && String(patientId).trim() !== '') {
        searchFilter.patientId = patientId;
        console.log("�� Patient-specific search for:", patientId);
      }
    }

    // ✅ SMART NAME EXTRACTION: Remove common phrases
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

    let extractedName = searchText.toLowerCase();
    
    commonPhrases.forEach(phrase => {
      extractedName = extractedName.replace(new RegExp(phrase, 'gi'), '').trim();
    });

    console.log('�� Extracted term:', extractedName);

    // ✅ STEP 1: Search for matching patients by name
    let matchingPatientIds = [];
    
    if (!patientId) {
      const patients = await Patient.find({
        $or: [
          { name: { $regex: extractedName, $options: 'i' } },
          { name: { $regex: searchText, $options: 'i' } }
        ]
      }).select('_id name');

      matchingPatientIds = patients.map(p => p._id);
      if (patients.length > 0) {
        console.log('�� Found matching patients:', patients.map(p => p.name));
      }
    }

    // ✅ STEP 2: Build search conditions over the plaintext NER index + entities
    // (sensitive free-text fields are AES-256 encrypted, so we don't regex them).
    const queryTokens = [...new Set(
      [searchText, extractedName].join(' ').toLowerCase().split(/[\s,;.]+/).filter((t) => t.length > 1)
    )];

    const searchConditions = [
      { searchIndex: { $in: queryTokens } },
      { searchKeywords: { $in: queryTokens } },
      { 'medicalEntities.diseases': { $regex: extractedName, $options: 'i' } },
      { 'medicalEntities.drugs': { $regex: extractedName, $options: 'i' } },
      { 'files.fileType': { $regex: searchText, $options: 'i' } },
      { 'files.fileType': { $regex: extractedName, $options: 'i' } },
      { 'files.description': { $regex: searchText, $options: 'i' } },
      { 'files.description': { $regex: extractedName, $options: 'i' } },
      { 'files.originalName': { $regex: searchText, $options: 'i' } },
      { 'files.originalName': { $regex: extractedName, $options: 'i' } }
    ];

    // Add patient IDs if found
    if (matchingPatientIds.length > 0) {
      searchConditions.push({ patientId: { $in: matchingPatientIds } });
    }

    // ✅ STEP 3: Search records
    const records = await MedicalRecord.find({
      ...searchFilter,
      $or: searchConditions
    })
      .populate('patientId', 'name age gender phone')
      .populate('doctorId', 'name specialization')
      .populate('hospitalId', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    console.log(`✅ Found ${records.length} matching records`);

    audit(req, 'VOICE_SEARCH', { resourceType: 'MedicalRecord', details: `(${detectedLanguage}) "${text}" → ${records.length} result(s)` });

    res.json({ 
      text, 
      language: detectedLanguage,
      translation: searchText,
      entities: rawEntities,
      medicalEntities,
      transcriptionId: transcription._id,
      success: true,
      searchType: transcriptionData.searchType,
      query: text,
      records: records,
      recordCount: records.length
    });
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("Stack:", err.stack);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: "Whisper service unavailable",
        details: "Make sure Whisper server is running on port 5001"
      });
    }
    
    if (err.message.includes('timeout')) {
      return res.status(504).json({ 
        error: "Transcription timeout",
        details: "Audio file took too long to process. Try shorter recordings."
      });
    }
    
    res.status(500).json({ 
      error: "Voice processing failed",
      details: err.message
    });
  }
});

// ✅ Get transcriptions for specific patient
router.get("/patient/:id", authenticate, authorize('doctor', 'hospital'), async (req, res) => {
  try {
    const transcriptions = await Transcription.find({ 
      patientId: req.params.id 
    }).sort({ createdAt: -1 });
    res.json(transcriptions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transcriptions" });
  }
});

// ✅ Get all transcriptions for authenticated doctor
router.get("/doctor/all", authenticate, authorize('doctor', 'hospital'), async (req, res) => {
  try {
    const transcriptions = await Transcription.find({ 
      doctorId: req.user.id 
    }).sort({ createdAt: -1 }).limit(50);
    res.json(transcriptions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transcriptions" });
  }
});

export default router;