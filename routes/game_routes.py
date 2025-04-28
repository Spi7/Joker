from flask import Blueprint, request, jsonify
import hashlib
from Database import UserInfo, RoomCollection

game_blueprint = Blueprint('game', __name__, url_prefix="/api/game")

ready_players = set()

@game_blueprint.route("/CheckUserInGame", methods=["GET"])
def check_user_in_game():
    auth_token = request.cookies.get("auth_token")
    if not auth_token:
        return jsonify({"inGame": False}), 401

    hash_token = hashlib.sha256(auth_token.encode()).hexdigest()
    user = UserInfo.find_one({"auth_token": hash_token}, {"_id": 0})
    if not user:
        return jsonify({"inGame": False}), 403

    user_id = user["user_id"]

    # Only check database
    room = RoomCollection.find_one({
        "players": user_id,
        "game_active": True
    })

    return jsonify({
        "inGame": bool(room),
        "room_id": room["room_id"] if room else None,
        "room_name": room["room_name"] if room else None
    })
