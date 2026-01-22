from flask import Flask, request, jsonify
import whisper
import os

app = Flask(__name__)


model = whisper.load_model("medium")  


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