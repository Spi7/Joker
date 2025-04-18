document.addEventListener("DOMContentLoaded", async () => {
  const authToken = sessionStorage.getItem("token");
  // if (!authToken) {
  //   window.location.href = "/Login";
  //   return;
  // }
  // Avatar edit logic
  const editBtn = document.getElementById("edit-avatar-btn");
  const uploadInput = document.getElementById("avatar-upload");

  editBtn.addEventListener("click", () => {
    uploadInput.click();
  });

  uploadInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch(`/ChangeIcon`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (data.ImgUrl) {
        document.querySelector(".profile-avatar").src = data.ImgUrl;
      } else {
        console.error("Invalid response from server:", data);
      }
    } catch (err) {
      console.error("Failed to upload avatar:", err);
    }
  });

  try {
    // Fetch user info
    const userInfoRes = await fetch("/GetUserInfo",{method: "GET"});
    const userInfo = await userInfoRes.json();
    document.getElementById("username").textContent = userInfo.Username;
    document.getElementById("matches-played").textContent = userInfo.MatchPlayed;
    document.getElementById("matches-won").textContent = userInfo.MatchWin;
    document.querySelector(".profile-avatar").src = userInfo.ImgUrl;

    // Fetch match history
    const matchResponse = await fetch(`/GetMatch`,{method:"GET"});
    const matchJson = await matchResponse.json();
    const matchData = matchJson.Match;

    // Compute highest streak
    let streak = 0;
    let maxStreak = 0;
    for (const match of matchData) {
      if (match.MatchResult === "Win") {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    document.getElementById("highest-streak").textContent = maxStreak;

    // Render match history
    const matchList = document.getElementById("match-list");
    matchList.innerHTML = "";

    for (const match of matchData) {
      const card = document.createElement("div");
      card.className = "post-card horizontal-layout";

      const badgeSrc = match.MatchResult === "Win" ? "Win.png" : "Lose.png";

      const opponentsHTML = match.opponents.map(op => `
        <div class="opponent">
          <img src="${op.Img}" class="opponent-avatar" alt="${op.username}" />
          <div class="opponent-name">${op.username}</div>
        </div>
      `).join("");

      card.innerHTML = `
        <div class="match-left">
          <img class="winloss-badge" src="${badgeSrc}" alt="${match.MatchResult}" />
        </div>
        <div class="match-center">
          ${opponentsHTML}
        </div>
        <div class="match-right">${match.StartedTime}</div>
      `;

      matchList.appendChild(card);
    }

  } catch (err) {
    console.error("Failed to load profile or match history:", err);
  }
});
