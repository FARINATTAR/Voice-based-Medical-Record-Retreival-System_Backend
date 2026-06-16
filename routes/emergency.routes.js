// Emergency QR access for unconscious patients.
//
// A patient (or their doctor/hospital) can mint a signed QR code. Scanning it
// opens a PUBLIC page that shows only life-critical information — blood group,
// allergies, chronic conditions, current medications and emergency contact —
// without requiring login. The token is HMAC-signed (JWT) so it cannot be
// forged, and every access is written to the tamper-evident audit chain.

import express from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import Patient from '../models/Patient.js';
import MedicalRecord from '../models/MedicalRecord.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';

const router = express.Router();

const QR_SECRET = process.env.EMERGENCY_QR_SECRET || 'change-me-emergency-secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Generate the emergency QR for a patient.
router.post('/qr/:patientId', authenticate, authorize('patient', 'doctor', 'hospital'), async (req, res) => {
  try {
    const { patientId } = req.params;
    if (req.user.role === 'patient' && req.user.id !== patientId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const patient = await Patient.findById(patientId).select('name');
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Long-lived because emergencies are unpredictable; revocable by rotating
    // EMERGENCY_QR_SECRET.
    const token = jwt.sign({ pid: patientId, type: 'emergency' }, QR_SECRET, { expiresIn: '365d' });
    const url = `${FRONTEND_URL}/emergency/${token}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });

    res.json({ token, url, qrDataUrl, patientName: patient.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUBLIC: resolve a scanned emergency token to critical info. No auth.
router.get('/access/:token', async (req, res) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.params.token, QR_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired emergency code' });
    }
    if (payload.type !== 'emergency') {
      return res.status(400).json({ message: 'Not an emergency token' });
    }

    const patient = await Patient.findById(payload.pid)
      .select('name age gender bloodGroup allergies chronicConditions emergencyContact');
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Aggregate current medications + recent conditions from the plaintext NER
    // entities across ALL hospitals (encrypted free text is never exposed here).
    const records = await MedicalRecord.find({ patientId: payload.pid })
      .select('medicalEntities createdAt')
      .sort({ createdAt: -1 })
      .limit(20);

    const medications = new Set();
    const conditions = new Set();
    for (const r of records) {
      (r.medicalEntities?.drugs || []).forEach((d) => medications.add(d));
      (r.medicalEntities?.diseases || []).forEach((d) => conditions.add(d));
    }

    // Record emergency access in the audit chain (actor unknown / public scan).
    recordAudit({
      actorRole: 'emergency-scan',
      actorName: 'QR scan',
      action: 'EMERGENCY_ACCESS',
      resourceType: 'Patient',
      resourceId: String(payload.pid),
      details: 'Emergency QR scanned (public access)'
    });

    res.json({
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      bloodGroup: patient.bloodGroup || 'Unknown',
      allergies: patient.allergies || [],
      chronicConditions: [...new Set([...(patient.chronicConditions || []), ...conditions])],
      currentMedications: [...medications],
      emergencyContact: patient.emergencyContact || null,
      accessedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
