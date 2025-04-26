from datetime import datetime
import random
import uuid
from flask import request
from flask_socketio import emit, join_room, leave_room
from threading import Timer
from Database import RoomCollection, UserInfo,MatchHistory

#map {sid: {user_id, room_id}, ...}
users_in_room = {}
ready_status = {}  # {room_id: {user_id: True/False}}
disconnect_timers = {}  # {sid: Timer}
decks = {}
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

            user_map = build_user_map(updated_room.get("players", []))


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
            user_map = build_user_map(updated_room.get("players", []))

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


    @socketio.on("join_homepage")  # New handler
    def handle_join_homepage():
        print(f"Client {request.sid} joined homepage room")
        join_room("homepage")

    @socketio.on("join_room")
    def handle_join_room(user_data):
        try:
            print("run here")
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
                users_in_room[request.sid] = {"user_id": user_id, "room_id": room_id}

                # remove old timer
                for sid, info in list(users_in_room.items()):
                    if sid != request.sid and info["user_id"] == user_id:
                        old_timer = disconnect_timers.pop(sid, None)
                        if old_timer:
                            old_timer.cancel()
                        users_in_room.pop(sid, None)

                # build user_map even if already in room
                user_map = build_user_map(players)

                emit("joined_room", {
                    "room_id": room["room_id"],
                    "room_name": room["room_name"],
                    "players": players,
                    "user_map": user_map
                }, room=request.sid)
                print("add here")

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

            # 👇 Build user_map dynamically
            user_map = {
                pid: UserInfo.find_one({"user_id": pid}).get("username", f"User {pid[:4]}")
                for pid in players
            }
            print("-----------")
            print(user_map)
            print(room)
            # Send confirmation to joining user
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

    def start_game_for_room(room_id):
        deck = create_deck()  # 54 cards including jokers
        room = RoomCollection.find_one({"room_id": room_id})
        if not room:
            return

        players = room.get("players", [])
        if len(players) != 3:
            print("here maybe")
            return

        # Shuffle the deck once
        random.shuffle(deck)

        # Divide into 18-card hands
        decks[room_id] = {}
        for i, player in enumerate(players):
            decks[room_id][player] = deck[i * 18:(i + 1) * 18]  # Slice 18 cards for each player

        # Send each player their hand + opponent card counts
        emit("game_start", decks[room_id], room=room_id)


    @socketio.on("leave_homepage")
    def handle_leave_homepage():
        print(f"Client {request.sid} left homepage room")
        leave_room("homepage")

    @socketio.on("take_card")
    def handle_take_card(data):
        print("Run here")
        user_info = users_in_room.get(request.sid)
        room_id = user_info["room_id"]
        user_id = user_info["user_id"]
        Roomdecks = decks[room_id]
        TakeDeck = Roomdecks[data.get("target_user_id")]
        random_index = random.randint(0, len(TakeDeck) - 1)
        card = TakeDeck[random_index]
        MyDeck = Roomdecks[user_id]

        MyDeck.append(card)
        TakeDeck.remove(card)
        emit("taking_card", Roomdecks,room=room_id)

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
        user_map = build_user_map(updated_room.get("players", []))

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

    @socketio.on("send_cards")
    def send_cards(data):
        user_info = users_in_room.get(request.sid)
        room_id = user_info["room_id"]
        user_id = user_info["user_id"]
        print(decks[room_id][user_id])

        for card in data["cards"]:
            decks[room_id][user_id].remove(card)
        print(decks[room_id][user_id])
        print(user_id)

        emit("card_send", {"user":user_id, "newdeck":decks[room_id][user_id],"card_send":data["cards"]}, room=room_id)

    @socketio.on("game_win")
    def win_game():
        user_info = users_in_room.get(request.sid)
        room_id = user_info["room_id"]
        user_id = user_info["user_id"]  # Winner ID

        print(f"Winner deck: {decks[room_id][user_id]}")

        # --- Step 1: Initialize fields if they don't exist for the winner ---
        UserInfo.update_one(
            {"user_id": user_id, "matches_won": {"$exists": False}},
            {"$set": {"matches_won": 0}}
        )
        UserInfo.update_one(
            {"user_id": user_id, "matches_played": {"$exists": False}},
            {"$set": {"matches_played": 0}}
        )

        # --- Step 2: Increment winner stats ---
        UserInfo.update_one(
            {"user_id": user_id},
            {"$inc": {"matches_won": 1, "matches_played": 1}}
        )

        # --- Step 3: Update other players ---
        losers = []
        room_players = decks[room_id].keys()
        for pid in room_players:
            if pid != user_id:
                # Initialize fields if not exist
                UserInfo.update_one(
                    {"user_id": pid, "matches_played": {"$exists": False}},
                    {"$set": {"matches_played": 0}}
                )
                # Increment matches_played
                UserInfo.update_one(
                    {"user_id": pid},
                    {"$inc": {"matches_played": 1}}
                )
                # Add loser info
                loser_info = UserInfo.find_one({"user_id": pid}, {"_id": 0, "user_id": 1, "username": 1, "ImgUrl": 1})
                losers.append(loser_info)

        # --- Step 4: Store the match result in MatchHistory ---
        winner_info = UserInfo.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1, "username": 1, "ImgUrl": 1})

        MatchHistory.insert_one({
            "winner": winner_info,
            "losers": losers,
            "timestamp": datetime.utcnow()
        })

        # Notify room about the winner
        emit("game_over", {"winner_id": user_id}, room=room_id)

def build_user_map(player_ids):
    user_map = {}
    for pid in player_ids:
        user = UserInfo.find_one({"user_id": pid})
        user_map[pid] = {
            "username": user.get("username", f"User {pid[:4]}") if user else f"User {pid[:4]}",
            "avatar": user.get("ImgUrl", "/static/images/defaultIcon.png") if user else "/static/images/Icon/defaultIcon.png"
        }
    return user_map

    # leave the homepage room