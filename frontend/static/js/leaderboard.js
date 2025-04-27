/**
 * Leaderboard JavaScript
 * Handles fetching and displaying leaderboard data with improved error handling
 */

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

document.addEventListener('DOMContentLoaded', async function () {
    let userInfo = await fetchCurrentUserOrRedirect() //check auth
    if (!userInfo) {
        return;
    }

    fetchLeaderboardData();

    // Add refresh button functionality
    const refreshButton = document.getElementById('refresh-leaderboard');
    if (refreshButton) {
        refreshButton.addEventListener('click', function () {
            fetchLeaderboardData(true);
        });
    }
});

/**
 * Fetch leaderboard data from the API
 * @param {boolean} showLoading - Whether to show loading indicators
 */
async function fetchLeaderboardData(showLoading = true) {
    if (showLoading) {
        document.getElementById('win-leaderboard').innerHTML = '<div class="loading">Loading leaderboard data...</div>';
        document.getElementById('streak-leaderboard').innerHTML = '<div class="loading">Loading leaderboard data...</div>';
    }

    try {
        const response = await fetch('/api/leaderboard/rankings');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        displayWinLeaderboard(data.win_rankings);
        displayStreakLeaderboard(data.streak_rankings);
    } catch (error) {
        console.error('Error:', error);
        const errorMessage = '<div class="error-message">Error loading leaderboard data. Please try again later.</div>';
        document.getElementById('win-leaderboard').innerHTML = errorMessage;
        document.getElementById('streak-leaderboard').innerHTML = errorMessage;
    }
}

/**
 * Display the win-based leaderboard
 * @param {Array} players - Array of player data
 */
function displayWinLeaderboard(players) {
    const container = document.getElementById('win-leaderboard');

    if (!players || players.length === 0) {
        container.innerHTML = '<p class="no-data">No player data available.</p>';
        return;
    }

    let tableHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Wins</th>
                    <th>Matches</th>
                    <th>Win Rate</th>
                </tr>
            </thead>
            <tbody>
    `;

    players.forEach((player, index) => {
        // Handle potential missing data with defaults
        const wins = player.MatchWin || 0;
        const matches = player.MatchPlayed || 0;
        const winRate = matches > 0
            ? ((wins / matches) * 100).toFixed(1) + '%'
            : '0%';
        const imgUrl = player.ImgUrl || '/static/images/Icon/defaultIcon.png';

        tableHTML += `
            <tr>
                <td class="rank">#${index + 1}</td>
                <td class="player">
                    <img src="${imgUrl}" alt="${player.username}" class="player-avatar">
                    <span>${player.username}</span>
                </td>
                <td>${wins}</td>
                <td>${matches}</td>
                <td>${winRate}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}

/**
 * Display the streak-based leaderboard
 * @param {Array} players - Array of player data with streak info
 */
function displayStreakLeaderboard(players) {
    const container = document.getElementById('streak-leaderboard');

    if (!players || players.length === 0) {
        container.innerHTML = '<p class="no-data">No player data available.</p>';
        return;
    }

    let tableHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Best Win Streak</th>
                    <th>Current Streak</th>
                </tr>
            </thead>
            <tbody>
    `;

    players.forEach((player, index) => {
        const imgUrl = player.ImgUrl || '/static/images/Icon/defaultIcon.png';

        tableHTML += `
            <tr>
                <td class="rank">#${index + 1}</td>
                <td class="player">
                    <img src="${imgUrl}" alt="${player.username}" class="player-avatar">
                    <span>${player.username}</span>
                </td>
                <td>${player.max_win_streak || 0}</td>
                <td>${player.current_streak || 0}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}