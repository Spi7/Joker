// 1. Establish connection with the WebSocket server
const socket = io(); // automatically uses WebSocket upgrade

// 2. Emit "create_room" when a button is clicked
document.addEventListener("DOMContentLoaded", () => {
  const createRoomBtn = document.getElementById("create-room-btn");

  createRoomBtn?.addEventListener("click", () => {
    const userId = sessionStorage.getItem("user_id") || "test-user"; // Replace with real session
    const roomName = prompt("Enter room name:");
    if (!roomName) return;

    socket.emit("create_room", {
      user_id: userId,
      room_name: roomName
    });

    console.log("create_room emitted!");
  });

  socket.on("room_created", (data) => {
    console.log("Room created!", data);
    const encodedRoomName = encodeURIComponent(data.room_name);
    window.location.href = `/game?room_id=${data.room_id}&room_name=${encodedRoomName}`;
  });

  socket.on("error", (err) => {
    console.error("SocketIO Error:", err);
    alert("Error: " + err.message);
  });
});
