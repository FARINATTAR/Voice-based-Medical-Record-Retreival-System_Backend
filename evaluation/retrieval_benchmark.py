"""
Retrieval benchmark for VoiceMed voice search.

Reproduces the *system-side* component of the paper's retrieval study. It:
  1. Builds a synthetic corpus of medical records (with NER-extracted tokens),
  2. Runs a set of natural-language queries with known relevant records,
  3. Measures Precision@k / Recall@k / MRR and average retrieval latency,
     mirroring the production search (token index over NER entities).

The paper's headline "12 minutes -> 40 seconds" is an end-to-end *human*
user-study figure (manual folder search vs speak-a-query). This script
isolates and reports the automated retrieval portion so the pipeline's speed
and quality are reproducible.

Run:  python evaluation/retrieval_benchmark.py
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from medical_ner import extract_entities  # noqa: E402

# (record_text) -> the corpus. id is the index.
CORPUS = [
    "Type 2 diabetes, prescribed metformin 500 mg twice daily.",
    "Hypertension follow-up, amlodipine 5 mg, BP 140/90.",
    "Viral fever and cough, paracetamol 650 mg advised.",
    "Pneumonia diagnosed, azithromycin 500 mg for 5 days.",
    "Asthma exacerbation, salbutamol inhaler prescribed.",
    "Chest pain evaluation, ECG done, atorvastatin 10 mg started.",
    "Recurrent UTI, ciprofloxacin 500 mg twice daily.",
    "Migraine, naproxen prescribed, rest advised.",
    "Hypothyroidism, levothyroxine 50 mcg once daily.",
    "Gastritis, omeprazole 20 mg before breakfast.",
    "Dengue suspected, platelet monitoring, fluids advised.",
    "Diabetes with neuropathy, insulin and gabapentin 300 mg.",
    "Tuberculosis, started on ATT, weight 52 kg.",
    "Arthritis, ibuprofen 400 mg thrice daily.",
    "Typhoid, ceftriaxone 1 g IV daily.",
]

# query -> set of relevant record ids (ground truth)
QUERIES = [
    ("show diabetes records", {0, 11}),
    ("find patients on metformin", {0}),
    ("hypertension reports", {1}),
    ("fever and cough", {2}),
    ("pneumonia cases", {3}),
    ("asthma patients", {4}),
    ("who is on atorvastatin", {5}),
    ("urinary tract infection", {6}),
    ("migraine records", {7}),
    ("thyroid patients", {8}),
    ("gastritis treatment", {9}),
    ("dengue cases", {10}),
    ("insulin patients", {11}),
    ("tuberculosis records", {12}),
    ("arthritis ibuprofen", {13}),
]

K = 5


def build_index():
    index = []
    for text in CORPUS:
        ents = extract_entities(text)
        tokens = set()
        for bucket in ("diseases", "drugs", "doses", "vitals"):
            for e in ents[bucket]:
                for t in e.lower().split():
                    if len(t) > 1:
                        tokens.add(t)
        for t in text.lower().replace(',', ' ').replace('.', ' ').split():
            if len(t) > 1:
                tokens.add(t)
        index.append(tokens)
    return index


def search(query, index):
    qtokens = {t for t in query.lower().split() if len(t) > 1}
    scored = []
    for rid, tokens in enumerate(index):
        score = len(qtokens & tokens)
        if score > 0:
            scored.append((score, rid))
    scored.sort(reverse=True)
    return [rid for _, rid in scored]


def run():
    index = build_index()

    p_at_1, r_at_k, rr, success_at_k = [], [], [], []
    latencies = []

    for query, relevant in QUERIES:
        t0 = time.perf_counter()
        ranked = search(query, index)
        latencies.append((time.perf_counter() - t0) * 1000)

        # Precision@1 = is the top result relevant?
        p_at_1.append(1.0 if ranked and ranked[0] in relevant else 0.0)

        topk = ranked[:K]
        hits = len(set(topk) & relevant)
        r_at_k.append(hits / len(relevant) if relevant else 0)
        # Success@k = at least one relevant result in top-k
        success_at_k.append(1.0 if hits > 0 else 0.0)

        # reciprocal rank of first relevant result
        rrv = 0.0
        for rank, rid in enumerate(ranked, start=1):
            if rid in relevant:
                rrv = 1.0 / rank
                break
        rr.append(rrv)

    n = len(QUERIES)
    print("=" * 56)
    print(f"VoiceMed retrieval benchmark ({len(CORPUS)} records, {n} queries)")
    print(f"NER backend: {extract_entities('test')['backend']}")
    print("=" * 56)
    print(f"Precision@1   : {sum(p_at_1)/n:.2%}  (top result relevant)")
    print(f"Success@{K}    : {sum(success_at_k)/n:.2%}  (relevant in top {K})")
    print(f"Recall@{K}     : {sum(r_at_k)/n:.2%}")
    print(f"MRR           : {sum(rr)/n:.3f}")
    print(f"Avg retrieval latency : {sum(latencies)/n:.3f} ms")
    print("=" * 56)


if __name__ == "__main__":
    run()
