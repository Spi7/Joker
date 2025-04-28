FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

#Production Version: CMD ["gunicorn", "--bind", "0.0.0.0:8080", "test:app"] --> later use for deployment
#current flask only handle 1 thread a time

ENV DOCKER_DB=true
ENV FLASK_APP=app.py
ENV FLASK_ENV=production

EXPOSE 8080

CMD ["gunicorn", "--worker-class", "eventlet", "-w", "1", "-b", "0.0.0.0:8080", "app:app"]

