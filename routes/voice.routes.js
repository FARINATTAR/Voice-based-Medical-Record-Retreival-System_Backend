import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import Transcription from "../models/Transcription.js";
import FormData from "form-data";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/interpret", upload.single("audio"), async (req, res) => {
  try {
    console.log("📥 Received:", { doctorId: req.body.doctorId, patientId: req.body.patientId });
    
    if (!req.file) return res.status(400).json({ error: "No audio uploaded" });

    const filePath = req.file.path;
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(filePath));

    console.log("🎤 Sending to Whisper...");

    const whisperRes = await axios.post("http://localhost:5001/transcribe", formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    console.log("✅ Whisper said:", whisperRes.data);

    fs.unlinkSync(filePath);
    const text = whisperRes.data.text || whisperRes.data.transcription || "No transcription";

    // ✅ Save with OPTIONAL patientId
    const transcriptionData = {
      doctorId: req.body.doctorId,
      transcriptText: text,
      searchType: req.body.patientId ? 'patient_specific' : 'global_search'
    };

    // Only add patientId if it exists and is not empty
    if (req.body.patientId && req.body.patientId.trim() !== '') {
      transcriptionData.patientId = req.body.patientId;
    }

    const transcription = await Transcription.create(transcriptionData);

    console.log("💾 Saved:", transcription);

    res.json({ 
      text, 
      transcriptionId: transcription._id,
      success: true,
      searchType: transcriptionData.searchType
    });
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("Stack:", err.stack);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: "Voice processing failed",
      details: err.message,
      whisperError: err.response?.data || "Check Whisper server on port 5001"
    });
  }
});

router.get("/patient/:id", async (req, res) => {
  try {
    const transcriptions = await Transcription.find({ 
      patientId: req.params.id 
    }).sort({ createdAt: -1 });
    res.json(transcriptions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transcriptions" });
  }
});

// ✅ NEW: Get all transcriptions for a doctor (global search history)
router.get("/doctor/:doctorId/all", async (req, res) => {
  try {
    const transcriptions = await Transcription.find({ 
      doctorId: req.params.doctorId 
    }).sort({ createdAt: -1 }).limit(50);
    res.json(transcriptions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transcriptions" });
  }
});

export default router;
