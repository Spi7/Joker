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

document.addEventListener('DOMContentLoaded', function () {
    // Detect current page and add appropriate class to body
    const path = window.location.pathname;
    if (path.includes('/homepage')) {
        document.body.classList.add('homepage-page');
    } else if (path.includes('/leaderboard')) {
        document.body.classList.add('leaderboard-page');
    } else if (path.includes('/profile')) {
        document.body.classList.add('profile-page');
    }

    // Add active class to current navigation link
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        }
    });
});

document.addEventListener("DOMContentLoaded", async () => {
    const backButton = document.getElementById("go-home");
    backButton.addEventListener("click", () => {
        window.location.href = "/homepage";
    });

    // Add logout button functionality
    document.getElementById("logout-btn").addEventListener("click", () => {
        window.location.href = "/logout";
    });

    let userInfo = await fetchCurrentUserOrRedirect() //check auth
    if (!userInfo) {
        return;
    }
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
            const res = await fetch(`/api/profile/ChangeIcon`, {
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
        const userInfoRes = await fetch("/api/profile/GetUserInfo", {method: "GET"});
        const userInfo = await userInfoRes.json();
        document.getElementById("username").textContent = userInfo.username;
        document.getElementById("matches-played").textContent = userInfo.MatchPlayed ?? 0;
        document.getElementById("matches-won").textContent = userInfo.MatchWin ?? 0;
        const avatarImg = document.querySelector(".profile-avatar");
        if (userInfo.ImgUrl) {
            avatarImg.src = userInfo.ImgUrl;
        } else {
            avatarImg.src = "/static/images/defaultIcon.png"; // ← or whatever your default path is
        }

        // Fetch match history
        const matchResponse = await fetch(`/api/profile/GetMatch`, {method: "GET"});
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
