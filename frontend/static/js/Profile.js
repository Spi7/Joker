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

document.addEventListener("DOMContentLoaded", async () => {
  let userInfo = await fetchCurrentUserOrRedirect(); // check auth
  if (!userInfo) {
    return;
  }

  const editBtn = document.getElementById("edit-avatar-btn");
  const uploadInput = document.getElementById("avatar-upload");
  const avatarElement = document.querySelector(".profile-avatar");

  editBtn.addEventListener("click", () => {
    uploadInput.click();
  });

  uploadInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch(`/api/profile/ChangeIcon`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (data.ImgUrl) {
        avatarElement.src = data.ImgUrl;
      } else {
        console.error("Invalid response from server:", data);
      }
    } catch (err) {
      console.error("Failed to upload avatar:", err);
    }
  });

  try {
    const userInfoRes = await fetch("/api/profile/GetUserInfo", { method: "GET" });
    const userInfo = await userInfoRes.json();
    document.getElementById("username").textContent = userInfo.username;
    document.getElementById("matches-played").textContent = userInfo.matches_played ?? 0;
    document.getElementById("matches-won").textContent = userInfo.matches_won ?? 0;

    if (userInfo.ImgUrl && userInfo.ImgUrl.startsWith("/static/images/Icon/")) {
      avatarElement.src = userInfo.ImgUrl;
    } else {
      avatarElement.src = "/static/images/defaultIcon.png";
    }

    const matchResponse = await fetch(`/api/profile/GetMatch`, { method: "GET" });
    const matchJson = await matchResponse.json();
    const matchData = matchJson.Match;

    let streak = 0;
    let maxStreak = 0;
    for (const match of matchData) {
      const isWinner = match.winner.user_id === userInfo.user_id;
      if (isWinner) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    document.getElementById("highest-streak").textContent = maxStreak;

    const matchList = document.getElementById("match-list");
    matchList.innerHTML = "";

    for (const match of matchData) {
      const isWinner = match.winner.user_id === userInfo.user_id;
      const badgeSrc = isWinner ? "Win.png" : "Lose.png";

      const opponents = match.losers.filter(op => op.user_id !== userInfo.user_id);
      if (!isWinner) {
        opponents.push(match.winner);
      }

      const opponentsHTML = opponents.map(op => `
        <div class="opponent">
          <img src="${op.ImgUrl}" class="opponent-avatar" alt="${op.username}" />
          <div class="opponent-name">${op.username}</div>
        </div>
      `).join("");

      const card = document.createElement("div");
      card.className = "post-card horizontal-layout";

      card.innerHTML = `
        <div class="match-left">
          <img class="winloss-badge" src="${badgeSrc}" alt="${isWinner ? 'Win' : 'Lose'}" />
        </div>
        <div class="match-center">
          ${opponentsHTML}
        </div>
        <div class="match-right">${new Date(match.timestamp).toLocaleString()}</div>
      `;

      matchList.appendChild(card);
    }

  } catch (err) {
    console.error("Failed to load profile or match history:", err);
  }
});