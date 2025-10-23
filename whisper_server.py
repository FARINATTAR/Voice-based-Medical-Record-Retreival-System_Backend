
# import whisper
# from flask import Flask, request, jsonify
# import os
# import tempfile

# app = Flask(__name__)
# model = whisper.load_model("tiny")  # Tiny model, CPU friendly

# @app.route("/transcribe", methods=["POST"])
# def transcribe_audio():
#     if 'audio' not in request.files:
#         return jsonify({"error": "No file uploaded"}), 400

#     file = request.files['audio']

#     # Save temp file safely
#     with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
#         file.save(tmp.name)
#         file_path = tmp.name

#     try:
#         # Whisper transcription
#         result = model.transcribe(file_path)
#         text = result["text"]
#     except Exception as e:
#         return jsonify({"error": str(e)}), 500
#     finally:
#         # Clean up
#         os.remove(file_path)

#     return jsonify({"text": text})

# if __name__ == "__main__":
#     app.run(port=5001, debug=True)


# from flask import Flask, request, jsonify
# import whisper
# import os

# app = Flask(__name__)
# model = whisper.load_model("base")  # or "small", "medium", "large"

# @app.route('/transcribe', methods=['POST'])
# def transcribe():
#     try:
#         if 'audio' not in request.files:
#             return jsonify({'error': 'No audio file'}), 400
        
#         audio_file = request.files['audio']
#         temp_path = 'temp_audio.webm'
#         audio_file.save(temp_path)
        
#         result = model.transcribe(temp_path)
#         os.remove(temp_path)
        
#         return jsonify({
#             'text': result['text'],
#             'success': True
#         })
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

# if __name__ == '__main__':
#     app.run(port=5001)


from flask import Flask, request, jsonify
import whisper
import os

app = Flask(__name__)

# Use "medium" or "large" model for better accuracy
# "base" is fast but less accurate
model = whisper.load_model("medium")  # 🔥 CHANGED FROM "base"

@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file'}), 400
        
        audio_file = request.files['audio']
        temp_path = 'temp_audio.webm'
        audio_file.save(temp_path)
        
        # Add language hint for better accuracy
        result = model.transcribe(
            temp_path,
            language='en',  # Specify English
            task='transcribe',
            fp16=False,  # Better accuracy
            initial_prompt="Medical terms: cold, fever, paracetamol, ibuprofen, aspirin, diabetes, cough"  # 🔥 Medical context
        )
        
        os.remove(temp_path)
        
        print(f"Transcribed: {result['text']}")  # Debug log
        
        return jsonify({
            'text': result['text'].strip(),
            'success': True
        })
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5001, debug=True)


# from flask import Flask, request, jsonify
# from faster_whisper import WhisperModel  # 🚀 Much faster!
# import os

# app = Flask(__name__)

# # Use GPU if available, else CPU
# model = WhisperModel("medium", device="cpu", compute_type="int8")  # 🔥 Quantized = faster

# @app.route('/transcribe', methods=['POST'])
# def transcribe():
#     try:
#         if 'audio' not in request.files:
#             return jsonify({'error': 'No audio file'}), 400
        
#         audio_file = request.files['audio']
#         temp_path = 'temp_audio.webm'
#         audio_file.save(temp_path)
        
#         # This is 3-4x faster than original Whisper!
#         segments, info = model.transcribe(
#             temp_path,
#             language='en',
#             beam_size=3,
#             vad_filter=True,  # 🔥 Voice Activity Detection = skip silence
#             initial_prompt="Medical terms"
#         )
        
#         # Combine all segments
#         text = " ".join([segment.text for segment in segments])
        
#         os.remove(temp_path)
        
#         return jsonify({
#             'text': text.strip(),
#             'success': True
#         })
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

# if __name__ == '__main__':
#     app.run(port=5001, debug=True)