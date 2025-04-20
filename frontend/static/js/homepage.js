// 1. Establish connection with the WebSocket server
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

// 2. Emit "create_room" when a button is clicked
document.addEventListener("DOMContentLoaded", async() => {

  let userInfo = await fetchCurrentUserOrRedirect() //check auth
  if (!userInfo) {
    return;
  }
  //Create room listening
  const createRoomBtn = document.getElementById("create-room-btn");
  socket.emit("get_all_rooms"); //send a message to backend asking for the room list

  createRoomBtn?.addEventListener("click", async() => {
    const roomName = prompt("Enter room name:");
    if (!roomName) return;

    let currentUser = await fetchCurrentUserOrRedirect() //check auth
    if (!userInfo) {
      return;
    }

    socket.emit("create_room", {
      user_id: currentUser.user_id,
      username: currentUser.username,
      room_name: roomName
    });
    console.log("create_room emitted!");
  });

  //Join room listening
  document.addEventListener("click", async(e) => {
    const joinBtn = e.target.closest(".join-btn");
    if (!joinBtn) return;
    // Check if this is the modal OK button
    if (joinBtn?.id === "close-modal") {
      const modal = document.getElementById("modal-overlay");
      modal.classList.add("hidden");
      window.location.href = "/homepage";
      return;
    }

    const roomId = joinBtn.dataset.roomId;
    const roomName = joinBtn.dataset.roomName;

    let currentUser = await fetchCurrentUserOrRedirect() //check auth
    if (!userInfo) {
      return;
    }

    socket.emit("join_room", {
      user_id: currentUser.user_id,
      username: currentUser.username,
      room_id: roomId
    });
  })

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
        <button class="join-btn" data-room-id="${data.room_id}" data-room-name="${data.room_name}">
            Join
        </button>

       `;

    roomlist.appendChild(roomCard);
  });

  //broadcast the room list to everyone WHEN on page or REFRESH
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
      const roomCard = document.createElement("div")
      roomCard.className = "room-card";

      roomCard.innerHTML = `
          <div class="room-info">
            <p class="room-name">Room Name: ${data.room_name}</p>
            <p class="room-players">Players: ${data.players.length}/3</p>
          </div>
          <button class="join-btn" data-room-id="${data.room_id}" data-room-name="${data.room_name}">
            Join
          </button>
         `;
      roomScroll.appendChild(roomCard)
    })
  });

  //redirect to /game when server confirms join
  socket.on("joined_room", (data) => {
    const encodedRoomName = encodeURIComponent(data.room_name);
    window.location.href = `/game?room_id=${data.room_id}&room_name=${encodedRoomName}`;
  })

  //error redirect / message
  socket.on("error", (err) => {
    console.error("SocketIO Error:", err);
    if (err.message === "Room is full") {
      const modal = document.getElementById("modal-overlay");
      modal.classList.remove("hidden");
    }
    else if (err.redirect) {
      window.location.href = err.redirect;
    }
    else {
      alert("Error: " + (err.message || "Unknown Error"));
    }
  });
});
