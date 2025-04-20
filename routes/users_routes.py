from flask import Blueprint, jsonify, request
from Database import UserInfo
import hashlib
from datetime import datetime

user_bp = Blueprint("users", __name__, url_prefix="/api/users")

@user_bp.route("/@me", methods=["GET"])
def get_current_user():
    auth_token = request.cookies.get("auth_token")
    if not auth_token:
        return jsonify({"error": "Not authenticated"}), 401

    hashed_token = hashlib.sha256(auth_token.encode()).hexdigest()
    user = UserInfo.find_one({"auth_token": hashed_token})

    if not user:
        return jsonify({"error": "Invalid token"}), 403

    if "token_expire" not in user or datetime.utcnow() > user["token_expire"]:
        return jsonify({"error": "Token expired"}), 401

    return jsonify({
        "username": user["username"],
        "user_id": user["user_id"]
    }), 200
