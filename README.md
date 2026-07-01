# ⚙️ VoiceMed Backend - Voice-based Medical Record Retrieval System

> **Backend API** — Node.js + Express + MongoDB

🔗 **Live API:** [https://voicemed-backend.onrender.com](https://voicemed-backend.onrender.com)

🔗 **Frontend Demo:** [https://frontend-phi-ashy-42.vercel.app](https://frontend-phi-ashy-42.vercel.app)

🔗 **Frontend Repo:** [Voice-based-Medical-Record-Retreival-System_Frontend](https://github.com/FARINATTAR/Voice-based-Medical-Record-Retreival-System_Frontend)

## API Endpoints

| Route | Description |
|-------|------------|
| `/api/hospital` | Hospital registration & auth |
| `/api/doctor` | Doctor authentication & management |
| `/api/patient` | Patient authentication & management |
| `/api/records` | Medical records CRUD operations |
| `/api/voice` | Voice transcription & NER processing |
| `/api/audit` | Blockchain-inspired audit trail |
| `/api/emergency` | Emergency QR-based record access |

## Features

- 🔐 **JWT Authentication** — Role-based access (Hospital, Doctor, Patient)
- 🗄️ **MongoDB** — Medical records with encrypted sensitive fields
- 🔒 **AES-256 Encryption** — Field-level encryption for patient data
- 🔗 **Audit Trail** — Blockchain-inspired tamper-evident logging
- 🆘 **Emergency Access** — Secure QR code token-based access
- 💊 **Drug Interactions** — Automated drug safety validation
- 🎤 **ML Service** — Whisper STT + SciSpaCy medical NER (Python Flask)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, Express 5 |
| Database | MongoDB Atlas (Mongoose 8) |
| Auth | JWT + bcryptjs |
| Encryption | AES-256 field-level encryption |
| ML Service | Python Flask, OpenAI Whisper, SciSpaCy |
| Deployment | Render (Node.js), MongoDB Atlas |

## Getting Started

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run production
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
FIELD_ENCRYPTION_KEY=your-64-char-hex-key
EMERGENCY_QR_SECRET=your-qr-secret
```
