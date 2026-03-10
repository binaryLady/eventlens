FROM python:3.11-slim-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "120", "app:app"]
