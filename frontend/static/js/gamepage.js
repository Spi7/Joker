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
    console.log(`Player left room ${data.room_id}`, data.user_map);
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

  // const displayName = (id) => {
  //   if (!id) return "Empty";
  //   return id === currentUserId
  //     ? `You (${userMap?.[id] || id})`
  //     : userMap?.[id] || id;
  // };

  // Fill slots with player data
  sorted.forEach((playerId, index) => {
    const slot = slots[index];
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
        }
      }
    });
  }

