// Cross-institutional drug interaction checker.
//
// A small curated rule base of clinically significant interactions. Given a
// list of drug names (gathered across ALL hospitals a patient has visited),
// returns the pairs that interact, with severity and a human-readable note.
// This is what powers the paper's "automated drug interaction notifications
// across multiple hospitals" feature.

// Each rule: two drug names (lowercase) + severity + description.
const INTERACTIONS = [
  ['warfarin', 'aspirin', 'major', 'Increased bleeding risk (additive anticoagulant/antiplatelet effect).'],
  ['warfarin', 'ibuprofen', 'major', 'NSAIDs raise bleeding risk and can displace warfarin.'],
  ['warfarin', 'diclofenac', 'major', 'NSAID + anticoagulant: high GI bleeding risk.'],
  ['warfarin', 'azithromycin', 'moderate', 'May increase INR / bleeding risk.'],
  ['warfarin', 'ciprofloxacin', 'moderate', 'Can potentiate warfarin, raising bleeding risk.'],
  ['clopidogrel', 'omeprazole', 'moderate', 'Omeprazole reduces clopidogrel activation (antiplatelet effect).'],
  ['clopidogrel', 'aspirin', 'moderate', 'Dual antiplatelet therapy increases bleeding risk.'],
  ['aspirin', 'ibuprofen', 'moderate', 'Ibuprofen can blunt aspirin cardioprotection; additive GI risk.'],
  ['metformin', 'furosemide', 'moderate', 'Diuretics can worsen glycaemic control / lactic acidosis risk.'],
  ['atorvastatin', 'azithromycin', 'moderate', 'Increased risk of myopathy/rhabdomyolysis.'],
  ['atorvastatin', 'clarithromycin', 'major', 'Markedly increased statin levels; myopathy risk.'],
  ['digoxin', 'furosemide', 'major', 'Furosemide-induced hypokalaemia increases digoxin toxicity.'],
  ['digoxin', 'azithromycin', 'moderate', 'May increase digoxin levels.'],
  ['tramadol', 'sertraline', 'major', 'Serotonin syndrome risk.'],
  ['tramadol', 'fluoxetine', 'major', 'Serotonin syndrome risk.'],
  ['sertraline', 'fluoxetine', 'major', 'Additive serotonergic effect — serotonin syndrome.'],
  ['losartan', 'furosemide', 'moderate', 'Risk of hypotension and renal impairment.'],
  ['ramipril', 'losartan', 'moderate', 'ACE inhibitor + ARB: hyperkalaemia and renal risk.'],
  ['ramipril', 'hydrochlorothiazide', 'minor', 'Monitor for hypotension (usually intentional combo).'],
  ['prednisone', 'ibuprofen', 'moderate', 'Increased GI ulcer/bleeding risk.'],
  ['insulin', 'metformin', 'minor', 'Additive glucose lowering — monitor for hypoglycaemia.'],
  ['amlodipine', 'atorvastatin', 'minor', 'Amlodipine can raise atorvastatin levels slightly.'],
];

const SEVERITY_RANK = { major: 3, moderate: 2, minor: 1 };

function normalize(name) {
  return String(name || '').toLowerCase().trim();
}

// Extract known drug tokens from arbitrary free text (prescription strings).
const KNOWN_DRUGS = new Set();
INTERACTIONS.forEach(([a, b]) => { KNOWN_DRUGS.add(a); KNOWN_DRUGS.add(b); });

export function extractDrugs(text) {
  if (!text) return [];
  const low = ` ${normalize(text)} `;
  const found = [];
  for (const drug of KNOWN_DRUGS) {
    if (low.includes(` ${drug} `) || low.includes(` ${drug},`) || low.includes(` ${drug}.`)) {
      found.push(drug);
    }
  }
  return [...new Set(found)];
}

// drugList: array of drug names (already extracted). Returns interaction objects.
export function checkInteractions(drugList) {
  const drugs = [...new Set((drugList || []).map(normalize).filter(Boolean))];
  const warnings = [];
  for (const [a, b, severity, description] of INTERACTIONS) {
    if (drugs.includes(a) && drugs.includes(b)) {
      warnings.push({ drugs: [a, b], severity, description });
    }
  }
  warnings.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
  return warnings;
}

export { INTERACTIONS };
