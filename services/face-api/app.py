"""EventLens Face Embedding API.

Accepts a base64 image, returns 512-dim InsightFace embedding(s).
Deploy on Railway / Render / Fly.io (needs ~512MB RAM).
@TheTechMargin 2026
"""

import os
import base64
import numpy as np
import cv2  # type: ignore[import-untyped]
from flask import Flask, request, jsonify  # type: ignore[import-untyped]
from flask_cors import CORS  # type: ignore[import-untyped]
from insightface.app import FaceAnalysis  # type: ignore[import-untyped]

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB
ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
CORS(app, origins=ALLOWED_ORIGINS)

# Initialize InsightFace (same model as Colab notebook)
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))

API_SECRET = os.environ.get("API_SECRET", "")


@app.route("/health", methods=["GET"])
def health():
    """Return service health status and model info."""
    return jsonify({"status": "ok", "model": "buffalo_l", "dims": 512})


@app.route("/embed", methods=["POST"])
def embed():
    """Accept a base64 image and return face embeddings."""
    # Optional auth
    if API_SECRET:
        auth = request.headers.get("Authorization", "")
        token = auth.replace("Bearer ", "")
        if token != API_SECRET:
            return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"error": "Missing 'image' (base64)"}), 400

    try:
        img_bytes = base64.b64decode(data["image"])
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({"error": "Invalid image"}), 400

        faces = face_app.get(img)

        if not faces:
            return jsonify({"faces": [], "count": 0})

        results = []
        for i, face in enumerate(faces):
            results.append({
                "index": i,
                "embedding": face.embedding.tolist(),
                "bbox": face.bbox.tolist(),
                "det_score": float(face.det_score),
            })

        return jsonify({"faces": results, "count": len(results)})

    except (ValueError, OSError):
        return jsonify({"error": "Failed to process image"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
