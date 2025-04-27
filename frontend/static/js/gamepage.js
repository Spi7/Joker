import { handleGameStart, convertCardToFilename, handleTakeCard, handleSendCard, handleGameOver, displayCenterCards } from "./game_logic.js";

const socket = io(); // Automatically uses existing WebSocket
let gameStarted = false;
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

const seatCache = {}; // { roomId: { userId: seatIndex } }
let currentUserId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("room_id");

  if (!roomId) return;

  const user = await fetchCurrentUserOrRedirect();
  if (!user) return;
  currentUserId = user.user_id;

  let isReady = false;
  const readyBtn = document.querySelector(".ready-button");

  readyBtn.addEventListener("click", () => {
    isReady = !isReady;
    socket.emit("player_ready", { ready: isReady });
    readyBtn.textContent = isReady ? "Unready" : "Ready?";
    readyBtn.classList.toggle("ready", !isReady);
    readyBtn.classList.toggle("unready", isReady);
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
    console.log(`Player left room ${data.room_id}`, data.user_map);
    updatePlayerList(data.players, user.user_id, data.user_map);
    socket.emit("get_ready_status");
  });

  // On initial room join (you yourself) --> deal with refreshes too
  socket.on("joined_room", (data) => {
    console.log("Joined room", data);
    updatePlayerList(data.players, user.user_id, data.user_map);

    if (data.game_active) {
      console.log("Game already active, waiting for game_start...");
      gameStarted = true;
      // The server will emit "game_start" to us, we just wait for it.
    } else {
      setTimeout(() => {
        socket.emit("get_ready_status");
      }, 100);
    }
  });



  socket.on("update_ready_status", (statusList) => {
    console.log("Readiness status:", statusList);
    updateReadyStatus(statusList);
  });

  // ========================== NEW added =====================================
  socket.on("taking_card", (decks) => {
    console.log("Received taking_card:", decks);
    handleTakeCard(decks, user, socket);
  });



  socket.on("game_over", ({ winner_id, username }) => {
    handleGameOver(winner_id, username, async () => {
      // 1. Remove old hand
      const bottomHand = document.querySelector(".bottom-hand");
      if (bottomHand) bottomHand.remove();

      // 2. Remove center display cards
      const centerCard = document.querySelector(".center-card-display");
      if (centerCard) centerCard.remove();

      const sendButtonContainer = document.querySelector(".send-button-container");
      if (sendButtonContainer) sendButtonContainer.remove();

      // 3. Remove all "Take" buttons
      document.querySelectorAll(".take-button").forEach(button => button.remove());

      // 4. Remove all card-count displays
      document.querySelectorAll(".player-slot .card-count").forEach(cardCount => cardCount.remove());

      // 5. Restore "Ready" button container
      const oldReadyButtonContainer = document.querySelector(".ready-button-container");
      if (!oldReadyButtonContainer) {
        const readyButtonContainer = document.createElement("div");
        readyButtonContainer.className = "ready-button-container";

        const readyButton = document.createElement("button");
        readyButton.className = "ready-button";
        readyButton.textContent = "Ready?";

        readyButton.addEventListener("click", () => {
          isReady = !isReady;
          socket.emit("player_ready", { ready: isReady });
          readyButton.textContent = isReady ? "Unready" : "Ready?";
          readyButton.classList.toggle("ready", !isReady);
          readyButton.classList.toggle("unready", isReady);
        });

        readyButtonContainer.appendChild(readyButton);
        document.body.appendChild(readyButtonContainer);
      }

      // 6. Restore "Ready" statuses under player slots
      document.querySelectorAll(".player-slot").forEach(slot => {
        let readyStatusEl = slot.querySelector(".ready-status");
        if (!readyStatusEl) {
          readyStatusEl = document.createElement("div");
          readyStatusEl.className = "ready-status";
          readyStatusEl.textContent = "[Not Ready]";
          slot.appendChild(readyStatusEl);
        }
      });

      // 7. Intentional leave and rejoin
      socket.emit("intentional_leave_room", { user_id: currentUserId });

      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get("room_id");

      const user = await fetchCurrentUserOrRedirect();
      if (!user) return;

      socket.emit("join_room", {
        user_id: user.user_id,
        username: user.username,
        room_id: roomId
      });

      gameStarted = false;

    });
  });

  socket.on("card_send", ({ user, newdeck, card_send }) => {
    handleSendCard(user, newdeck, card_send, currentUserId, socket);
  });

  // ===========================================================================

  //waiting for game_start
  socket.on("game_start", (data) => {
    if (!gameStarted) {
      startCountdownAndBlockActions(() => {
        handleGameStart(data, currentUserId, socket);
        gameStarted = true;
      });
    } else {
      handleGameStart(data, currentUserId, socket);
    }
  });


  // If user clicks back button (NOT a refresh), inform server
  window.addEventListener("popstate", async () => {
    if (justReloaded) return;

    const res = await fetch("/api/users/@me");
    if (res.ok) {
      const user = await res.json();
      socket.emit("intentional_leave_room", {
        user_id: user.user_id
      });

      // New: after intentional leave, go to homepage (homepage will automatically detect and show reconnect modal)
      window.location.href = "/homepage";
    }
  });
});

// Update player slots with usernames and default ready status
function updatePlayerList(players, currentUserId, userMap) {
  const [slot0, slot1, slot2] = [
    document.querySelector(".player-slot.bottom-left"),
    document.querySelector(".player-slot.left-seat"),
    document.querySelector(".player-slot.right-seat")
  ];
  const slots = [slot0, slot1, slot2];

  const roomId = new URLSearchParams(window.location.search).get("room_id");
  if (!roomId) return;

  if (!seatCache[roomId]) seatCache[roomId] = {};
  const seatMap = seatCache[roomId];

  // Assign seat index to any new users not yet cached
  let nextAvailableSeat = 0;
  players.forEach((playerId) => {
    if (!(playerId in seatMap)) {
      while (Object.values(seatMap).includes(nextAvailableSeat)) {
        nextAvailableSeat++;
      }
      seatMap[playerId] = nextAvailableSeat;
    }
  });

  // Make sure currentUserId is always at seat 0
  const mySeat = seatMap[currentUserId];
  if (mySeat !== 0) {
    const userAtZero = Object.keys(seatMap).find(uid => seatMap[uid] === 0);
    if (userAtZero) seatMap[userAtZero] = mySeat;
    seatMap[currentUserId] = 0;
  }

  // Reset all slots
  slots.forEach(slot => {
    slots.forEach(slot => {
    slot.dataset.userId = "";
    slot.querySelector(".card-count").textContent = "0";
    const readyStatusEl = slot.querySelector(".ready-status");
    readyStatusEl.textContent = "[Not Ready]";
    readyStatusEl.classList.remove("ready", "not-ready");  // Reset both classes
    readyStatusEl.classList.add("not-ready"); //
    readyStatusEl.style.color = ""; //
    slot.querySelector(".player-icon").innerHTML = "";
    slot.querySelector(".player-name").textContent = "Empty";
});
  });

  // Fill slots based on assigned seat index
  players.forEach((playerId) => {
    const seatIndex = seatMap[playerId];
    const slot = slots[seatIndex];
    if (!slot) return;

    slot.dataset.userId = playerId;

    const playerInfo = userMap?.[playerId];
    const avatarUrl = playerInfo?.avatar || "/static/images/Icon/defaultIcon.png";
    const username = playerInfo?.username || playerId;

    const iconContainer = slot.querySelector(".player-icon");
    if (iconContainer) {
      iconContainer.innerHTML = `<img src="${avatarUrl}" alt="avatar" style="width: 100%; height: 100%; border-radius: 50%;">`;
    }

    const playerNameEl = slot.querySelector(".player-name");
    if (playerNameEl) {
      playerNameEl.textContent = username;
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
        readyStatusEl.classList.remove("ready", "not-ready"); // first always reset both
        readyStatusEl.classList.add(isReady ? "ready" : "not-ready"); // then add correct one
      }
    }

    const readyBtn = document.querySelector(".ready-button");
    if (user_id === currentUserId && readyBtn) {
      readyBtn.textContent = isReady ? "Unready" : "Ready?";
      readyBtn.classList.remove("ready", "unready");
      readyBtn.classList.add(isReady ? "unready" : "ready"); // note your button class logic is inverse
    }
  });
}

// Countdown modal handle
function startCountdownAndBlockActions(callback) {
  const countdownModal = document.getElementById("countdown-modal");
  const countdownNumber = document.getElementById("countdown-number");
  const blockOverlay = document.getElementById("block-actions-overlay");

  blockOverlay.style.display = "block";   // Block everything
  countdownModal.style.display = "flex";  // Show countdown

  let counter = 3;
  const interval = setInterval(() => {
    if (counter === 0) {
      countdownNumber.textContent = "START!";
    } else {
      countdownNumber.textContent = counter;
    }

    if (counter < 0) {
      clearInterval(interval);
      countdownModal.style.display = "none";
      blockOverlay.style.display = "none";    // Unblock after countdown
    }

    if (callback) {
      callback(); // after countdown finishes, run the real game logic (ex. show cards)
    }

    counter--;
  }, 1000);
}
