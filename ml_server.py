"""
VoiceMed ML service (Flask, port 5001).

Two responsibilities, matching the paper:
  1. Multilingual speech-to-text with OpenAI Whisper
     (English, Hindi, Tamil, Telugu).
  2. Medical NER (SciSpaCy with rule-based fallback) over the recognised text.

Endpoints
  GET  /health      -> service + model status
  POST /transcribe  -> form-data: audio (file), language (en|hi|ta|te|auto)
                       returns { text, language, translation, entities, ... }
  POST /ner         -> json: { text }  returns extracted medical entities

Whisper is imported lazily so the NER endpoint still works on machines where
torch/whisper are not installed.
"""

import sys
import os
import tempfile

# Reconfigure stdout and stderr to use UTF-8 to prevent encoding crashes on Windows console when printing non-ASCII text
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

from flask import Flask, request, jsonify

try:
    from flask_cors import CORS
    _HAS_CORS = True
except Exception:
    _HAS_CORS = False

from medical_ner import extract_entities

app = Flask(__name__)
if _HAS_CORS:
    CORS(app)

# Languages the paper supports. Whisper codes.
SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
}

WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")

_whisper_model = None
_whisper_error = None


def get_whisper():
    """Load Whisper once, lazily. Returns None if unavailable."""
    global _whisper_model, _whisper_error
    if _whisper_model is not None or _whisper_error is not None:
        return _whisper_model
    try:
        import whisper
        print(f"[Whisper] Loading model '{WHISPER_MODEL_NAME}' (first run downloads it)...")
        _whisper_model = whisper.load_model(WHISPER_MODEL_NAME)
        print("[Whisper] Model ready.")
    except Exception as e:  # torch/whisper missing or load failure
        _whisper_error = str(e)
        print(f"[Whisper] Unavailable: {e}")
    return _whisper_model


@app.route("/health", methods=["GET"])
def health():
    ner = extract_entities("test fever paracetamol 500 mg BP 120/80")
    return jsonify({
        "status": "ok",
        "whisper_model": WHISPER_MODEL_NAME,
        "whisper_loaded": _whisper_model is not None,
        "whisper_error": _whisper_error,
        "ner_backend": ner["backend"],
        "languages": SUPPORTED_LANGUAGES,
    })


@app.route("/ner", methods=["POST"])
def ner():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    return jsonify(extract_entities(text))


@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file", "success": False}), 400

    language = (request.form.get("language") or "en").lower().strip()
    if language not in SUPPORTED_LANGUAGES and language != "auto":
        language = "en"

    model = get_whisper()
    if model is None:
        return jsonify({
            "error": "Whisper not available on this server",
            "details": _whisper_error,
            "success": False,
        }), 503

    audio_file = request.files["audio"]
    suffix = os.path.splitext(audio_file.filename or "")[1] or ".webm"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name
    tmp.close()
    audio_file.save(tmp_path)

    try:
        whisper_kwargs = {
            "task": "transcribe",
            "fp16": False,
            "initial_prompt": (
                "Medical terms: fever, cough, cold, paracetamol, ibuprofen, "
                "aspirin, metformin, diabetes, hypertension, blood pressure, "
                "diagnosis, prescription, mg, tablet."
            ),
        }
        if language != "auto":
            whisper_kwargs["language"] = language

        result = model.transcribe(tmp_path, **whisper_kwargs)
        text = (result.get("text") or "").strip()
        detected = result.get("language", language)

        # For non-English speech we also produce an English translation so the
        # English-trained medical NER can run on it.
        translation = text
        if detected != "en":
            try:
                trans = model.transcribe(tmp_path, task="translate", fp16=False)
                translation = (trans.get("text") or "").strip()
            except Exception as e:
                print(f"[Whisper] translation failed: {e}")

        entities = extract_entities(translation)

        try:
            print(f"[Whisper] ({detected}) {text}")
        except Exception as pe:
            try:
                print(f"[Whisper] ({detected}) [unicode print error: {pe}]")
            except Exception:
                pass
        return jsonify({
            "text": text,
            "language": detected,
            "language_name": SUPPORTED_LANGUAGES.get(detected, detected),
            "translation": translation,
            "entities": entities["entities"],
            "diseases": entities["diseases"],
            "drugs": entities["drugs"],
            "doses": entities["doses"],
            "vitals": entities["vitals"],
            "ner_backend": entities["backend"],
            "success": True,
        })
    except Exception as e:
        try:
            print(f"[Whisper] error: {e}")
        except Exception:
            pass
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == "__main__":
    print("VoiceMed ML service starting on :5001")
    print("Supported languages:", ", ".join(SUPPORTED_LANGUAGES.values()))
    app.run(port=5001, debug=True, use_reloader=False)
