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
  let selectedCards = []; // Store selected card values
  let selectedElements = []; // Store selected DOM elements


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

  socket.on("taking_card", (decks) => {
    // Clear the hand container first
  const handContainer = document.querySelector(".bottom-hand"); // Fetch your hand container
  const handRow = document.querySelector(".card-row"); // Fetch your hand row

  // Clear your hand display first
  if (handRow) handRow.innerHTML = "";

    Object.keys(decks).forEach(user_id => {
      const cards = decks[user_id];
      console.log(user_id);
      console.log(user.user_id);
      console.log("-------");

      if (user_id === user.user_id) {
        console.log("Updating your hand");

        // Clear your handRow
        handRow.innerHTML = "";

        // Render your updated hand
        cards.forEach((card, index) => {
          const cardEl = document.createElement("div");
          cardEl.className = "card";
          cardEl.style.setProperty("--i", index); // Stacking index

          const img = document.createElement("img");
          img.src = `/static/images/poker/${convertCardToFilename(card)}`;
          img.alt = card;

          cardEl.appendChild(img);
          handRow.appendChild(cardEl);

          cardEl.addEventListener("click", () => {
          selectCard(cardEl, card); // Call the selection function
          });
        });

        // Append the updated handRow back to handContainer
        handContainer.appendChild(handRow);

      } else {
        // Update opponent card counts
        const slot = document.querySelector(`.player-slot[data-user-id="${user_id}"]`);
        if (slot) {
          const cardCountEl = slot.querySelector(".card-count");
          cardCountEl.classList.add('visible'); // Ensure it's visible

          if (cardCountEl) {
            cardCountEl.textContent = cards.length;
          }
        }
      }
      const totalWidth = (handRow.children.length - 1) * 36;
      handRow.style.width = `${totalWidth}px`;

      handContainer.appendChild(handRow);
      document.body.appendChild(handContainer);
    });
  });

  socket.on("card_send", (data) => {
    user_id = data["user"]
    newdeck = data["newdeck"]
    card_send = data["card_send"]
    // 1. If this is YOU, re-render your hand
    console.log(user.user_id)
    console.log(newdeck)
    console.log("test_send")
    if (user.user_id === user_id) {
      const handContainer = document.querySelector(".bottom-hand");
      const handRow = document.querySelector(".card-row");

      if (handRow) handRow.innerHTML = "";
      console.log(newdeck)
      newdeck.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "card";
        cardEl.style.setProperty("--i", index);

        const img = document.createElement("img");
        img.src = `/static/images/poker/${convertCardToFilename(card)}`;
        img.alt = card;

        cardEl.appendChild(img);
        handRow.appendChild(cardEl);

        // Re-attach selection handler
        cardEl.addEventListener("click", () => {
          selectCard(cardEl, card);
        });
      });
    // Update hand row width
    const totalWidth = (handRow.children.length - 1) * 36;
    handRow.style.width = `${totalWidth}px`;

    handContainer.appendChild(handRow);

    if (newdeck.length === 0) {
      console.log("You win!");
      socket.emit("game_win"); // Emit game_win to the server
    }

  } else {
    // 2. Update opponent's card count
    const slot = document.querySelector(`.player-slot[data-user-id="${user_id}"]`);
    if (slot) {
      const cardCountEl = slot.querySelector(".card-count");
      if (cardCountEl) {
        const opponentCardCount = parseInt(cardCountEl.textContent) || 0;
        cardCountEl.textContent = opponentCardCount - card_send.length; // Decrease by number of sent cards
      }
    }
  }

  // 3. Display sent cards in the center for ALL players
  displayCenterCards(card_send);
});

// Function to display cards in the center
function displayCenterCards(cards) {
  // Remove any existing center display
  let centerDisplay = document.querySelector(".center-card-display");
  if (centerDisplay) centerDisplay.remove();

  // Create new display container
  centerDisplay = document.createElement("div");
  centerDisplay.className = "center-card-display";
  centerDisplay.style.position = "absolute";
  centerDisplay.style.top = "50%";
  centerDisplay.style.left = "50%";
  centerDisplay.style.transform = "translate(-50%, -50%)";
  centerDisplay.style.height = "150px";

  centerDisplay.style.zIndex = "5000";
  centerDisplay.style.width = "200px";
  cards.forEach((card,index) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.style.setProperty("--i", index);
    const img = document.createElement("img");
    img.src = `/static/images/poker/${convertCardToFilename(card)}`;
    img.alt = card;

    cardEl.appendChild(img);
    centerDisplay.appendChild(cardEl);
  });

  document.body.appendChild(centerDisplay);

}
  socket.on("game_over", (data) => {
    const winnerId = data["winner_id"];

    // 1. Freeze game interactions (disable Take button & Send button)
    document.querySelectorAll(".take-button").forEach(btn => btn.disabled = true);
    const sendBtn = document.getElementById("send-button");
    if (sendBtn) sendBtn.disabled = true;

    // 2. Create overlay popup
    const overlay = document.createElement("div");
    overlay.id = "game-over-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "9999";

    const winnerText = document.createElement("div");
    winnerText.textContent = `Winner: ${winnerId}`;
    winnerText.style.color = "white";
    winnerText.style.fontSize = "32px";
    winnerText.style.marginBottom = "20px";

    const continueBtn = document.createElement("button");
    continueBtn.textContent = "Continue";
    continueBtn.style.margin = "10px";

    const leaveBtn = document.createElement("button");
    leaveBtn.textContent = "Leave";
    leaveBtn.style.margin = "10px";

    overlay.appendChild(winnerText);
    overlay.appendChild(continueBtn);
    overlay.appendChild(leaveBtn);
    document.body.appendChild(overlay);

    // 3. Handle Continue
    continueBtn.addEventListener("click", () => {
      overlay.remove();
      window.location.reload();  // Reload to rejoin the same room
    });

    // 4. Handle Leave
    leaveBtn.addEventListener("click", () => {
      window.location.href = "/homepage";  // Redirect to homepage
    });
  });



  socket.on("game_start", (decks) => {
    // Remove the ready button when game starts
    const readyBtnContainer = document.querySelector(".ready-button-container");
    if (readyBtnContainer) readyBtnContainer.remove();

    const handContainer = document.createElement("div");
    handContainer.className = "bottom-hand";
    const sendButton = document.createElement("button");
    sendButton.id = "send-button";
    sendButton.textContent = "Send";
    sendButton.style.display = "none"; // Hidden by default
    sendButton.id = "send-button";
    sendButton.textContent = "Send";
    sendButton.style.display = "none"; // Hidden by default
    handContainer.appendChild(sendButton);

    // Attach the event listener here!
    sendButton.addEventListener("click", () => {
      console.log("Sending cards:", selectedCards);
      socket.emit("send_cards", { cards: selectedCards });

      // Clear selection
      selectedElements.forEach(el => el.classList.remove("selected"));
      selectedCards = [];
      selectedElements = [];
      sendButton.style.display = "none";
    });

handContainer.appendChild(sendButton);
    const handRow = document.createElement("div");
    handRow.className = "card-row";
    console.log(decks)

    // Loop over decks
    Object.keys(decks).forEach(user_id => {
      const cards = decks[user_id];
      console.log(user_id)
      console.log(user.user_id)
      console.log("-------")
      if (user_id === user.user_id) {
        // This is YOU, render your hand
        console.log("send to user")
        cards.forEach((card, index) => {
          const cardEl = document.createElement("div");
          cardEl.className = "card";
          cardEl.style.setProperty("--i", index); // Set index for CSS stacking

          const img = document.createElement("img");
          img.src = `/static/images/poker/${convertCardToFilename(card)}`;
          img.alt = card;

          cardEl.appendChild(img);
          handRow.appendChild(cardEl);
          cardEl.addEventListener("click", () => {
          selectCard(cardEl, card);
          })

        });

      } else {
        // This is an OPPONENT, update their card count
        const slot = document.querySelector(`.player-slot[data-user-id="${user_id}"]`);
        if (slot) {
          const cardCountEl = slot.querySelector(".card-count");
          cardCountEl.classList.add('visible'); // Ensure it's visible

          if (cardCountEl) {
            cardCountEl.textContent = cards.length;
          }

          // Add the 'Take' button if not already there
          if (!slot.querySelector(".take-button")) {
            const takeBtn = document.createElement("button");
            takeBtn.className = "take-button";
            takeBtn.textContent = "Take";

            takeBtn.addEventListener("click", () => {
              const cardCountEl = slot.querySelector(".card-count");
              const cardCount = parseInt(cardCountEl.textContent) || 0;

              if (cardCount > 1) {
                // Only allow taking a card if opponent has more than 1 card
                socket.emit("take_card", { target_user_id: user_id });
              } else {
                console.log("Cannot take a card from a player with only 1 card.");
              }
            });

            slot.appendChild(takeBtn);
          }
        }
      }
    });

  // Finish rendering your hand
  const totalWidth = (handRow.children.length - 1) * 36;
  handRow.style.width = `${totalWidth}px`;

  handContainer.appendChild(handRow);
  document.body.appendChild(handContainer);
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
    const avatarUrl = userMap[playerId]?.avatar || "/static/images/defaultIcon.png";
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


  function selectCard(cardElement, cardValue) {
    const isSelected = cardElement.classList.contains("selected");

    if (isSelected) {
      // Unselect the card
      cardElement.classList.remove("selected");
      selectedCards = selectedCards.filter(val => val !== cardValue);
      selectedElements = selectedElements.filter(el => el !== cardElement);
    } else {
      if (selectedCards.length >= 2) {
        const oldestElement = selectedElements.shift();
        const oldestCard = selectedCards.shift();
        oldestElement.classList.remove("selected");
      }
      // Select the card
      cardElement.classList.add("selected");
      selectedCards.push(cardValue); // e.g., "7♣"
      selectedElements.push(cardElement);
    }

    console.log("Selected cards:", selectedCards);

    // Check for matching numbers when 2 cards are selected
    if (selectedCards.length === 2) {
      const num1 = selectedCards[0].slice(0, -1); // e.g., "7"
      const num2 = selectedCards[1].slice(0, -1); // e.g., "8"

      if (num1 === num2) {
        // Show the send button
        document.getElementById("send-button").style.display = "block";
      } else {
        // Hide if not matching
        document.getElementById("send-button").style.display = "none";
      }
    } else {
      // Hide if not exactly 2 cards
      document.getElementById("send-button").style.display = "none";
    }
  }