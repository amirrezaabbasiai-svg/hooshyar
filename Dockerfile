FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# app + data + storage core (hooshyar_questions.py is REQUIRED by the backend import)
COPY hooshyar_backend.py hooshyar_db.py hooshyar_questions.py hooshyar-prototype.html ./
# dev fallback when HOOSHYAR_DSN is unset: SQLite file on this volume
ENV HOOSHYAR_DB=/data/hooshyar.db
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uvicorn", "hooshyar_backend:app", "--host", "0.0.0.0", "--port", "8000"]
