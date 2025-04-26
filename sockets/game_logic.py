import random

from flask import request
from flask_socketio import emit
from Database import RoomCollection, UserInfo


def create_deck():
    suits = ['♠', '♥', '♦', '♣']
    ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    deck = [f"{rank}{suit}" for suit in suits for rank in ranks]
    deck += ['JOKER1', 'JOKER2']
    random.shuffle(deck)
    return deck


def start_game_for_room(socketio, room_id, users_in_room):
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


    ### Send each player their hand + opponent card counts
    for sid, info in users_in_room.items():
        if info["room_id"] != room_id:
            continue

        user_id = info["user_id"]
        socketio.emit("game_start", {
            "your_hand": hands[user_id],
            "opponent_card_counts": [
                {"user_id": pid, "count": len(hands[pid])}
                for pid in players if pid != user_id
            ]
        }, room=sid)

def handle_take_card(socketio, users_in_room):
    @socketio.on("take_card")
    def _handle(data):
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

        taken_card = random.choice(hands[target_user_id])
        hands[target_user_id].remove(taken_card)
        hands[user_id].append(taken_card)

        RoomCollection.update_one({"room_id": room_id}, {"$set": {"hands": hands}})

        emit("card_taken", {
            "from_user_id": target_user_id,
            "to_user_id": user_id,
            "card_count": len(hands[target_user_id]),
            "taken_card": taken_card
        }, room=room_id)

# ###If all 3 players are ready, start game
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
