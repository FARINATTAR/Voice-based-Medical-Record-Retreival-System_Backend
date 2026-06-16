// Thin client for the Python ML service's /ner endpoint, with a local
// fallback so record creation never fails just because the ML service is down.

import axios from 'axios';

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

const FALLBACK_DRUGS = [
  'paracetamol', 'acetaminophen', 'ibuprofen', 'aspirin', 'amoxicillin',
  'azithromycin', 'metformin', 'insulin', 'atorvastatin', 'amlodipine',
  'omeprazole', 'pantoprazole', 'ciprofloxacin', 'cetirizine', 'diclofenac',
  'prednisone', 'salbutamol', 'warfarin', 'clopidogrel', 'losartan',
  'ramipril', 'furosemide', 'levothyroxine', 'tramadol', 'digoxin',
  'sertraline', 'fluoxetine', 'ceftriaxone', 'doxycycline',
];
const FALLBACK_DISEASES = [
  'diabetes', 'hypertension', 'fever', 'cough', 'cold', 'asthma', 'pneumonia',
  'bronchitis', 'tuberculosis', 'migraine', 'anemia', 'arthritis', 'cancer',
  'covid', 'influenza', 'malaria', 'dengue', 'typhoid', 'jaundice',
  'hepatitis', 'ulcer', 'gastritis', 'viral infection', 'heart attack',
  'uti', 'headache', 'diarrhea', 'chest pain',
];

function fallbackNER(text) {
  const low = ` ${String(text || '').toLowerCase()} `;
  const diseases = FALLBACK_DISEASES.filter((d) => low.includes(d));
  const drugs = FALLBACK_DRUGS.filter((d) => low.includes(d));
  const doses = (text.match(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml|g|units?|tablets?|tabs?)\b/gi) || []);
  return { diseases, drugs, doses, vitals: [], backend: 'node-fallback' };
}

export async function extractEntities(text) {
  if (!text || !text.trim()) {
    return { diseases: [], drugs: [], doses: [], vitals: [], backend: 'none' };
  }
  try {
    const res = await axios.post(`${ML_URL}/ner`, { text }, { timeout: 8000 });
    return {
      diseases: res.data.diseases || [],
      drugs: res.data.drugs || [],
      doses: res.data.doses || [],
      vitals: res.data.vitals || [],
      backend: res.data.backend || 'ml-service',
    };
  } catch (err) {
    return fallbackNER(text);
  }
}
