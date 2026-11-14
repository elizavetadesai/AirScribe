# Build from the REPO ROOT so the shared ml/airscribe_ml code is included:
#   docker build -f backend/Dockerfile -t airscribe-api .
#   docker run -p 8000:7860 -e JWT_SECRET=change-me airscribe-api
# Hugging Face Spaces (Docker) uses port 7860; Render sets $PORT itself.
FROM python:3.11-slim

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY ml/airscribe_ml ml/airscribe_ml
COPY backend backend

WORKDIR /app/backend
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
