let selectedCards = [];
let selectedElements = [];

//Convert card to actual card css
export function convertCardToFilename(card) {
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


//handle Game Start function, later can be imported in gamePage
export function handleGameStart (data, currentUserId, socket) {
    const { your_hand, opponent_card_counts } = data;

    console.log("Received game_start:", data);

    // Remove the ready button when game starts
    const readyBtnContainer = document.querySelector(".ready-button-container");
    if (readyBtnContainer) readyBtnContainer.remove();

    const oldHand = document.querySelector(".bottom-hand");
    if (oldHand) oldHand.remove();

    // Remove the "Ready state" shown beneath players username too
    document.querySelectorAll(".player-slot .ready-status").forEach(el => {
        el.remove();
    });

    //Select the send button
    const sendButtonContainer = document.querySelector(".send-button-container");
    const sendButton = document.getElementById("send-button");
    if (sendButtonContainer) sendButtonContainer.style.display = "block";

    sendButton.replaceWith(sendButton.cloneNode(true));
const newSendButton = document.getElementById("send-button");

    // Add event listener for Send button
    newSendButton.addEventListener("click", () => {
      if (selectedCards.length == 2) {
          const num1 = selectedCards[0].slice(0, -1);
          const num2 = selectedCards[1].slice(0, -1);

          if (num1 !== num2) {
              console.log("Selected cards do not match! Cannot send.");
              return; // ✋ do nothing if not matching
          }

          // Now safe to send
          console.log("Sending cards:", selectedCards);
          socket.emit("send_cards", {cards: selectedCards});

          // After sending, reset selection
          selectedElements.forEach(el => el.classList.remove("selected"));
          selectedCards = [];
          selectedElements = [];
      }
    });


    // Display player's hand
    const handContainer = document.createElement("div");
    handContainer.className = "bottom-hand";

    const handRow = document.createElement("div");
    handRow.className = "card-row";


    //show your hand first
    your_hand.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "card";
        cardEl.style.setProperty("--i", index); // Set index for CSS stacking

        const img = document.createElement("img");
        img.src = `/static/images/poker/${convertCardToFilename(card)}`;
        img.alt = card;

        cardEl.appendChild(img);
        handRow.appendChild(cardEl);

        cardEl.addEventListener("click", () => {
          selectCard(cardEl, card); // 👈 Add this line!
        });
    });

    const totalWidth =  (handRow.children.length - 1) * 36;
    handRow.style.width = `${totalWidth}px`;

    handContainer.appendChild(handRow);
    document.body.appendChild(handContainer);

    //then show opponent interaction button
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
        const cardCountEl = slot.querySelector(".card-count");
        if (cardCountEl) {
          cardCountEl.textContent = op.count;   // <-- update opponent's starting card number
          cardCountEl.classList.add("visible"); // make sure visible
        }
    });
}

// New added functions
export function handleTakeCard(decks, user, socket) {
  // remove old hand
  const oldHand = document.querySelector(".bottom-hand");
  if (oldHand) oldHand.remove();

  // create new hand container
  const handContainer = document.createElement("div");
  handContainer.className = "bottom-hand";

  const handRow = document.createElement("div");
  handRow.className = "card-row";

  // render your cards
  Object.keys(decks).forEach(user_id => {
    const cards = decks[user_id];

    if (user_id === user.user_id) {
      // Update my hand
      cards.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "card";
        cardEl.style.setProperty("--i", index);

        const img = document.createElement("img");
        img.src = `/static/images/poker/${convertCardToFilename(card)}`;
        img.alt = card;

        cardEl.appendChild(img);
        handRow.appendChild(cardEl);

        cardEl.addEventListener("click", () => {
          selectCard(cardEl, card);
        });
      });
    } else {
      // Update opponent's card count
      const slot = document.querySelector(`.player-slot[data-user-id="${user_id}"]`);
      if (slot) {
        const cardCountEl = slot.querySelector(".card-count");
        if (cardCountEl) {
          cardCountEl.textContent = cards.length;
        }
      }
    }
  });

  const totalWidth = (handRow.children.length - 1) * 36;
  handRow.style.width = `${totalWidth}px`;

  handContainer.appendChild(handRow);
  document.body.appendChild(handContainer);
}


export function handleSendCard(user, newdeck, card_send, currentUserId, socket) {
  const handContainer = document.querySelector(".bottom-hand");
  const handRow = document.querySelector(".bottom-hand .card-row");

  if (user === currentUserId) {
    handRow.innerHTML = "";

    newdeck.forEach((card, index) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.style.setProperty("--i", index);

      const img = document.createElement("img");
      img.src = `/static/images/poker/${convertCardToFilename(card)}`;
      img.alt = card;

      cardEl.appendChild(img);
      handRow.appendChild(cardEl);

      cardEl.addEventListener("click", () => {
        selectCard(cardEl, card);
      });
    });

    const totalWidth = (handRow.children.length - 1) * 36;
    handRow.style.width = `${totalWidth}px`;

    if (newdeck.length === 0) {
      console.log("You win!");
      socket.emit("game_win"); // Emit game_win to the server
    }
  } else {
    // Opponent played 2 cards, reduce their card count
    const slot = document.querySelector(`.player-slot[data-user-id="${user}"]`);
    if (slot) {
      const cardCountEl = slot.querySelector(".card-count");
      if (cardCountEl) {
        const previousCount = parseInt(cardCountEl.textContent) || 0;
        cardCountEl.textContent = previousCount - card_send.length;
      }
    }
  }

  displayCenterCards(card_send);
}


export function displayCenterCards(cards) {
  let centerDisplay = document.querySelector(".center-card-display");
  if (centerDisplay) centerDisplay.remove();

  centerDisplay = document.createElement("div");
  centerDisplay.className = "center-card-display";
  centerDisplay.style.position = "absolute";
  centerDisplay.style.top = "50%";
  centerDisplay.style.left = "50%";
  centerDisplay.style.transform = "translate(-50%, -50%)";
  centerDisplay.style.height = "150px";
  centerDisplay.style.zIndex = "5000";
  centerDisplay.style.width = "200px";

  cards.forEach((card, index) => {
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

export function handleGameOver(winner_id, username) {
  // 1. Freeze actions
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
  winnerText.textContent = `Winner: ${username}`;
  winnerText.style.color = "white";
  winnerText.style.fontSize = "32px";
  winnerText.style.marginBottom = "20px";

  const leaveBtn = document.createElement("button");
  let countdown = 10;
  leaveBtn.textContent = `Leave (${countdown})`;
  leaveBtn.style.margin = "10px";

  overlay.appendChild(winnerText);
  overlay.appendChild(leaveBtn);
  document.body.appendChild(overlay);

  const countdownInterval = setInterval(() => {
    countdown--;
    leaveBtn.textContent = `Leave (${countdown})`;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      leaveBtn.click();
    }
  }, 1000);

  leaveBtn.addEventListener("click", () => {
    clearInterval(countdownInterval); // Prevent multiple redirects
    window.location.href = "/homepage";
  });
}



export function selectCard(cardElement, cardValue) {
  const isSelected = cardElement.classList.contains("selected");

  if (isSelected) {
    // If already selected, unselect it
    cardElement.classList.remove("selected");
    selectedCards = selectedCards.filter(val => val !== cardValue);
    selectedElements = selectedElements.filter(el => el !== cardElement);
  } else {
    if (selectedCards.length >= 2) {
      // If 2 already selected, remove the oldest one first
      const oldestElement = selectedElements.shift();
      selectedCards.shift();
      oldestElement.classList.remove("selected");
    }

    // Select the new card
    cardElement.classList.add("selected");
    selectedCards.push(cardValue);
    selectedElements.push(cardElement);
  }
}
