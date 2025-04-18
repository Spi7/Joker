import uuid


from flask import request
from flask_socketio import emit, join_room

# from database import rooms


#{room_id : [user_id,...], ...}
rooms = {}

def register_room_handlers(socketio):
    @socketio.on("create_room")
    def create_room(data):
        user_id = data.get("user_id")
        room_name = data.get("room_name", "Untitled Room")

        if not user_id:
            emit("error", {"message": "Missing user_id"})
            return

        room_id = str(uuid.uuid4())
        rooms[room_id] = [user_id]
        join_room(room_id)

        emit("room_created", {
            "room_id": room_id,
            "room_name": room_name,
            "players": rooms[room_id]
        }, room=request.sid)


    # @socketio.on("get_all_rooms")