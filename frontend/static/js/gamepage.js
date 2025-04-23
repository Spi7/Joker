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

  // Join room on socket server (if reloading from /game)
  socket.emit("join_room", {
    user_id: user.user_id,
    username: user.username,
    room_id: roomId
  });

  // Handle new player joins
  socket.on("player_joined", (data) => {
    console.log(`${data.username} joined!`, data.players);
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

  window.addEventListener("beforeunload", () => {
    socket.disconnect(); // This ensures server runs handle_disconnect()
  });
});

//Replace Empty with each user's username when joined
function updatePlayerList(players, currentUserId, userMap) {
  const [slot1, slot2, slot3] = [
    document.querySelector(".profile.bottom-left"),
    document.querySelector(".profile.left-seat"),
    document.querySelector(".profile.right-seat")
  ];

  // Initialize with empty state
  slot1.textContent = "Empty";
  slot2.textContent = "Empty";
  slot3.textContent = "Empty";

  if (!players || players.length === 0) return;

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

  sorted.forEach((playerId, index) => {
    if (index === 0) slot1.textContent = displayName(playerId);
    if (index === 1) slot2.textContent = displayName(playerId);
    if (index === 2) slot3.textContent = displayName(playerId);
  });
}
