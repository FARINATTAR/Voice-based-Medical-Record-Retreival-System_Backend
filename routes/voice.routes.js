import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import Transcription from "../models/Transcription.js";
import MedicalRecord from "../models/MedicalRecord.js";
import Patient from "../models/Patient.js";
import FormData from "form-data";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// ✅ Voice Interpret + Auto Search Records (SIMPLIFIED)
router.post("/interpret", authenticate, authorize('doctor', 'hospital'), upload.single("audio"), async (req, res) => {
  try {
    const doctorId = req.user.id;
    const patientId = req.body.patientId;
    const hospitalId = req.user.hospitalId;
    
    console.log("📥 Received:", { 
      doctorId, 
      patientId,
      hospitalId,
      hasAudio: !!req.file 
    });
    
    if (!req.file) {
      return res.status(400).json({ error: "No audio uploaded" });
    }

    const filePath = req.file.path;
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(filePath));

    console.log("🎤 Sending to Whisper...");

    const whisperRes = await axios.post("http://localhost:5001/transcribe", formData, {
      headers: formData.getHeaders(),
      timeout: 60000
    });

    console.log("✅ Whisper said:", whisperRes.data);

    fs.unlinkSync(filePath);
    
    const text = whisperRes.data.text || whisperRes.data.transcription || "No transcription";

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
    console.log("💾 Saved transcription:", transcription._id);

    // ✅ SMART AUTO-SEARCH: Extract patient name intelligently
    console.log("🔍 Searching with query:", text);
    
    let searchFilter = {
      hospitalId: hospitalId
    };

    // If patientId provided, search only that patient's records
    if (patientId && patientId.trim() !== '') {
      searchFilter.patientId = patientId;
      console.log("🎯 Patient-specific search for:", patientId);
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

    let extractedName = text.toLowerCase();
    
    commonPhrases.forEach(phrase => {
      extractedName = extractedName.replace(new RegExp(phrase, 'gi'), '').trim();
    });

    console.log('🔑 Extracted term:', extractedName);

    // ✅ STEP 1: Search for matching patients by name
    let matchingPatientIds = [];
    
    if (!patientId) {
      const patients = await Patient.find({
        $or: [
          { name: { $regex: extractedName, $options: 'i' } },
          { name: { $regex: text, $options: 'i' } }
        ]
      }).select('_id name');

      matchingPatientIds = patients.map(p => p._id);
      if (patients.length > 0) {
        console.log('👥 Found matching patients:', patients.map(p => p.name));
      }
    }

    // ✅ STEP 2: Build search conditions
    const searchConditions = [
      { diagnosis: { $regex: text, $options: 'i' } },
      { diagnosis: { $regex: extractedName, $options: 'i' } },
      { symptoms: { $regex: text, $options: 'i' } },
      { symptoms: { $regex: extractedName, $options: 'i' } },
      { prescription: { $regex: text, $options: 'i' } },
      { notes: { $regex: text, $options: 'i' } },
      { 'files.fileType': { $regex: text, $options: 'i' } },
      { 'files.fileType': { $regex: extractedName, $options: 'i' } },
      { 'files.description': { $regex: text, $options: 'i' } },
      { 'files.description': { $regex: extractedName, $options: 'i' } },
      { 'files.originalName': { $regex: text, $options: 'i' } },
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

    if (records.length > 0) {
      console.log("📄 First result:", {
        patient: records[0].patientId?.name,
        diagnosis: records[0].diagnosis,
        files: records[0].files.map(f => f.originalName)
      });
    }

    res.json({ 
      text, 
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