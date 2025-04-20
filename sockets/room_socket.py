import uuid
from flask import request
from flask_socketio import emit, join_room
from Database import RoomCollection, UserInfo


def register_room_handlers(socketio):
    print("register_room_handlers called")

    @socketio.on("connect")
    def handle_connect():
        print(f"Client connected: {request.sid}")

    @socketio.on("disconnect")
    def handle_disconnect():
        print(f"Client disconnected: {request.sid}")

    @socketio.on("create_room")
    def create_room(data):
        try:
            print(f"create_room event received with data: {data}")
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
            print(f"Error in create_room: {str(e)}")
            emit("error", {"message": "Failed to create room"}, room=request.sid)

    @socketio.on("get_all_rooms")
    def get_all_rooms():
        try:
            all_rooms = list(RoomCollection.find({}, {"_id": 0}))
            emit("all_rooms", all_rooms, room=request.sid)
        except Exception as e:
            emit("error", {"message": "Failed to fetch rooms"}, room=request.sid)

    @socketio.on("join_room")
    def handle_join_room(user_data):
        try:
            # Validate input data
            if not isinstance(user_data, dict):
                emit("error", {"message": "Invalid data format"}, room=request.sid)
                return

            user_id = user_data.get("user_id")
            username = user_data.get("username")
            room_id = user_data.get("room_id")

            if not all([user_id, username, room_id]):
                emit("error", {"message": "Missing required fields", "redirect": "/login"}, room=request.sid)
                return

            # Check if room exists
            room = RoomCollection.find_one({"room_id": room_id})
            if not room:
                emit("error", {"message": "Room not found", "redirect": "/homepage"}, room=request.sid)
                return

            players = room.get("players", [])

            # Check if user already in room
            if user_id in players:
                emit("joined_room", {
                    "room_id": room["room_id"],
                    "room_name": room["room_name"]
                }, room=request.sid)
                return

            # Check if room is full
            if len(players) >= 3:
                emit("error", {"message": "Room is full"}, room=request.sid)
                return

            # Add user to room
            result = RoomCollection.update_one(
                {"room_id": room_id},
                {"$addToSet": {"players": user_id}}
            )

            if result.modified_count == 0:
                emit("error", {"message": "Failed to join room"}, room=request.sid)
                return

            join_room(room_id)

            # Get updated room data
            updated_room = RoomCollection.find_one({"room_id": room_id})

            # Send confirmation to joining user
            emit("joined_room", {
                "room_id": updated_room["room_id"],
                "room_name": updated_room["room_name"],
                "players": updated_room["players"]
            }, room=request.sid)

            # Notify other room members
            emit("player_joined", {
                "room_id": room_id,
                "user_id": user_id,
                "username": username,
                "players": updated_room["players"]
            }, room=room_id, include_self=False)

        except Exception as e:
            print(f"Error in handle_join_room: {str(e)}")
            emit("error", {"message": "Failed to join room"}, room=request.sid)