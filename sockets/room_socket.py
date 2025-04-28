import uuid
from flask import request
from flask_socketio import emit, join_room, leave_room
from threading import Timer
from Database import RoomCollection, UserInfo

from sockets.game_logic import start_game_for_room, handle_take_card, handle_send_cards, handle_win_game, room_decks

#map {sid: {user_id, room_id}, ...}
users_in_room = {}
ready_status = {}  # {room_id: {user_id: True/False}}
disconnect_timers = {}  # {sid: Timer}



# map {sid: {user_id, room_id}, ...}

def register_room_handlers(socketio):
    #print("register_room_handlers called")

    @socketio.on("connect")
    def handle_connect():
        print(f"Client connected: {request.sid}")

    @socketio.on("disconnect")
    def handle_disconnect():
        #print(f"Client disconnected: {request.sid}")
        user_info = users_in_room.get(request.sid)

        if not user_info:
            return

        user_id = user_info["user_id"]
        room_id = user_info["room_id"]

        def finalize_disconnect():
            # Get fresh room data to avoid stale state
            room = RoomCollection.find_one({"room_id": room_id})
            if not room:
                # Cleanup if room doesn't exist anymore
                users_in_room.pop(request.sid, None)
                disconnect_timers.pop(request.sid, None)
                return

            # Check if user is still in the room (might have been removed by another event)
            if user_id not in room.get("players", []):
                users_in_room.pop(request.sid, None)
                disconnect_timers.pop(request.sid, None)
                return

            # Always keep player in room if game is active
            if room.get("game_active", False):
                #print(f"[Timeout Protect] {user_id} remains in active game {room_id}")

                # Ensure user stays in users_in_room for potential reconnect
                if request.sid not in users_in_room:
                    users_in_room[request.sid] = {"user_id": user_id, "room_id": room_id}

                disconnect_timers.pop(request.sid, None)

                # Notify others the player is temporarily disconnected
                emit("player_disconnected", {
                    "user_id": user_id,
                    "room_id": room_id
                }, room=room_id, include_self=False)
                return

            # === Only proceed with removal if game is NOT active ===
            # Clean up user from tracking
            users_in_room.pop(request.sid, None)
            disconnect_timers.pop(request.sid, None)

            # Remove from database if still present
            RoomCollection.update_one(
                {"room_id": room_id},
                {"$pull": {"players": user_id}}
            )

            # Get fresh room data after update
            updated_room = RoomCollection.find_one({"room_id": room_id})
            if not updated_room:
                return

            remaining_players = updated_room.get("players", [])

            # Clean up empty rooms
            if len(remaining_players) == 0:
                result = RoomCollection.delete_one({"room_id": room_id, "players": []})
                if result.deleted_count > 0:
                    emit("room_deleted", {"room_id": room_id}, broadcast=True)
                    emit("all_rooms", list(RoomCollection.find({}, {"_id": 0})), broadcast=True)
                return

            # Only notify if user was actually removed
            if user_id not in remaining_players:
                # Clean up ready status
                if room_id in ready_status and user_id in ready_status[room_id]:
                    ready_status[room_id].pop(user_id)

                user_map = {
                    pid: {
                        "username": user.get("username", f"User {pid[:4]}"),
                        "avatar": user.get("ImgUrl", "/static/images/Icon/defaultIcon.png")
                    }
                    for pid in remaining_players
                    if (user := UserInfo.find_one({"user_id": pid}))
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
        #print(f"[Intentional Leave] SID: {sid}, user_id: {user_id}")

        user_info = users_in_room.pop(sid, None)
        if not user_info:
            return

        room_id = user_info["room_id"]

        timer = disconnect_timers.pop(sid, None)
        if timer:
            timer.cancel()

        room = RoomCollection.find_one({"room_id": room_id})
        if not room:
            return

        if room.get("game_active", False):
            #print(f"[Intentional Leave] {user_id} left during active game {room_id}. Keeping in DB for reconnect.")
            return


        RoomCollection.update_one(
            {"room_id": room_id},
            {"$pull": {"players": user_id}}
        )

        # Update ready status
        if room_id in ready_status and user_id in ready_status[room_id]:
            ready_status[room_id].pop(user_id)

        updated_room = RoomCollection.find_one({"room_id": room_id})
        if updated_room:
            remaining_players = updated_room.get("players", [])

            user_map = {
                pid: {
                    "username": user.get("username", f"User {pid[:4]}"),
                    "avatar": user.get("ImgUrl", "/static/images/Icon/defaultIcon.png")
                }
                for pid in remaining_players
                if (user := UserInfo.find_one({"user_id": pid}))
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

    @socketio.on("join_homepage")  # New handler
    def handle_join_homepage():
        #print(f"Client {request.sid} joined homepage room")
        join_room("homepage")

    @socketio.on("leave_homepage")
    def handle_leave_homepage():
        #print(f"Client {request.sid} left homepage room")
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
            #print(f"create_room event received with data: {data}")
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
            #print(f"Error in create_room: {str(e)}")
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
                # Remove old timer and old sid (BEFORE setting users_in_room)
                for sid, info in list(users_in_room.items()):
                    if info["user_id"] == user_id:
                        old_timer = disconnect_timers.pop(sid, None)
                        if old_timer:
                            old_timer.cancel()
                        users_in_room.pop(sid, None)

                join_room(room_id)
                users_in_room[request.sid] = {"user_id": user_id, "room_id": room_id}

                user_map = {
                    pid: {
                        "username": user.get("username", f"User {pid[:4]}"),
                        "avatar": user.get("ImgUrl", "/static/images/Icon/defaultIcon.png")
                    }
                    for pid in players
                    if (user := UserInfo.find_one({"user_id": pid}))
                }

                emit("joined_room", {
                    "room_id": room["room_id"],
                    "room_name": room["room_name"],
                    "players": players,
                    "user_map": user_map,
                    "game_active": room.get("game_active", False)  # new added for refresh to game start
                }, room=request.sid)

                # Check if the game is active
                if room.get("game_active"):
                    if room_id in room_decks and user_id in room_decks[room_id]:
                        your_hand = room_decks[room_id][user_id]
                        opponent_card_counts = [
                            {"user_id": pid, "count": len(room_decks[room_id][pid])}
                            for pid in players if pid != user_id
                        ]
                        # Send user's most recent hand (deck) when they reconnect
                        emit("game_start", {
                            "your_hand": your_hand,
                            "opponent_card_counts": opponent_card_counts
                        }, room=request.sid)
                return

            # If room is full, prevent joining
            if len(players) >= 3:
                emit("error", {"message": "Room is full"}, room=request.sid)
                return

            RoomCollection.update_one(
                {"room_id": room_id},
                {"$addToSet": {"players": user_id}}
            )

            # Reset ready status
            if room_id not in ready_status:
                ready_status[room_id] = {}
            ready_status[room_id][user_id] = False

            join_room(room_id)
            users_in_room[request.sid] = {"user_id": user_id, "room_id": room_id}

            updated_room = RoomCollection.find_one({"room_id": room_id})
            updated_players = updated_room.get("players", [])
            user_map = {
                pid: {
                    "username": user.get("username", f"User {pid[:4]}"),
                    "avatar": user.get("ImgUrl", "/static/images/Icon/defaultIcon.png")
                }
                for pid in updated_players
                if (user := UserInfo.find_one({"user_id": pid}))
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

            status_list = []
            for pid in updated_players:
                user = UserInfo.find_one({"user_id": pid})
                username = user.get("username", f"User {pid[:4]}") if user else pid
                ready = ready_status.get(room_id, {}).get(pid, False)
                status_list.append({"user_id": pid, "username": username, "isReady": ready})

            emit("update_ready_status", status_list, room=room_id)

        except Exception as e:
            emit("error", {"message": "Failed to join room"}, room=request.sid)

    @socketio.on("player_ready")
    def handle_player_ready(data):
        user_info = users_in_room.get(request.sid)
        if not user_info:
            emit("error", {"message": "User not found"}, room=request.sid)
            return

        user_id = user_info["user_id"]
        room_id = user_info["room_id"]
        is_ready = data.get("ready", False)

        if room_id not in ready_status:
            ready_status[room_id] = {}
        ready_status[room_id][user_id] = is_ready

        # Get current room info
        room = RoomCollection.find_one({"room_id": room_id})
        players = room.get("players", [])

        # Broadcast current readiness to all players in the room
        status_list = []
        for pid in players:
            user = UserInfo.find_one({"user_id": pid})
            username = user.get("username", f"User {pid[:4]}") if user else pid
            ready = ready_status.get(room_id, {}).get(pid, False)
            status_list.append({"user_id": pid, "username": username, "isReady": ready})
            #print("ready")

        if len(players) == 3 and all(ready_status[room_id].get(pid, False) for pid in players):
            room_info = RoomCollection.find_one({"room_id": room_id})
            if room_info and not room_info.get("game_active", False):
                start_game_for_room(socketio, room_id, users_in_room)

        emit("update_ready_status", status_list, room=room_id)

    @socketio.on("get_ready_status")
    def handle_get_ready_status():
        user_info = users_in_room.get(request.sid)
        if not user_info:
            return

        room_id = user_info["room_id"]

        room = RoomCollection.find_one({"room_id": room_id})
        if not room:
            return

        players = room.get("players", [])

        status_list = []
        for pid in players:
            user = UserInfo.find_one({"user_id": pid})
            username = user.get("username", f"User {pid[:4]}") if user else pid
            ready = ready_status.get(room_id, {}).get(pid, False)
            status_list.append({"user_id": pid, "username": username, "isReady": ready})

        emit("update_ready_status", status_list, room=request.sid)

    #new added for game_play
    @socketio.on("take_card")
    def handle_take_card_event(data):
        handle_take_card(socketio, users_in_room, request.sid, data)

    @socketio.on("send_cards")
    def handle_send_cards_event(data):
        handle_send_cards(socketio, users_in_room, request.sid, data)

    @socketio.on("game_win")
    def win_game():
        handle_win_game(socketio, users_in_room, ready_status, request.sid)

    @socketio.on("check_and_cleanup_user")
    def check_and_cleanup_user(data):
        user_id = data.get("user_id")
        if not user_id:
            return

        #unnecessary emit, check if this player is in ghost room
        ghost_room = RoomCollection.find_one({"players": user_id})
        if not ghost_room:
            return

        #When game is active, the user should not be removed from the game
        if ghost_room.get("game_active", False):
            return

        #print(f"[Cleanup] Found ghost user in room {ghost_room['room_id']}")

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
            pid: {
                "username": user.get("username", f"User {pid[:4]}"),
                "avatar": user.get("ImgUrl", "/static/images/Icon/defaultIcon.png")
            }
            for pid in remaining
            if (user := UserInfo.find_one({"user_id": pid}))
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
