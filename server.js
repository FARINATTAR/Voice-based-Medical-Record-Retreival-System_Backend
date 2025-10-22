// import express from 'express';
// import dotenv from 'dotenv';
// import cors from 'cors';
// import connectDB from './config/db.js';

// // Routes
// import hospitalRoutes from './routes/hospital.routes.js';
// import doctorRoutes from './routes/doctor.routes.js';
// import patientRoutes from './routes/patient.routes.js';
// import adminRoutes from './routes/admin.routes.js';
// import recordRoutes from './routes/record.routes.js';
// import voiceRoutes from './routes/voice.routes.js'; // Your existing voice routes

// dotenv.config();
// const app = express();

// // CORS
// app.use(cors({
//   origin: 'http://localhost:5173',
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));

// app.options('*', cors());

// // Body parsers
// app.use(express.json({ strict: false }));
// app.use(express.urlencoded({ extended: true }));

// // Connect to MongoDB
// connectDB();

// // Mount routes
// app.use('/api/hospital', hospitalRoutes);
// app.use('/api/doctor', doctorRoutes);
// app.use('/api/patient', patientRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/records', recordRoutes);
// app.use('/api/voice', voiceRoutes);

// // Test route
// app.get('/', (req, res) => {
//   res.json({ 
//     message: 'Medical Voice System API',
//     version: '2.0',
//     endpoints: {
//       hospital: '/api/hospital',
//       doctor: '/api/doctor',
//       patient: '/api/patient',
//       admin: '/api/admin',
//       records: '/api/records',
//       voice: '/api/voice'
//     }
//   });
// });

// // Error handling middleware
// app.use((err, req, res, next) => {
//   console.error('Error:', err.stack);
//   res.status(500).json({ 
//     message: 'Something went wrong!', 
//     error: err.message 
//   });
// });

// // 404 handler
// app.use((req, res) => {
//   res.status(404).json({ message: 'Route not found' });
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
//   console.log(`📍 API URL: http://localhost:${PORT}`);
// });

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';

// Routes
import hospitalRoutes from './routes/hospital.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import patientRoutes from './routes/patient.routes.js';
import adminRoutes from './routes/admin.routes.js';
import recordRoutes from './routes/record.routes.js';
import voiceRoutes from './routes/voice.routes.js'; // Your existing voice routes
dotenv.config();
const app = express();

// CORS Configuration
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ REMOVED: app.options('*', cors()); - This was causing the error

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect to MongoDB
connectDB();

// Mount routes
app.use('/api/hospital', hospitalRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/voice', voiceRoutes);
// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Medical Voice System API',
    version: '2.0',
    status: 'running',
    endpoints: {
      hospital: '/api/hospital',
      doctor: '/api/doctor',
      patient: '/api/patient',
      admin: '/api/admin',
      records: '/api/records',
      voice: '/api/voice'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(err.status || 500).json({ 
    message: err.message || 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 API URL: http://localhost:${PORT}`);
  console.log(`🏥 Hospital Signup: http://localhost:${PORT}/api/hospital/signup`);
  console.log(`🔐 Hospital Login: http://localhost:${PORT}/api/hospital/login\n`);
});