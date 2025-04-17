from flask import Flask, request, jsonify
from flask import Flask, request, jsonify, render_template
import logging
from logging.handlers import RotatingFileHandler
import os

app = Flask(__name__)

# 日志配置（写入 logs/app.log）
if not os.path.exists("logs"):
    os.makedirs("logs")

log_path = "logs/app.log"
file_handler = RotatingFileHandler(log_path, maxBytes=1000000, backupCount=3)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(levelname)s - %(message)s"
))
app.logger.setLevel(logging.INFO)
app.logger.addHandler(file_handler)

@app.route("/ping")
def ping():
    client_ip = request.remote_addr
    method = request.method
    path = request.path
    app.logger.info(f"Request: {client_ip} {method} {path}")
    return jsonify({"message": "pong from 312Joker backend!"})

@app.route("/homepage")
def homepage():
    return render_template("homepage.html", rooms=[])

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)