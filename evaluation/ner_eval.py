"""
NER evaluation harness for VoiceMed.

Computes precision / recall / F1 of the medical NER pipeline against a
hand-labelled gold set (ner_gold.json), overall and per entity category.
This is the reproducible basis for the paper's NER quality claim.

Matching is span-overlap + label match (a predicted entity counts as correct
if its text overlaps a gold entity of the same category, case-insensitive).

Run:
    cd Voice-based-Medical-Record-Retreival-System_Backend-main
    python evaluation/ner_eval.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from medical_ner import extract_entities  # noqa: E402

GOLD_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ner_gold.json")
LABELS = ["DISEASE", "DRUG", "DOSE", "VITAL"]


def norm(s):
    return "".join(c for c in s.lower() if c.isalnum() or c.isspace()).strip()


def overlaps(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    return na in nb or nb in na or bool(set(na.split()) & set(nb.split()))


def evaluate():
    with open(GOLD_PATH, encoding="utf-8") as f:
        gold = json.load(f)

    counts = {lbl: {"tp": 0, "fp": 0, "fn": 0} for lbl in LABELS}

    for item in gold:
        pred = extract_entities(item["text"])["entities"]
        gold_ents = item["entities"]

        # Match predictions to gold (greedy, one-to-one) within each label.
        for lbl in LABELS:
            g = [e for e in gold_ents if e["label"] == lbl]
            p = [e for e in pred if e["label"] == lbl]
            matched_g = set()
            for pe in p:
                hit = None
                for gi, ge in enumerate(g):
                    if gi in matched_g:
                        continue
                    if overlaps(pe["text"], ge["text"]):
                        hit = gi
                        break
                if hit is not None:
                    matched_g.add(hit)
                    counts[lbl]["tp"] += 1
                else:
                    counts[lbl]["fp"] += 1
            counts[lbl]["fn"] += len(g) - len(matched_g)

    def prf(tp, fp, fn):
        p = tp / (tp + fp) if (tp + fp) else 0.0
        r = tp / (tp + fn) if (tp + fn) else 0.0
        f = 2 * p * r / (p + r) if (p + r) else 0.0
        return p, r, f

    print("=" * 60)
    print(f"VoiceMed Medical NER evaluation ({len(gold)} sentences)")
    print(f"NER backend: {extract_entities('test')['backend']}")
    print("=" * 60)
    print(f"{'Category':<12}{'Prec':>8}{'Recall':>8}{'F1':>8}{'TP':>5}{'FP':>5}{'FN':>5}")
    tot = {"tp": 0, "fp": 0, "fn": 0}
    for lbl in LABELS:
        c = counts[lbl]
        p, r, f = prf(c["tp"], c["fp"], c["fn"])
        print(f"{lbl:<12}{p:>8.2%}{r:>8.2%}{f:>8.2%}{c['tp']:>5}{c['fp']:>5}{c['fn']:>5}")
        for k in tot:
            tot[k] += c[k]
    p, r, f = prf(tot["tp"], tot["fp"], tot["fn"])
    print("-" * 60)
    print(f"{'OVERALL':<12}{p:>8.2%}{r:>8.2%}{f:>8.2%}{tot['tp']:>5}{tot['fp']:>5}{tot['fn']:>5}")
    print("=" * 60)
    return f


if __name__ == "__main__":
    evaluate()
