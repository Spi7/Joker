import random
import uuid
from flask import request
from flask_socketio import emit, join_room, leave_room
from Database import RoomCollection, UserInfo

#map {sid: {user_id, room_id}, ...}
users_in_room = {}
ready_status = {}  # {room_id: {user_id: True/False}}

def create_deck():
    suits = ['♠', '♥', '♦', '♣']
    ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    deck = [f"{rank}{suit}" for suit in suits for rank in ranks]
    deck += ['JOKER1', 'JOKER2']
    random.shuffle(deck)
    return deck

# map {sid: {user_id, room_id}, ...}
def register_room_handlers(socketio):
    print("register_room_handlers called")

    @socketio.on("connect")
    def handle_connect():
        print(f"Client connected: {request.sid}")

    @socketio.on("disconnect")
    def handle_disconnect():
        print(f"Client disconnected: {request.sid}")
        user_info = users_in_room.pop(request.sid, None)

        if not user_info:
            return

        user_id = user_info["user_id"]
        room_id = user_info["room_id"]

        RoomCollection.update_one(
            {"room_id": room_id},
            {"$pull": {"players": user_id}}
        )

        updated_room = RoomCollection.find_one({"room_id": room_id})
        if not updated_room:
            return

        # ✅ Build user_map safely
        user_map = build_user_map(updated_room.get("players", []))
        remaining_players = updated_room.get("players", [])

        if len(remaining_players) == 0:
            # prevent race condition
            result = RoomCollection.delete_one({"room_id": room_id, "players": []})

            if result.deleted_count > 0:
                emit("room_deleted", {"room_id": room_id}, broadcast=True)

                # Emit updated room list to all clients
                all_rooms = list(RoomCollection.find({}, {"_id": 0}))
                emit("all_rooms", all_rooms, broadcast=True)
            return

        # Build user_map safely
        user_map = {}
        for pid in updated_room.get("players", []):
            try:
                user = UserInfo.find_one({"user_id": pid})
                if user and "username" in user:
                    user_map[pid] = user["username"]
                else:
                    user_map[pid] = f"User {pid[:4]}"
            except Exception as e:
                print(f"Error fetching user for ID {pid}: {e}")
                user_map[pid] = f"User {pid[:4]}"

        emit("player_left", {
            "room_id": room_id,
            "user_id": user_id,
            "players": updated_room["players"],
            "user_map": user_map
        }, room=room_id)

        emit("room_updated", {
            "room_id": room_id,
            "room_name": updated_room["room_name"],
            "players": updated_room["players"]
        }, room="homepage")  # Changed from broadcast=True to room="homepage"

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

    @socketio.on("join_homepage")  # New handler
    def handle_join_homepage():
        print(f"Client {request.sid} joined homepage room")
        join_room("homepage")

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
                join_room(room_id)
                users_in_room[request.sid] = {
                    "user_id": user_id,
                    "room_id": room_id
                }

                # build user_map even if already in room
                user_map = build_user_map(players)

                emit("joined_room", {
                    "room_id": room["room_id"],
                    "room_name": room["room_name"],
                    "players": players,
                    "user_map": user_map
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
            users_in_room[request.sid] = {
                "user_id": user_id,
                "room_id": room_id
            }

            # Get updated room data
            updated_room = RoomCollection.find_one({"room_id": room_id})
            updated_players = updated_room.get("players", [])

            # 👇 Build user_map dynamically
            user_map = build_user_map(players)

            # Send confirmation to joining user
            emit("joined_room", {
                "room_id": updated_room["room_id"],
                "room_name": updated_room["room_name"],
                "players": updated_room["players"],
                "user_map": user_map
            }, room=request.sid)

            # Notify other room members
            emit("player_joined", {
                "room_id": room_id,
                "user_id": user_id,
                "username": username,
                "players": updated_room["players"],
                "user_map": user_map
            }, room=room_id, include_self=False)

            # Notify homepage clients on increase player count
            emit("room_updated", {
                "room_id": updated_room["room_id"],
                "room_name": updated_room["room_name"],
                "players": updated_room["players"]
            }, room="homepage")  # Changed from broadcast=True to room="homepage"

        except Exception as e:
            print(f"Error in handle_join_room: {str(e)}")
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
            print("ready")

        if len(players) == 3 and all(ready_status[room_id].get(pid, False) for pid in players):
            print(f"All players ready in room {room_id}. Starting game...")
            start_game_for_room(room_id)

        emit("update_ready_status", status_list, room=room_id)


    # If all 3 players are ready, start game
    def give_base_cards_to(room_id, user_id):
        room = RoomCollection.find_one({"room_id": room_id})
        if not room:
            return

        base_cards = room.get("base_cards", [])
        hands = room.get("hands", {})

        hands[user_id].extend(base_cards)

        RoomCollection.update_one(
            {"room_id": room_id},
            {"$set": {
                "hands": hands,
                "base_cards": [],
                "call_status": {},
                "call_confirm_index": None,
                "call_confirm_order": []
            }}
        )

        emit("base_cards_assigned", {
            "user_id": user_id,
            "cards": base_cards
        }, room=room_id)

    def start_game_for_room(room_id):
        deck = create_deck()  # 54 cards including jokers
        room = RoomCollection.find_one({"room_id": room_id})
        if not room:
            return

        players = room.get("players", [])
        if len(players) != 3:
            return

        hands = {pid: [] for pid in players}
        for i, card in enumerate(deck):
            pid = players[i % 3]
            hands[pid].append(card)

        RoomCollection.update_one(
            {"room_id": room_id},
            {"$set": {
                "game_active": True,
                "hands": hands
            }}
        )

        # Send each player their hand + opponent card counts
        for sid, info in users_in_room.items():
            if info["room_id"] != room_id:
                continue

            user_id = info["user_id"]
            emit("game_start", {
                "your_hand": hands[user_id],
                "opponent_card_counts": [
                    {"user_id": pid, "count": len(hands[pid])}
                    for pid in players if pid != user_id
                ]
            }, room=sid)
    @socketio.on("leave_homepage")
    def handle_leave_homepage():
        print(f"Client {request.sid} left homepage room")
        leave_room("homepage")

    @socketio.on("take_card")
    def handle_take_card(data):
        user_info = users_in_room.get(request.sid)
        if not user_info:
            emit("error", {"message": "User not found"})
            return

        user_id = user_info["user_id"]
        room_id = user_info["room_id"]
        target_user_id = data.get("target_user_id")

        room = RoomCollection.find_one({"room_id": room_id})
        if not room or not room.get("hands"):
            emit("error", {"message": "Game state not found"})
            return

        hands = room["hands"]
        if target_user_id not in hands or not hands[target_user_id]:
            emit("error", {"message": "Target player has no cards"})
            return

        # Take random card
        import random
        taken_card = random.choice(hands[target_user_id])
        hands[target_user_id].remove(taken_card)
        hands[user_id].append(taken_card)

        RoomCollection.update_one({"room_id": room_id}, {"$set": {"hands": hands}})

        # Notify all players
        emit("card_taken", {
            "from_user_id": target_user_id,
            "to_user_id": user_id,
            "card_count": len(hands[target_user_id]),
            "taken_card": taken_card
        }, room=room_id)

def build_user_map(player_ids):
    user_map = {}
    for pid in player_ids:
        user = UserInfo.find_one({"user_id": pid})
        user_map[pid] = {
            "username": user.get("username", f"User {pid[:4]}") if user else f"User {pid[:4]}",
            "avatar": user.get("ImgUrl", "/static/images/Icon/defaultIcon.png") if user else "/static/images/Icon/defaultIcon.png"
        }
    return user_map

    # leave the homepage room
