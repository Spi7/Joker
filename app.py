from flask import Flask

app = Flask(__name__)

@app.route("/")

# Use python -m pip install -r requirements.txt to get start

def home():
    return "Hello World!"