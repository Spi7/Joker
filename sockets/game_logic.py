import random
from datetime import datetime
from flask import request
from flask_socketio import emit
from Database import RoomCollection, UserInfo, MatchHistory


room_decks = {}  # { room_id: { user_id: [cards...] } }

def create_deck():
    suits = ['♠', '♥', '♦', '♣']
    ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    deck = [f"{rank}{suit}" for suit in suits for rank in ranks]
    deck += ['JOKER1', 'JOKER2']
    random.shuffle(deck)
    return deck

def start_game_for_room(socketio, room_id, users_in_room):
    deck = create_deck()
    room = RoomCollection.find_one({"room_id": room_id})
    if not room:
        return

    players = room.get("players", [])
    if len(players) != 3:
        return

    # Shuffle and divide
    room_decks[room_id] = {}
    for i, player in enumerate(players):
        room_decks[room_id][player] = deck[i * 18:(i + 1) * 18]

    RoomCollection.update_one(
        {"room_id": room_id},
        {"$set": {"game_active": True}}
    )

    # Send initial hands
    for sid, info in users_in_room.items():
        if info["room_id"] != room_id:
            continue
        user_id = info["user_id"]
        socketio.emit("game_start", {
            "your_hand": room_decks[room_id][user_id],
            "opponent_card_counts": [
                {"user_id": pid, "count": len(room_decks[room_id][pid])}
                for pid in players if pid != user_id
            ]
        }, room=sid)


def handle_take_card(socketio, users_in_room, sid, data):

    user_info = users_in_room.get(sid)
    room_id = user_info["room_id"]
    target_user_id = data.get("target_user_id")

    if len(room_decks[room_id][target_user_id]) <= 1:
        socketio.emit("error_message", {"message": "Cannot take card: opponent has only 1 card left."}, room=sid)
        return

    user_id = user_info["user_id"]

    Roomdecks = room_decks[room_id]
    TakeDeck = Roomdecks[target_user_id]
    random_index = random.randint(0, len(TakeDeck) - 1)
    card = TakeDeck[random_index]
    MyDeck = Roomdecks[user_id]

    MyDeck.append(card)
    TakeDeck.remove(card)
    emit("taking_card", Roomdecks, room=room_id)



def handle_send_cards(socketio, users_in_room, sid, data):
    user_info = users_in_room.get(sid)
    if not user_info:
        return

    room_id = user_info["room_id"]
    user_id = user_info["user_id"]
    cards_to_send = data.get("cards", [])

    # Add security check: Must be exactly 2 cards
    if len(cards_to_send) != 2:
        socketio.emit("error_message", {"message": "You must select exactly two cards to send."}, room=sid)
        return

    # Check that the numbers (without suit) match
    num1 = cards_to_send[0][:-1]  # "7♠" -> "7"
    num2 = cards_to_send[1][:-1]
    if num1 != num2:
        socketio.emit("error_message", {"message": "Selected cards must have the same number."}, room=sid)
        return

    # Make sure player actually owns both cards
    player_hand = room_decks.get(room_id, {}).get(user_id, [])
    for card in cards_to_send:
        if card not in player_hand:
            socketio.emit("error_message", {"message": f"You don't have card {card}."}, room=sid)
            return

    # Remove the cards from the hand
    for card in cards_to_send:
        player_hand.remove(card)

    socketio.emit("card_send", {
        "user": user_id,
        "newdeck": player_hand,
        "card_send": cards_to_send
    }, room=room_id)


def handle_win_game(socketio, users_in_room, ready_status, sid):
    user_info = users_in_room.get(sid)
    if not user_info:
        return

    room_id = user_info["room_id"]
    user_id = user_info["user_id"]

    if room_id not in room_decks or user_id not in room_decks[room_id]:
        return

    # Update database records
    UserInfo.update_one(
        {"user_id": user_id, "matches_won": {"$exists": False}},
        {"$set": {"matches_won": 0}}
    )
    UserInfo.update_one(
        {"user_id": user_id, "matches_played": {"$exists": False}},
        {"$set": {"matches_played": 0}}
    )
    UserInfo.update_one(
        {"user_id": user_id},
        {"$inc": {"matches_won": 1, "matches_played": 1}}
    )

    losers = []
    for pid in room_decks[room_id]:
        if pid != user_id:
            UserInfo.update_one(
                {"user_id": pid, "matches_played": {"$exists": False}},
                {"$set": {"matches_played": 0}}
            )
            UserInfo.update_one(
                {"user_id": pid},
                {"$inc": {"matches_played": 1}}
            )
            loser_info = UserInfo.find_one({"user_id": pid}, {"_id": 0, "user_id": 1, "username": 1, "ImgUrl": 1})
            losers.append(loser_info)

    user_db = UserInfo.find_one({"user_id": user_id})
    username = user_db.get("username", "_UNKNOWN_")
    winner_info = {
        "user_id": user_db.get("user_id"),
        "username": user_db.get("username", "Unknown"),
        "ImgUrl": user_db.get("ImgUrl", "/static/images/Icon/defaultIcon.png")
    }
    MatchHistory.insert_one({
        "winner": winner_info,
        "losers": losers,
        "timestamp": datetime.utcnow()
    })

    # Announce winner to players inside
    socketio.emit("game_over", {"winner_id": user_id, "username": username}, room=room_id)

    # Cleanup memory
    if room_id in room_decks:
        del room_decks[room_id]

    # Immediately delete room from DB (no wait)
    RoomCollection.delete_one({"room_id": room_id})

    # Broadcast room deleted to homepage
    socketio.emit("room_deleted", {"room_id": room_id}, broadcast=True)
    socketio.emit("all_rooms", list(RoomCollection.find({}, {"_id": 0})), broadcast=True)


def get_player_hand(room_id, user_id):
    if room_id in room_decks and user_id in room_decks[room_id]:
        return room_decks[room_id][user_id]
    return []
