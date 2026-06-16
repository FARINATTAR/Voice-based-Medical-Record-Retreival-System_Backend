"""
Medical Named Entity Recognition for VoiceMed.

Extracts four entity categories from clinical free text, matching the
categories reported in the paper:

    DISEASE   - conditions / diagnoses (e.g. "diabetes", "pneumonia")
    DRUG      - medications (e.g. "paracetamol", "metformin")
    DOSE      - dosages / frequencies (e.g. "500 mg", "twice daily")
    VITAL     - vital signs (e.g. "BP 120/80", "temp 101 F", "pulse 88")

Primary backend is SciSpaCy (biomedical NER + entity linking). SciSpaCy can
be hard to install, so if it is not importable we transparently fall back to
a deterministic rule-based extractor (gazetteer + regex). Both backends return
the same shape, so the rest of the system does not care which one ran.
"""

import re
from difflib import get_close_matches

# ---------------------------------------------------------------------------
# Gazetteers (used by the rule-based extractor and to enrich SciSpaCy output)
# ---------------------------------------------------------------------------

DRUGS = {
    "paracetamol", "acetaminophen", "ibuprofen", "aspirin", "amoxicillin",
    "azithromycin", "metformin", "insulin", "atorvastatin", "amlodipine",
    "omeprazole", "pantoprazole", "ciprofloxacin", "cetirizine", "diclofenac",
    "prednisone", "prednisolone", "salbutamol", "albuterol", "warfarin",
    "clopidogrel", "losartan", "ramipril", "furosemide", "hydrochlorothiazide",
    "levothyroxine", "gabapentin", "tramadol", "morphine", "dolo", "augmentin",
    "azithral", "pan", "telmisartan", "glimepiride", "metoprolol", "digoxin",
    "heparin", "enoxaparin", "ceftriaxone", "doxycycline", "ondansetron",
    "diazepam", "lorazepam", "sertraline", "fluoxetine", "naproxen",
}

DISEASES = {
    "diabetes", "hypertension", "fever", "cough", "cold", "asthma",
    "pneumonia", "bronchitis", "tuberculosis", "tb", "migraine", "anemia",
    "anaemia", "arthritis", "cancer", "stroke", "covid", "covid-19",
    "influenza", "flu", "malaria", "dengue", "typhoid", "jaundice",
    "hepatitis", "ulcer", "gastritis", "appendicitis", "sinusitis",
    "pharyngitis", "tonsillitis", "dermatitis", "eczema", "psoriasis",
    "hypothyroidism", "hyperthyroidism", "obesity", "depression", "anxiety",
    "epilepsy", "seizure", "myocardial infarction", "heart attack",
    "angina", "copd", "uti", "urinary tract infection", "viral infection",
    "bacterial infection", "viral fever", "headache", "diarrhea", "diarrhoea",
    "vomiting", "nausea", "chest pain", "shortness of breath", "fatigue",
    "kidney stone", "renal failure", "liver disease", "cirrhosis",
}

# Multi-word entries first so they match before their single-word parts.
DISEASE_PHRASES = sorted(
    (d for d in DISEASES if " " in d or "-" in d), key=len, reverse=True
)
DISEASE_WORDS = {d for d in DISEASES if " " not in d and "-" not in d}

# ---------------------------------------------------------------------------
# Regex patterns for doses and vitals
# ---------------------------------------------------------------------------

DOSE_PATTERNS = [
    # 500 mg, 5 ml, 10mcg, 1 g, 2 tablets, 1 tab
    r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml|g|gm|units?|iu|tablets?|tabs?|caps?|capsules?|drops?|puffs?)\b",
    # frequency: twice daily, once a day, 1-0-1, BD, TDS, OD, QID, q8h
    r"\b(?:once|twice|thrice|three times|four times|two times)\s+(?:a\s+)?(?:daily|day|week|month)\b",
    r"\b\d-\d-\d\b",
    r"\b(?:OD|BD|TDS|QID|HS|SOS|PRN|q\d+h)\b",
    r"\bevery\s+\d+\s+hours?\b",
    r"\bfor\s+\d+\s+days?\b",
]

VITAL_PATTERNS = [
    # Blood pressure: 120/80, 130 over 85, 130-85, 140, 90 (comma-separated from Whisper), Bp12080, BP 1,2080
    r"\b(?:bp|bb|blood\s+pressure)[\s,:]*(?:\d[\s,/\-]*){4,8}\b",
    r"\b(?:bp|bb|blood pressure)\b[\w\s\-,]{0,20}?\b\d{2,3}\s*[\s/\-,]\s*\d{2,3}\b",
    r"\b\d{2,3}\s*(?:/|over|\-|,)\s*\d{2,3}\s*(?:mmhg)?\b",
    r"\b\d{2,3}\s*[/,]\s*\d{2,3}\s*(?:mmhg)?\b",
    # Temperature 98.6 F / 37 C / temp 101
    r"\b(?:temp(?:erature)?)\s*(?:is|of|:)?\s*\d{2,3}(?:\.\d+)?\s*(?:°?\s?[fc]|degrees?)?\b",
    r"\b\d{2,3}(?:\.\d+)?\s*°?\s?(?:f|c|fahrenheit|celsius)\b",
    # Pulse / heart rate 72 bpm
    r"\b(?:pulse|heart rate|hr)\s*(?:is|of|:)?\s*\d{2,3}\s*(?:bpm)?\b",
    r"\b\d{2,3}\s*bpm\b",
    # SpO2 / oxygen saturation 98%
    r"\b(?:spo2|oxygen saturation|o2 sat)\s*(?:is|of|:)?\s*\d{2,3}\s*%?\b",
    # Weight / height
    r"\b(?:weight|wt)\s*(?:is|of|:)?\s*\d{2,3}(?:\.\d+)?\s*(?:kg|kgs|pounds|lbs)?\b",
    r"\b(?:height|ht)\s*(?:is|of|:)?\s*\d{2,3}(?:\.\d+)?\s*(?:cm|m|ft|feet)?\b",
    # Blood sugar / glucose
    r"\b(?:blood sugar|glucose|sugar|hba1c)\s*(?:is|of|:)?\s*\d{2,3}(?:\.\d+)?\s*(?:mg/dl|%)?\b",
]


def _dedupe_spans(entities):
    """Drop entities fully contained inside a longer entity of the same span."""
    entities = sorted(entities, key=lambda e: (e["start"], -(e["end"] - e["start"])))
    kept = []
    for ent in entities:
        overlap = False
        for k in kept:
            if ent["start"] >= k["start"] and ent["end"] <= k["end"]:
                overlap = True
                break
        if not overlap:
            kept.append(ent)
    return sorted(kept, key=lambda e: e["start"])


def _fuzzy_drug_match(word, cutoff=0.65):
    """Return the canonical drug name if `word` closely matches one, else None."""
    if len(word) < 3:
        return None
    matches = get_close_matches(word, DRUGS, n=1, cutoff=cutoff)
    return matches[0] if matches else None


def _fuzzy_disease_match(word):
    """Return the canonical disease name if `word` closely matches one, else None."""
    word_lower = word.lower()
    misspellings = {
        "deibitis": "diabetes",
        "dibetes": "diabetes",
        "diabete": "diabetes",
        "diabites": "diabetes",
        "daibetes": "diabetes",
        "deabetes": "diabetes",
        "deabetis": "diabetes",
        "diabeteas": "diabetes",
        "hypertention": "hypertension",
        "hipertension": "hypertension",
        "hypertenshun": "hypertension",
        "pneumona": "pneumonia",
        "numonia": "pneumonia",
        "pnumonia": "pneumonia",
        "migrain": "migraine",
        "migran": "migraine",
        "astma": "asthma",
        "ashtma": "asthma",
        "feverish": "fever",
        "feever": "fever",
        "kof": "cough",
        "cogh": "cough",
    }
    if word_lower in misspellings:
        return misspellings[word_lower]

    if len(word_lower) >= 5:
        matches = get_close_matches(word_lower, DISEASE_WORDS, n=1, cutoff=0.75)
        if matches:
            candidate = matches[0]
            if abs(len(word_lower) - len(candidate)) <= 2:
                return candidate
    return None


def rule_based_ner(text):
    """Deterministic gazetteer + regex extractor. Always available."""
    entities = []
    low = text.lower()
    matched_spans = set()

    # Diseases — phrases first, then single words on token boundaries.
    for phrase in DISEASE_PHRASES:
        for m in re.finditer(r"\b" + re.escape(phrase) + r"\b", low):
            entities.append(_ent(text, m.start(), m.end(), "DISEASE"))
            matched_spans.add((m.start(), m.end()))
    for word in DISEASE_WORDS:
        for m in re.finditer(r"\b" + re.escape(word) + r"\b", low):
            if any(m.start() >= s and m.end() <= e for s, e in matched_spans):
                continue
            entities.append(_ent(text, m.start(), m.end(), "DISEASE"))
            matched_spans.add((m.start(), m.end()))

    # Drugs — exact match first
    for drug in DRUGS:
        for m in re.finditer(r"\b" + re.escape(drug) + r"\b", low):
            if any(m.start() >= s and m.end() <= e for s, e in matched_spans):
                continue
            entities.append(_ent(text, m.start(), m.end(), "DRUG"))
            matched_spans.add((m.start(), m.end()))

    # Drugs — fuzzy match for Whisper misspellings (e.g. "Amlldopin" → amlodipine)
    for m in re.finditer(r"\b([a-z]{4,})\b", low):
        if any(m.start() >= s and m.end() <= e for s, e in matched_spans):
            continue
        canonical = _fuzzy_drug_match(m.group(1))
        if canonical:
            entities.append({"text": canonical, "label": "DRUG",
                             "start": m.start(), "end": m.end()})
            matched_spans.add((m.start(), m.end()))

    # Diseases — fuzzy match for Whisper misspellings (e.g. "deibitis" → diabetes)
    for m in re.finditer(r"\b([a-z]{4,})\b", low):
        if any(m.start() >= s and m.end() <= e for s, e in matched_spans):
            continue
        canonical = _fuzzy_disease_match(m.group(1))
        if canonical:
            entities.append({"text": canonical, "label": "DISEASE",
                             "start": m.start(), "end": m.end()})
            matched_spans.add((m.start(), m.end()))

    # Doses
    for pat in DOSE_PATTERNS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            entities.append(_ent(text, m.start(), m.end(), "DOSE"))

    # Vitals
    for pat in VITAL_PATTERNS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            entities.append(_ent(text, m.start(), m.end(), "VITAL"))

    return _dedupe_spans(entities)


def _ent(text, start, end, label):
    return {"text": text[start:end].strip(), "label": label, "start": start, "end": end}


# ---------------------------------------------------------------------------
# Optional SciSpaCy backend
# ---------------------------------------------------------------------------

_scispacy_nlp = None
_scispacy_tried = False


def _load_scispacy():
    global _scispacy_nlp, _scispacy_tried
    if _scispacy_tried:
        return _scispacy_nlp
    _scispacy_tried = True
    try:
        import spacy  # noqa
        for model in ("en_core_sci_md", "en_core_sci_sm", "en_ner_bc5cdr_md"):
            try:
                _scispacy_nlp = spacy.load(model)
                print(f"[NER] Loaded SciSpaCy model: {model}")
                return _scispacy_nlp
            except Exception:
                continue
        print("[NER] SciSpaCy installed but no biomedical model found; using rule-based NER.")
    except Exception:
        print("[NER] SciSpaCy not available; using rule-based NER fallback.")
    return None


def scispacy_ner(text):
    nlp = _load_scispacy()
    if nlp is None:
        return None
    doc = nlp(text)
    entities = []
    for ent in doc.ents:
        label = ent.label_.upper()
        # Map common biomedical labels to our 4 buckets.
        if label in ("CHEMICAL", "DRUG", "SIMPLE_CHEMICAL"):
            mapped = "DRUG"
        elif label in ("DISEASE", "DISORDER", "PROBLEM", "SYMPTOM", "ENTITY"):
            mapped = "DISEASE"
        else:
            mapped = "DISEASE"
        entities.append(_ent(text, ent.start_char, ent.end_char, mapped))
    # SciSpaCy doesn't reliably catch doses/vitals → enrich with regex rules.
    for pat in DOSE_PATTERNS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            entities.append(_ent(text, m.start(), m.end(), "DOSE"))
    for pat in VITAL_PATTERNS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            entities.append(_ent(text, m.start(), m.end(), "VITAL"))
    return _dedupe_spans(entities)


def extract_entities(text):
    """Public entrypoint. Returns dict with entities list + grouped buckets."""
    if not text or not text.strip():
        return {"entities": [], "diseases": [], "drugs": [], "doses": [], "vitals": [], "backend": "none"}

    backend = "scispacy"
    entities = scispacy_ner(text)
    if entities is None:
        entities = rule_based_ner(text)
        backend = "rule-based"

    grouped = {"DISEASE": [], "DRUG": [], "DOSE": [], "VITAL": []}
    for e in entities:
        grouped.setdefault(e["label"], []).append(e["text"])

    # de-dupe text values while preserving order
    def uniq(seq):
        seen, out = set(), []
        for s in seq:
            k = s.lower()
            if k not in seen:
                seen.add(k)
                out.append(s)
        return out

    return {
        "entities": entities,
        "diseases": uniq(grouped["DISEASE"]),
        "drugs": uniq(grouped["DRUG"]),
        "doses": uniq(grouped["DOSE"]),
        "vitals": uniq(grouped["VITAL"]),
        "backend": backend,
    }


if __name__ == "__main__":
    sample = (
        "Patient diagnosed with type 2 diabetes and hypertension. "
        "Prescribed metformin 500 mg twice daily and amlodipine 5 mg. "
        "BP 140/90, temperature 99 F, pulse 88 bpm."
    )
    import json
    print(json.dumps(extract_entities(sample), indent=2))
