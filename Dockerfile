FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV DOCKER_DB=true
ENV FLASK_APP=app.py
ENV SECRET_KEY=change_this_in_production

CMD ["python", "app.py"]
