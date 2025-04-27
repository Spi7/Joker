const socket = io(); // automatically uses WebSocket upgrade

async function fetchCurrentUserOrRedirect() {
  try {
    const res = await fetch("/api/users/@me");
    if (!res.ok) throw new Error("Not authenticated");
    return await res.json();
  } catch (err) {
    console.error("Session invalid:", err);
    window.location.href = "/login";
  }
}

async function checkAndReconnectGame() {
  try {
    // First attempt with error handling
    let res;
    try {
      res = await fetch(`/api/game/CheckUserInGame`, {
        headers: {
          'Cache-Control': 'no-cache' // Prevent caching of the response
        }
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    } catch (err) {
      console.error("Initial check failed:", err);
      // Retry once after short delay
      await new Promise(resolve => setTimeout(resolve, 500));
      res = await fetch(`/api/game/CheckUserInGame`);
    }

    const data = await res.json();
    console.log("[Reconnect] Game status:", data);

    if (data.inGame) {
      const reconnectModal = document.getElementById("reconnect-modal");
      const okButton = document.getElementById("reconnect-ok");

      // Prevent duplicate event listeners
      okButton.replaceWith(okButton.cloneNode(true));
      const freshButton = document.getElementById("reconnect-ok");

      freshButton.onclick = () => {
        window.location.href = `/game?room_id=${data.room_id}&room_name=${encodeURIComponent(data.room_name)}`;
      };

      reconnectModal.classList.remove("hidden");

      // Auto-redirect after 8 seconds if user doesn't act
      setTimeout(() => {
        if (!reconnectModal.classList.contains("hidden")) {
          freshButton.click();
        }
      }, 8000);

      // If coming from game page, ensure we're not in a stale state
      if (document.referrer.includes("/game")) {
        await fetch('/api/game/CleanupStaleSession', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).catch(e => console.log("Cleanup error:", e));
      }
    }
  } catch (err) {
    console.error("Failed to check active game:", err);
    // No UI feedback needed as this is a background check
  }
}




let justNavigatedFromGame = false;

// Detect if user came from /game (i.e., back button used)
window.addEventListener("pageshow", (event) => {
  const referrer = document.referrer;
  if (referrer.includes("/game")) {
    justNavigatedFromGame = true;
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  let userInfo = await fetchCurrentUserOrRedirect();
  if (!userInfo) return;

  socket.emit("join_homepage");
  socket.emit("get_all_rooms");

  if (justNavigatedFromGame) {
    socket.emit("intentional_leave_room", {
      user_id: userInfo.user_id
    });

  setTimeout(async () => {
    await checkAndReconnectGame();
  }, 1200);  // <-- small delay after intentional leave
    justNavigatedFromGame = false; // reset
  } else {
    await checkAndReconnectGame();
  }

  socket.emit("check_and_cleanup_user", { user_id: userInfo.user_id });


  // Clickable Profile bar
  document.getElementById("profile-bar")?.addEventListener("click", () => {
    window.location.href = "/profile";
  });

  try {
    const res = await fetch("/api/profile/GetUserInfo", {method: "GET"});
    const profile = await res.json();

    const avatarElement = document.getElementById("profile-avatar");
    const usernameElement = document.getElementById("profile-username");

    avatarElement.src = profile.ImgUrl || "/static/images/defaultIcon.png";
    usernameElement.textContent = profile.username || "Failed to get Username";
  } catch (err) {
    console.error("Failed to load profile info: ", err);
  }

  // Join the homepage room
  socket.emit("join_homepage"); // New: Join the homepage room
  socket.emit("get_all_rooms"); // send a message to backend asking for the room list

  const createRoomBtn = document.getElementById("create-room-btn");
  createRoomBtn?.addEventListener("click", async () => {
    const roomName = prompt("Enter room name:");
    if (!roomName) return;

    let currentUser = await fetchCurrentUserOrRedirect();
    if (!currentUser) return;

    socket.emit("create_room", {
      user_id: currentUser.user_id,
      username: currentUser.username,
      room_name: roomName
    });
  });

  document.addEventListener("click", async (e) => {
    const joinBtn = e.target.closest(".join-btn");
    if (!joinBtn) return;

    if (joinBtn?.id === "close-modal") {
      const modal = document.getElementById("modal-overlay");
      modal.classList.add("hidden");
      window.location.href = "/homepage";
      return;
    }

    const roomId = joinBtn.dataset.roomId;
    const roomName = joinBtn.dataset.roomName;

    let currentUser = await fetchCurrentUserOrRedirect();
    if (!currentUser) return;

    socket.emit("join_room", {
      user_id: currentUser.user_id,
      username: currentUser.username,
      room_id: roomId
    });
  });

  socket.on("room_created", (data) => {
    const encodedRoomName = encodeURIComponent(data.room_name);
    window.location.href = `/game?room_id=${data.room_id}&room_name=${encodedRoomName}`;
  });

  socket.on("new_room_broadcast", (data) => {
    const roomlist = document.querySelector(".room-scroll");
    const roomCard = document.createElement("div");
    roomCard.className = "room-card";
    roomCard.innerHTML = `
      <div class="room-info">
        <p class="room-name">Room Name: ${data.room_name}</p>
        <p class="room-players">Players: ${data.players.length}/3</p>
      </div>
      <button class="join-btn" data-room-id="${data.room_id}" data-room-name="${data.room_name}">
        Join
      </button>`;
    roomlist.appendChild(roomCard);
  });

  socket.on("all_rooms", (roomList) => {
    const roomScroll = document.querySelector(".room-scroll");
    roomScroll.innerHTML = "";

    if (roomList.length === 0) {
      const noRoomMsg = document.createElement("p");
      noRoomMsg.className = "no-room";
      noRoomMsg.textContent = "No rooms available. Be the first to create one!";
      roomScroll.appendChild(noRoomMsg);
      return;
    }

    roomList.forEach((data) => {
      const roomCard = document.createElement("div");
      roomCard.className = "room-card";
      roomCard.innerHTML = `
        <div class="room-info">
          <p class="room-name">Room Name: ${data.room_name}</p>
          <p class="room-players">Players: ${data.players.length}/3</p>
        </div>
        <button class="join-btn" data-room-id="${data.room_id}" data-room-name="${data.room_name}">
          Join
        </button>`;
      roomScroll.appendChild(roomCard);
    });
  });

  socket.on("joined_room", (data) => {
    socket.emit("leave_homepage");
    const encodedRoomName = encodeURIComponent(data.room_name);
    window.location.href = `/game?room_id=${data.room_id}&room_name=${encodedRoomName}`;
  });

  socket.on("room_updated", (data) => {
    const roomlist = document.querySelector(".room-scroll");
    const existingCard = [...roomlist.children].find((card) =>
      card.querySelector(".join-btn")?.dataset.roomId === data.room_id
    );

    if (existingCard) {
      existingCard.querySelector(".room-players").textContent = `Players: ${data.players.length}/3`;
    }
  });

  socket.on("room_deleted", (data) => {
    socket.emit("get_all_rooms");
  });


  socket.on("error", (err) => {
    console.error("SocketIO Error:", err);
    if (err.message === "Room is full") {
      const modal = document.getElementById("modal-overlay");
      modal.classList.remove("hidden");
    } else if (err.redirect) {
      window.location.href = err.redirect;
    } else {
      alert("Error: " + (err.message || "Unknown Error"));
    }
  });

  document.getElementById("rules-btn").addEventListener("click", () => {
    document.getElementById("rules-modal").classList.remove("hidden");
  });
  document.getElementById("close-rules").addEventListener("click", () => {
    document.getElementById("rules-modal").classList.add("hidden");
  });
});