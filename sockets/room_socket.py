import uuid
from flask import request
from flask_socketio import emit, join_room, leave_room
from threading import Timer
from Database import RoomCollection, UserInfo

users_in_room = {}  # {sid: {"user_id", "room_id"}}
disconnect_timers = {}  # {sid: Timer}

def register_room_handlers(socketio):
    print("register_room_handlers called")

    @socketio.on("connect")
    def handle_connect():
        print(f"Client connected: {request.sid}")

    @socketio.on("disconnect")
    def handle_disconnect():
        print(f"Client disconnected: {request.sid}")
        user_info = users_in_room.get(request.sid)

        if not user_info:
            return

        user_id = user_info["user_id"]
        room_id = user_info["room_id"]

        def finalize_disconnect():
            print(f"[Timeout] Finalizing disconnect: {request.sid}")
            users_in_room.pop(request.sid, None)
            disconnect_timers.pop(request.sid, None)

            RoomCollection.update_one(
                {"room_id": room_id},
                {"$pull": {"players": user_id}}
            )

            updated_room = RoomCollection.find_one({"room_id": room_id})
            if not updated_room:
                return

            remaining_players = updated_room.get("players", [])
            if user_id not in remaining_players and len(remaining_players) > 0:
                return

            if len(remaining_players) == 0:
                result = RoomCollection.delete_one({"room_id": room_id, "players": []})
                if result.deleted_count > 0:
                    emit("room_deleted", {"room_id": room_id}, broadcast=True)
                    emit("all_rooms", list(RoomCollection.find({}, {"_id": 0})), broadcast=True)
                return

            user_map = {
                pid: UserInfo.find_one({"user_id": pid}).get("username", f"User {pid[:4]}")
                for pid in remaining_players
            }

            emit("player_left", {
                "room_id": room_id,
                "user_id": user_id,
                "players": remaining_players,
                "user_map": user_map
            }, room=room_id)

            emit("room_updated", {
                "room_id": room_id,
                "room_name": updated_room["room_name"],
                "players": remaining_players
            }, room="homepage")

        timer = Timer(5.0, finalize_disconnect)
        timer.start()
        disconnect_timers[request.sid] = timer

    @socketio.on("intentional_leave_room")
    def handle_intentional_leave(data):
        user_id = data.get("user_id")
        sid = request.sid
        print(f"[Intentional Leave] SID: {sid}, user_id: {user_id}")

        user_info = users_in_room.pop(sid, None)
        if not user_info:
            return

        room_id = user_info["room_id"]
        timer = disconnect_timers.pop(sid, None)
        if timer:
            timer.cancel()

        RoomCollection.update_one(
            {"room_id": room_id},
            {"$pull": {"players": user_id}}
        )

        updated_room = RoomCollection.find_one({"room_id": room_id})
        if updated_room:
            remaining_players = updated_room.get("players", [])
            user_map = {
                pid: UserInfo.find_one({"user_id": pid}).get("username", f"User {pid[:4]}")
                for pid in remaining_players
            }

            emit("player_left", {
                "room_id": room_id,
                "user_id": user_id,
                "players": remaining_players,
                "user_map": user_map
            }, room=room_id)

            emit("room_updated", {
                "room_id": room_id,
                "room_name": updated_room["room_name"],
                "players": remaining_players
            }, room="homepage")

            if len(remaining_players) == 0:
                result = RoomCollection.delete_one({"room_id": room_id, "players": []})
                if result.deleted_count > 0:
                    emit("room_deleted", {"room_id": room_id}, broadcast=True)
                    emit("all_rooms", list(RoomCollection.find({}, {"_id": 0})), broadcast=True)

    @socketio.on("join_homepage")
    def handle_join_homepage():
        print(f"Client {request.sid} joined homepage room")
        join_room("homepage")

    @socketio.on("leave_homepage")
    def handle_leave_homepage():
        print(f"Client {request.sid} left homepage room")
        leave_room("homepage")

    @socketio.on("get_all_rooms")
    def get_all_rooms():
        try:
            all_rooms = list(RoomCollection.find({}, {"_id": 0}))
            emit("all_rooms", all_rooms, room=request.sid)
        except Exception as e:
            emit("error", {"message": "Failed to fetch rooms"}, room=request.sid)

    @socketio.on("create_room")
    def create_room(data):
        try:
            user_id = data.get("user_id")
            username = data.get("username")
            room_name = data.get("room_name", "Untitled Room")

            if not user_id:
                emit("error", {"message": "Missing user_id", "redirect": "/login"})
                return

            room_id = str(uuid.uuid4())
            room_data = {
                "room_id": room_id,
                "room_name": room_name,
                "players": [user_id]
            }

            RoomCollection.insert_one(room_data)
            join_room(room_id)

            emit("room_created", {
                "room_id": room_id,
                "room_name": room_name,
                "players": [user_id]
            }, room=request.sid)

            emit("new_room_broadcast", {
                "room_id": room_id,
                "room_name": room_name,
                "players": [user_id]
            }, broadcast=True, include_self=False)

        except Exception as e:
            emit("error", {"message": "Failed to create room"}, room=request.sid)

    @socketio.on("join_room")
    def handle_join_room(user_data):
        try:
            user_id = user_data.get("user_id")
            username = user_data.get("username")
            room_id = user_data.get("room_id")

            room = RoomCollection.find_one({"room_id": room_id})
            if not room:
                emit("error", {"message": "Room not found", "redirect": "/homepage"}, room=request.sid)
                return

            players = room.get("players", [])
            if user_id in players:
                join_room(room_id)
                users_in_room[request.sid] = {"user_id": user_id, "room_id": room_id}

                # remove old timer
                for sid, info in list(users_in_room.items()):
                    if sid != request.sid and info["user_id"] == user_id:
                        old_timer = disconnect_timers.pop(sid, None)
                        if old_timer:
                            old_timer.cancel()
                        users_in_room.pop(sid, None)

                user_map = {
                    pid: UserInfo.find_one({"user_id": pid}).get("username", f"User {pid[:4]}")
                    for pid in players
                }

                emit("joined_room", {
                    "room_id": room["room_id"],
                    "room_name": room["room_name"],
                    "players": players,
                    "user_map": user_map
                }, room=request.sid)
                return

            if len(players) >= 3:
                emit("error", {"message": "Room is full"}, room=request.sid)
                return

            RoomCollection.update_one(
                {"room_id": room_id},
                {"$addToSet": {"players": user_id}}
            )

            join_room(room_id)
            users_in_room[request.sid] = {"user_id": user_id, "room_id": room_id}

            updated_room = RoomCollection.find_one({"room_id": room_id})
            updated_players = updated_room.get("players", [])
            user_map = {
                pid: UserInfo.find_one({"user_id": pid}).get("username", f"User {pid[:4]}")
                for pid in updated_players
            }

            emit("joined_room", {
                "room_id": room_id,
                "room_name": updated_room["room_name"],
                "players": updated_players,
                "user_map": user_map
            }, room=request.sid)

            emit("player_joined", {
                "room_id": room_id,
                "user_id": user_id,
                "username": username,
                "players": updated_players,
                "user_map": user_map
            }, room=room_id, include_self=False)

            emit("room_updated", {
                "room_id": room_id,
                "room_name": updated_room["room_name"],
                "players": updated_players
            }, room="homepage")

        except Exception as e:
            emit("error", {"message": "Failed to join room"}, room=request.sid)

    @socketio.on("check_and_cleanup_user")
    def check_and_cleanup_user(data):
        user_id = data.get("user_id")
        if not user_id:
            return

        #unnecessary emit, check if this player is in ghost room
        ghost_room = RoomCollection.find_one({"players": user_id})
        if not ghost_room:
            return

        print(f"[Cleanup] Found ghost user in room {ghost_room['room_id']}")

        # remove the user from the room, if it's consider as a ghost user
        RoomCollection.update_one(
            {"room_id": ghost_room["room_id"]},
            {"$pull": {"players": user_id}}
        )

        updated_room = RoomCollection.find_one({"room_id": ghost_room["room_id"]})
        if not updated_room:
            return

        remaining = updated_room.get("players", [])
        user_map = {
            pid: UserInfo.find_one({"user_id": pid}).get("username", f"User {pid[:4]}")
            for pid in remaining
        }

        emit("player_left", {
            "room_id": ghost_room["room_id"],
            "user_id": user_id,
            "players": remaining,
            "user_map": user_map
        }, room=ghost_room["room_id"])

        emit("room_updated", {
            "room_id": ghost_room["room_id"],
            "room_name": updated_room["room_name"],
            "players": remaining
        }, room="homepage")

        if len(remaining) == 0:
            RoomCollection.delete_one({"room_id": ghost_room["room_id"], "players": []})
            emit("room_deleted", {"room_id": ghost_room["room_id"]}, broadcast=True)
            emit("all_rooms", list(RoomCollection.find({}, {"_id": 0})), broadcast=True)
