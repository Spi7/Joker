
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
    });

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
}

//handle a function for card taking
export function handle_card_taken(data, currentUserId) {
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
  }