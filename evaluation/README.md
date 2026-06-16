# VoiceMed — Evaluation Harness

Reproducible scripts that back the quantitative claims in the paper
*"VoiceMed: A Multilingual Voice-First EHR Platform with Medical NER,
Blockchain Audit Trails, and Cross-Institutional Record Unification"* (INDIACom 2026).

| Script | Backs paper claim | How to run |
|--------|-------------------|-----------|
| `ner_eval.py` | "NER pipeline achieved 89% F1 on clinical entities" | `python evaluation/ner_eval.py` |
| `tamper_test.mjs` | "audit chain identified every single one of our 50 simulated tampering attempts" | `node evaluation/tamper_test.mjs` |
| `retrieval_benchmark.py` | "voice-based record lookup reduced retrieval time" (system-side portion) | `python evaluation/retrieval_benchmark.py` |

Run all three from the backend root
(`Voice-based-Medical-Record-Retreival-System_Backend-main`).

---

## 1. NER F1 — `ner_eval.py`

Evaluates the medical NER pipeline (`medical_ner.py`) on a hand-labelled gold
set (`ner_gold.json`, 30 clinical sentences, 4 entity categories: DISEASE,
DRUG, DOSE, VITAL). Reports precision / recall / F1 overall and per category
using span-overlap + label matching.

**Note on the backend.** If SciSpaCy + a biomedical model are installed, the
pipeline uses them; otherwise it falls back to the built-in rule-based
extractor (the line `NER backend: ...` tells you which ran). The paper's 89% F1
was measured with SciSpaCy on a broader clinical set. On this curated gold set
the rule-based fallback scores higher (it covers the gazetteer well) — the
harness is what matters: swap in your own labelled clinical data to reproduce
the exact paper conditions.

## 2. Tampering detection — `tamper_test.mjs`

Builds a 60-block audit hash chain with the **same SHA-256 algorithm as
`utils/audit.js`**, then runs 50 independent tampering attempts (each mutates a
random field of a random block, as a DB-level attacker would) and verifies that
the integrity check catches all of them.

Expected output: `Detected: 50/50` → `RESULT: PASS`.

## 3. Retrieval benchmark — `retrieval_benchmark.py`

Isolates the **automated** part of the retrieval study: builds a synthetic
record corpus, indexes it via the NER token pipeline (same approach as the
production `searchIndex`), runs natural-language queries with known ground
truth, and reports Precision@1, Success@5, Recall@5, MRR and average retrieval
latency.

The paper's headline **"12 minutes → 40 seconds"** is an end-to-end *human*
user-study number (manual record hunting vs speaking a query, 15 participants).
That requires the full stack + participants and is not reproducible from a
script; this benchmark reports the machine retrieval component that makes the
40-second figure possible (sub-millisecond search + Whisper transcription time).

---

## Honesty notes (keep these in mind when writing the paper)

- The rule-based NER is a strong baseline but is **not** SciSpaCy; for the
  paper's exact 89% figure, install SciSpaCy and re-run on clinical data.
- The retrieval numbers are on a small synthetic set; report them as a
  controlled benchmark, not production-scale results.
- The "12 min → 40 s" and "15 participants" figures come from the user study
  described in the paper — keep the study notes/data with the paper.
