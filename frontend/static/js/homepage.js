// 1. Establish connection with the WebSocket server
const socket = io(); // automatically uses WebSocket upgrade

// 2. Emit "create_room" when a button is clicked
document.addEventListener("DOMContentLoaded", () => {
  const createRoomBtn = document.getElementById("create-room-btn");

  socket.emit("get_all_rooms"); //send a message to backend asking for the room list

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
  //==============================================================================================================================

  //create a room, redirect user to the room id
  socket.on("room_created", (data) => {
    console.log("Room created!", data);
    const encodedRoomName = encodeURIComponent(data.room_name);
    window.location.href = `/game?room_id=${data.room_id}&room_name=${encodedRoomName}`;
  });

  //broadcast new room to everyone WHEN someone create a new room
  socket.on("new_room_broadcast", (data) => {
    const roomlist = document.querySelector(".room-scroll");

    const roomCard = document.createElement("div");
    roomCard.className = "room-card";
    roomCard.innerHTML = `
        <div class="room-info">
          <p class="room-name">Room Name: ${data.room_name}</p>
          <p class="room-players">Players: ${data.players.length}/3</p>
        </div>
        <a href="/game?${data.room_id}&room_name=${encodeURIComponent(data.room_name)}" class="join-btn">Join</a> 
       `;

    roomlist.appendChild(roomCard);
  });

  //broadcast the room list to everyone WHEN on page or REFRESH
  socket.on("all_rooms", (roomList) => {
    const roomScroll = document.querySelector(".room-scroll");
    roomScroll.innerHTML = "";

    roomList.forEach((data) => {
      const roomCard = document.createElement("div")
      roomCard.className = "room-card";

      if (data.players.length == 3) {
        roomCard.style.display = "none"; //hide this room when there are 3 player
      }

      roomCard.innerHTML = `
          <div class="room-info">
            <p class="room-name">Room Name: ${data.room_name}</p>
            <p class="room-players">Players: ${data.players.length}/3</p>
          </div>
          <a href="/game?room_id=${data.room_id}&room_name=${encodeURIComponent(data.room_name)}" class="join-btn">Join</a>
         `;
      roomScroll.appendChild(roomCard)
    })
  });

  //error redirect / message
  socket.on("error", (err) => {
    console.error("SocketIO Error:", err);
    if (err.redirect) {
      window.location.href = err.redirect;
    }
    else {
      alert("Error: " + (err.message || "Unknown Error"));
    }
  });
});
