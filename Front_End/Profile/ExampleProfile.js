document.addEventListener("DOMContentLoaded", async () => {
  const userInfo = {
    Username: "SamplePlayer",
    MatchPlayed: 5,
    MatchWin: 3,
    ImgUrl: "https://via.placeholder.com/100"
  };

  const matchData = [
    { StartedTime: "2025-04-10 14:30", MatchResult: "Win", Opponent: ["Alice", "Bob"] },
    { StartedTime: "2025-04-09 17:45", MatchResult: "Loss", Opponent: ["Charlie", "Dana"] },
    { StartedTime: "2025-04-08 20:00", MatchResult: "Win", Opponent: ["Eve", "Frank"] },
    { StartedTime: "2025-04-07 13:15", MatchResult: "Loss", Opponent: ["Grace", "Heidi"] },
    { StartedTime: "2025-04-06 11:00", MatchResult: "Win", Opponent: ["Ivan", "Judy"] }
  ];

  document.getElementById("username").textContent = userInfo.Username;
  document.getElementById("matches-played").textContent = userInfo.MatchPlayed;
  document.getElementById("matches-won").textContent = userInfo.MatchWin;
  document.querySelector(".profile-avatar").src = userInfo.ImgUrl;

  let streak = 0, maxStreak = 0;
  for (let match of matchData) {
    if (match.MatchResult === "Win") {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }
  document.getElementById("highest-streak").textContent = maxStreak;

  async function getOpponentAvatar(username) {
    try {
      const res = await fetch(`/GET/UserInfo/${username}`);
      const data = await res.json();
      return data.ImgUrl || "https://via.placeholder.com/60";
    } catch (err) {
      return "https://via.placeholder.com/60";
    }
  }

  const matchList = document.getElementById("match-list");
  matchList.innerHTML = "";

  for (let match of matchData) {
    const card = document.createElement("div");
    card.className = "post-card horizontal-layout";

    const badgeSrc = match.MatchResult === "Win"
      ? "Win.png"
      : "Lose.png";

    const avatarUrls = await Promise.all(
      match.Opponent.map(op => getOpponentAvatar(op))
    );

    card.innerHTML = `
      <div class="match-left">
        <img class="winloss-badge" src="${badgeSrc}" alt="${match.MatchResult}" />
      </div>
      <div class="match-center">
        <div class="opponent">
          <div class="opponent-name">${match.Opponent[0]}</div>
          <img src="WinLoss.png" class="opponent-avatar" alt="${match.Opponent[0]}" />
        </div>
        <div class="opponent">
          <div class="opponent-name">${match.Opponent[1]}</div>
          <img src="WinLoss.png" class="opponent-avatar" alt="${match.Opponent[1]}" />
        </div>
      </div>
      <div class="match-right">${match.StartedTime}</div>
    `;

    matchList.appendChild(card);
  }
});
