from flask import Blueprint, jsonify, render_template
from Database import UserInfo, MatchHistory
from datetime import datetime

leaderboard_bp = Blueprint("leaderboard", __name__, url_prefix="/api/leaderboard")


@leaderboard_bp.route("/rankings", methods=["GET"])
def get_rankings():
    # Get top players by win count
    top_by_wins = list(UserInfo.find(
        {},
        {"_id": 0, "username": 1, "user_id": 1, "matches_won": 1, "matches_played": 1, "ImgUrl": 1}
    ).sort("matches_won", -1).limit(10))

    # Ensure all users have the required fields with defaults
    for user in top_by_wins:
        user["matches_won"] = user.get("matches_won", 0)
        user["matches_played"] = user.get("matches_played", 0)
        user["ImgUrl"] = user.get("ImgUrl", "/static/images/Icon/defaultIcon.png")

    # Calculate win streaks for all users
    all_users = list(UserInfo.find({}, {"_id": 0, "user_id": 1, "username": 1, "ImgUrl": 1}))
    users_with_streaks = []

    for user in all_users:
        user_id = user["user_id"]

        # Get all matches involving this user (either as winner or loser)
        matches = list(MatchHistory.find(
            {"$or": [
                {"winner.user_id": user_id},
                {"losers.user_id": user_id}
            ]}
        ).sort("timestamp", 1))  # Sort by timestamp ascending

        # Calculate max win streak
        max_streak = 0
        current_streak = 0

        for match in matches:
            if match.get("winner", {}).get("user_id") == user_id:
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            else:
                current_streak = 0  # Reset streak on loss

        # Add default ImgUrl if missing
        if "ImgUrl" not in user or not user["ImgUrl"]:
            user["ImgUrl"] = "/static/images/Icon/defaultIcon.png"

        users_with_streaks.append({
            "user_id": user["user_id"],
            "username": user["username"],
            "ImgUrl": user["ImgUrl"],
            "max_win_streak": max_streak,
            "current_streak": current_streak if current_streak > 0 else 0
        })

    # Sort by max win streak
    top_by_streaks = sorted(
        users_with_streaks,
        key=lambda x: x["max_win_streak"],
        reverse=True
    )[:10]

    return jsonify({
        "win_rankings": top_by_wins,
        "streak_rankings": top_by_streaks,
        "last_updated": datetime.utcnow().isoformat()
    })


# Route to render the leaderboard page
@leaderboard_bp.route("/", methods=["GET"])
def leaderboard_page():
    return render_template("leaderboard.html")
