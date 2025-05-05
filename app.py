import hashlib
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_socketio import SocketIO
from logging.handlers import RotatingFileHandler
from Database import UserInfo
from auth import auth_bp, token_required
from routes.users_routes import user_bp
from routes.Profile import blueprint
from routes.game_routes import game_blueprint
from routes.leaderboard_routes import leaderboard_bp
import logging
import os
import traceback  # NEW: Added for error stack traces

app = Flask(__name__, static_folder="frontend/static", template_folder="frontend/templates")

# =======================Start of Logging====================================
if not os.path.exists("logs"):
    os.makedirs("logs")

# Main application log
log_path = "logs/app.log"
file_handler = RotatingFileHandler(log_path, maxBytes=1000000, backupCount=3)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(levelname)s - %(message)s"
))
app.logger.setLevel(logging.INFO)
app.logger.addHandler(file_handler)

# Raw HTTP log (limited to headers and first 2048 bytes)
raw_http_log_path = "logs/raw_http.log"
raw_http_handler = RotatingFileHandler(raw_http_log_path, maxBytes=1000000, backupCount=3)
raw_http_handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(message)s"
))
raw_http_logger = logging.getLogger("raw_http_logger")
raw_http_logger.setLevel(logging.INFO)
raw_http_logger.addHandler(raw_http_handler)
raw_http_logger.propagate = False  # Prevent duplicate logging


@app.before_request
def log_request_info():
    client_ip = request.remote_addr
    method = request.method
    path = request.path

    username = "anonymous"
    auth_token = request.cookies.get("auth_token")
    if auth_token:
        hashed_token = hashlib.sha256(auth_token.encode()).hexdigest()
        user = UserInfo.find_one({"auth_token": hashed_token}, {"username": 1})
        if user:
            username = user["username"]
            request.logged_in_username = username

    app.logger.info(f"Request: {client_ip} {method} {path} by {username}")

    #Enhanced raw HTTP request logging with security and size limits
    safe_headers = {k: v for k, v in request.headers.items()
                    if k.lower() not in ["authorization", "cookie", "auth-token"]}  #Added more sensitive headers

    # Special handling for sensitive routes
    if path in ['/auth/login', '/auth/register']:
        log_message = f"{client_ip} - REQUEST - {method} {path} - HEADERS: {safe_headers}"
    else:
        try:
            content_length = request.content_length or 0
            if content_length > 0 and 'application/json' in request.content_type:
                body = request.get_data(as_text=True)[:2048]  # Limit body size
                log_message = f"{client_ip} - REQUEST - {method} {path} - HEADERS: {safe_headers} - BODY: {body}"
            else:
                log_message = f"{client_ip} - REQUEST - {method} {path} - HEADERS: {safe_headers}"
        except:
            log_message = f"{client_ip} - REQUEST - {method} {path} - HEADERS: {safe_headers}"

    raw_http_logger.info(log_message[:2048])  # Enforce size limit


@app.after_request
def log_response_info(response):
    try:
        client_ip = request.remote_addr
        method = request.method
        path = request.path
        status = response.status_code
        username = getattr(request, "logged_in_username", "anonymous")

        # Log to main app.log
        app.logger.info(f"Response: {client_ip} {method} {path} {status} by {username}")

        # Log to raw HTTP log
        try:
            if response.is_json:
                body = response.get_data(as_text=True)[:2048]
                log_message = f"{client_ip} - RESPONSE - {method} {path} - STATUS: {status} - BODY: {body}"
            else:
                log_message = f"{client_ip} - RESPONSE - {method} {path} - STATUS: {status}"
        except Exception as e:
            log_message = f"{client_ip} - RESPONSE - {method} {path} - STATUS: {status}"

        raw_http_logger.info(log_message[:2048])

        # Force flush the logs immediately
        for handler in app.logger.handlers:
            handler.flush()
        for handler in raw_http_logger.handlers:
            handler.flush()

    except Exception as e:
        app.logger.error(f"Failed to log response: {str(e)}")

    return response

@app.errorhandler(Exception)
def handle_exception(e):
    # Log the full stack trace
    app.logger.error(f"Unhandled exception: {str(e)}\n{traceback.format_exc()}")
    return jsonify({"error": "Internal server error"}), 500

#===================================Blueprint and Auth===========================================
# socketio = SocketIO(app, cors_allowed_origins="*") #INSECURE only for dev stage
#later for production
# socketio = SocketIO(app, cors_allowed_origins=["https://yourdomain.com"])

app.secret_key = os.environ.get('SECRET_KEY') or 'dev_key_only_for_development'
app.register_blueprint(auth_bp)
app.register_blueprint(user_bp)
app.register_blueprint(blueprint)
app.register_blueprint(game_blueprint)
app.register_blueprint(leaderboard_bp)

if os.environ.get("FLASK_ENV") == "production":
    socketio = SocketIO(app, cors_allowed_origins=["https://joker.cse312.dev"])
else:
    socketio = SocketIO(app, cors_allowed_origins="*")

#later for production
# socketio = SocketIO(app, cors_allowed_origins=["https://yourdomain.com"])

#room handles
from sockets.room_socket import register_room_handlers
register_room_handlers(socketio)


#=====================================Routes=======================================
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
    return redirect(url_for("homepage"))

@app.route("/game")
def game():
    room_id = request.args.get("room_id", "UNKNOWN")
    room_name = request.args.get("room_name", "Untitled Room")
    return render_template("game.html", room_id=room_id, room_name=room_name)

@app.route("/homepage")
def homepage():
    return render_template("homepage.html", rooms=[])

@app.route("/profile")
def profile():
    return render_template("Profile.html")

@app.route("/leaderboard")
def leaderboard():
    return render_template("leaderboard.html")



if __name__ == "__main__":
    if os.environ.get("FLASK_ENV") == "development":
        socketio.run(app, host="0.0.0.0", port=8080, allow_unsafe_werkzeug=True)
