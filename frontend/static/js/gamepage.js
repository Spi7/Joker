const socket = io(); // Automatically uses existing WebSocket

let justReloaded = true;
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    justReloaded = false;
  }, 1200); // 超过1.2秒就不是刷新了
});

async function fetchCurrentUserOrRedirect() {
  try {
    const res = await fetch("/api/users/@me");
    if (!res.ok) throw new Error("Not authenticated");
    return await res.json();
  } catch (err) {
    window.location.href = "/login";
  }
}



function convertCardToFilename(card) {
  if (card === "JOKER1") {
    return "red_joker.png";
  }
  if (card === "JOKER2") {
    return "black_joker.png";
  }

  const rankMap = {
    "A": "ace",
    "J": "jack",
    "Q": "queen",
    "K": "king"
  };

  const suitMap = {
    "♠": "spades",
    "♥": "hearts",
    "♦": "diamonds",
    "♣": "clubs"
  };

  const rank = rankMap[card.slice(0, -1)] || card.slice(0, -1);
  const suit = suitMap[card.slice(-1)];

  if (rank === "queen" || rank === "king" || rank === "jack"){
      return `${rank}_of_${suit}2.png`; // Add the '2' suffix as per your format
  }
  return `${rank}_of_${suit}.png`; // Add the '2' suffix as per your format
}


document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("room_id");

  if (!roomId) return;

  const user = await fetchCurrentUserOrRedirect();
  if (!user) return;

  let isReady = false;
  const readyBtn = document.querySelector(".ready-button");

  readyBtn.addEventListener("click", () => {
    isReady = !isReady;
    socket.emit("player_ready", { ready: isReady });
    readyBtn.textContent = isReady ? "Unready" : "Ready?";
  });

  socket.emit("join_room", {
    user_id: user.user_id,
    username: user.username,
    room_id: roomId
  });

  // Handle new player joins
  socket.on("player_joined", (data) => {
    console.log(`${data.username} joined!`, data.user_map);
    updatePlayerList(data.players, user.user_id, data.user_map);
  });

  // Handle player leaves (disconnect)
  socket.on("player_left", (data) => {
    console.log(`Player left room ${data.room_id}`, data.players);
    updatePlayerList(data.players, user.user_id, data.user_map);
  });

  // On initial room join (you yourself)
  socket.on("joined_room", (data) => {
    console.log("Joined room", data);
    updatePlayerList(data.players, user.user_id, data.user_map);
  });

  // If user clicks back button (NOT a refresh), inform server
  window.addEventListener("popstate", async () => {
    if (justReloaded) return; // 刷新触发的 popstate 忽略
    const res = await fetch("/api/users/@me");
    if (res.ok) {
      const user = await res.json();
      socket.emit("intentional_leave_room", {
        user_id: user.user_id
      });
    }
  });
  socket.on("update_ready_status", (statusList) => {
    console.log("Readiness status:", statusList);
    updateReadyStatus(statusList);
  });

  socket.on("card_taken", (data) => {
  const { from_user_id, to_user_id, card_count, taken_card } = data;

  // Update opponent's card count
  const slot = document.querySelector(`.player-slot[data-user-id="${from_user_id}"]`);
  if (slot) {
    const cardCountEl = slot.querySelector(".card-count");
    if (cardCountEl) {
      cardCountEl.textContent = card_count;
    }
  }

  // If current user receives the card, add it to hand
  if (to_user_id === user.user_id) {
    const handRow = document.querySelector(".card-row");

    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.style.setProperty("--i", handRow.children.length); // Update stacking index

    const img = document.createElement("img");
    img.src = `/static/images/poker/${convertCardToFilename(taken_card)}`;
    img.alt = taken_card;

    cardEl.appendChild(img);
    handRow.appendChild(cardEl);

    // Update hand row width
    console.log((handRow.children.length - 1))
    const totalWidth =  80 + (handRow.children.length - 1) * 31;
    handRow.style.width = `${totalWidth}px`;
  }
});


  socket.on("game_start", (data) => {
    const { your_hand, opponent_card_counts } = data;

    console.log("Received game_start:", data);

    // Remove the ready button when game starts
    const readyBtnContainer = document.querySelector(".ready-button-container");
    if (readyBtnContainer) readyBtnContainer.remove();

    // Display player's hand
    const handContainer = document.createElement("div");
    handContainer.className = "bottom-hand";

    const handRow = document.createElement("div");
    handRow.className = "card-row";

    opponent_card_counts.forEach(op => {
    const slot = document.querySelector(`.player-slot[data-user-id="${op.user_id}"]`);
    if (slot && !slot.querySelector(".take-button")) { // Prevent duplicate buttons
      const takeBtn = document.createElement("button");
      takeBtn.className = "take-button";
      takeBtn.textContent = "Take";

      takeBtn.addEventListener("click", () => {
        socket.emit("take_card", { target_user_id: op.user_id });
      });

      slot.appendChild(takeBtn);
    }
  });

  your_hand.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.style.setProperty("--i", index); // Set index for CSS stacking

    const img = document.createElement("img");
    img.src = `/static/images/poker/${convertCardToFilename(card)}`;
    img.alt = card;

    cardEl.appendChild(img);
    handRow.appendChild(cardEl);
  });
    const totalWidth =  (handRow.children.length - 1) * 36;
    handRow.style.width = `${totalWidth}px`;

    handContainer.appendChild(handRow);
    document.body.appendChild(handContainer);

    // Update opponent card counts
    opponent_card_counts.forEach(op => {
      const slot = document.querySelector(`.player-slot[data-user-id="${op.user_id}"]`);
      if (slot) {
        const cardCountEl = slot.querySelector(".card-count");
        cardCountEl.classList.add('visible'); // Ensure it's visible

        if (cardCountEl) {
          cardCountEl.textContent = op.count;
        }
      }
    });
  });

  window.addEventListener("beforeunload", () => {
    socket.disconnect(); // Ensure server runs handle_disconnect()
  });
});

// Update player slots with usernames and default ready status
function updatePlayerList(players, currentUserId, userMap) {
  const [slot1, slot2, slot3] = [
    document.querySelector(".player-slot.bottom-left"),
    document.querySelector(".player-slot.left-seat"),
    document.querySelector(".player-slot.right-seat")
  ];

  const slots = [slot1, slot2, slot3];

  // Reset all slots
  slots.forEach(slot => {
    slot.dataset.userId = "";
    slot.querySelector(".card-count").textContent = "0";
    slot.querySelector(".ready-status").textContent = "[Not Ready]";

    const iconContainer = slot.querySelector(".player-icon");
    iconContainer.innerHTML = ""; // Clear icon
    const playerNameEl = slot.querySelector(".player-name");
    if (playerNameEl) playerNameEl.textContent = "Empty"; // Reset name
  });

  // Sort players so current user is always first
  const sorted = [...players];
  const youIndex = sorted.indexOf(currentUserId);

  if (youIndex > -1) {
    [sorted[0], sorted[youIndex]] = [sorted[youIndex], sorted[0]];
  }

  const displayName = (id) => {
    if (!id) return "Empty";
    return id === currentUserId
      ? `You (${userMap?.[id] || id})`
      : userMap?.[id] || id;
  };

  // Fill slots with player data
  sorted.forEach((playerId, index) => {
    const slot = slots[index];
    slot.dataset.userId = playerId;

    const iconContainer = slot.querySelector(".player-icon");
    const avatarUrl = userMap[playerId]?.avatar || "/static/images/Icon/defaultIcon.png";
    iconContainer.innerHTML = `<img src="${avatarUrl}" alt="avatar" style="width: 100%; height: 100%; border-radius: 50%;">`;

    const playerNameEl = slot.querySelector(".player-name");
    if (playerNameEl) {
      playerNameEl.textContent = userMap[playerId]?.username || playerId;
    }
  });

}

// Update ready statuses
  function updateReadyStatus(statusList) {
    statusList.forEach((status) => {
      const { user_id, isReady } = status;
      const slot = document.querySelector(`.player-slot[data-user-id="${user_id}"]`);
      if (slot) {
        const readyStatusEl = slot.querySelector(".ready-status");
        if (readyStatusEl) {
          readyStatusEl.textContent = isReady ? "[Ready]" : "[Not Ready]";
        }
      }
    });
  }

