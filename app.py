from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_socketio import SocketIO
from logging.handlers import RotatingFileHandler
from auth import auth_bp

import logging
import os

app = Flask(__name__, static_folder="frontend/static", template_folder="frontend/templates")
app.register_blueprint(auth_bp)
app.secret_key = os.environ.get('SECRET_KEY') or 'dev_key_only_for_development'
socketio = SocketIO(app, cors_allowed_origins="*") #INSECURE only for dev stage
#later for production
# socketio = SocketIO(app, cors_allowed_origins=["https://yourdomain.com"])

# (logs/app.log）
if not os.path.exists("logs"):
    os.makedirs("logs")

log_path = "logs/app.log"
file_handler = RotatingFileHandler(log_path, maxBytes=1000000, backupCount=3)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(levelname)s - %(message)s"
))
app.logger.setLevel(logging.INFO)
app.logger.addHandler(file_handler)

#room handles
from sockets.room_socket import register_room_handlers
register_room_handlers(socketio)


@app.route("/ping")
def ping():
    client_ip = request.remote_addr
    method = request.method
    path = request.path
    app.logger.info(f"Request: {client_ip} {method} {path}")
    return jsonify({"message": "pong from 312Joker backend!"})


# Use python -m pip install -r requirements.txt to get start
@app.route("/")
def home():
    if "username" not in session:
        return redirect(url_for("auth.login"))
    return redirect(url_for("homepage"))

@app.route("/game")
def game():
    room_id = request.args.get("room_id", "UNKNOWN")
    room_name = request.args.get("room_name", "Untitled Room")
    return render_template("game.html", room_id=room_id, room_name=room_name)

@app.route("/homepage")
def homepage():
    return render_template("homepage.html", rooms=[])


if __name__ == "__main__":
    # app.run(host="0.0.0.0", port=8080)
    socketio.run(app, host="0.0.0.0", port=8080) #change to socket
