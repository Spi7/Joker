from flask import Blueprint, request, jsonify

game_blueprint = Blueprint('game', __name__, url_prefix="/api/game")

ready_players = set()

@game_blueprint.route("/ready", methods=["POST"])
def set_ready():
    user_id = request.json.get("user_id")
    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400
    ready_players.add(user_id)
    return jsonify({"status": "ok", "ready_players": list(ready_players)})