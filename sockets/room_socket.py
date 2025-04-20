import uuid


from flask import request
from flask_socketio import emit, join_room
from Database import RoomCollection

# from database import rooms


#{room_id : [user_id,...], ...}
# rooms = {}

def register_room_handlers(socketio):

    #backend for create room
    @socketio.on("create_room")
    def create_room(data):
        user_id = data.get("user_id")
        room_name = data.get("room_name", "Untitled Room")

        # if not auth_token:
        #     emit("error", {"message": "Missing authentication token. Please login.", "redirect":"/login"}, room=request.sid)
        #     return

        if not user_id:
            emit("error", {"message": "Missing user_id"})
            return

        room_id = str(uuid.uuid4())
        RoomCollection.insert_one({
            "room_id": room_id,
            "room_name": room_name,
            "players": [user_id]
        })
        join_room(room_id)

        #redirect this user into the game room
        emit("room_created", {
            "room_id": room_id,
            "room_name": room_name,
            "players": [user_id]
        }, room=request.sid)

        #Broadcast to everyone else on homepage
        emit("new_room_broadcast", {
            "room_id": room_id,
            "room_name": room_name,
            "players": [user_id]
        }, broadcast=True, include_self=False)


    #room-list are connected and consistently stayed in connected
    @socketio.on("get_all_rooms")
    def get_all_rooms():
        all_rooms = list(RoomCollection.find({}, {"_id": 0}))

        # room=request.sid --> this message is only send to the client that made this request
        # send back to front_end for event all_rooms
        emit("all_rooms", all_rooms, room=request.sid)