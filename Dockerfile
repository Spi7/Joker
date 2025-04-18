FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

#Production Version: CMD ["gunicorn", "--bind", "0.0.0.0:8080", "test:app"] --> later use for deployment
#current flask only handle 1 thread a time
CMD ["python", "app.py"]
