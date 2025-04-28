import os

from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash, Blueprint
import hashlib

from pymongo.synchronous.database import Database

from Database import UserInfo,MatchHistory
blueprint = Blueprint('profile', __name__, url_prefix="/api/profile")
@blueprint.route("/GetUserInfo",methods = ["GET"])
def GetUserInfo():
    auth_token = request.cookies.get("auth_token")
    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    userinfo = UserInfo.find_one({"auth_token": hash_token}, {"_id": 0,"password":0})  # Exclude _id from response
    print(userinfo)
    return jsonify(userinfo)

@blueprint.route("/ChangeIcon",methods = ["POST"])
def ChangeIcon():
    MIME_TYPES = {
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/png": ".png",
    }

    # Get auth
    auth_token = request.cookies.get("auth_token")
    if not auth_token:
        return jsonify({"error": "Missing auth_token"}), 401

    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    user = UserInfo.find_one({"auth_token": hash_token}, {"_id": 0, "user_id": 1})
    if not user:
        return jsonify({"error": "User not found"}), 403

    # Validate uploaded image
    if "avatar" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image = request.files["avatar"]
    if image.mimetype not in MIME_TYPES:
        return jsonify({"error": "Unsupported file type"}), 415

    ext = MIME_TYPES[image.mimetype]
    user_id = user["user_id"]

    prefix_path = os.path.join("frontend", "static", "images", "Icon")
    os.makedirs(prefix_path, exist_ok=True)

    filename = f"{user_id}{ext}"
    path = os.path.join(prefix_path, filename)
    image.save(path)  # ✅ save file directly

    public_url = f"/static/images/Icon/{filename}"
    UserInfo.update_one({"user_id": user_id}, {"$set": {"ImgUrl": public_url}})
    print(f"Saved icon to {path}")

    return jsonify({"ImgUrl": public_url})

@blueprint.route("/GetMatch", methods=["GET"])
def GetMatch():
    auth_token = request.cookies.get("auth_token")
    if not auth_token:
        return jsonify({"error": "Not authenticated"}), 401

    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    user = UserInfo.find_one({"auth_token": hash_token}, {"_id": 0, "user_id": 1})

    if not user:
        return jsonify({"error": "User not found"}), 404

    userid = user["user_id"]

    # Updated query for nested user_id fields
    match_history = list(MatchHistory.find(
        {
            "$or": [
                {"winner.user_id": userid},
                {"losers.user_id": userid}  # Match any user_id inside the losers array
            ]
        },
        {"_id": 0}
    ))

    return jsonify({"Match": match_history})