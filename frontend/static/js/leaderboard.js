/**
 * Leaderboard JavaScript
 * Handles fetching and displaying leaderboard data
 */

document.addEventListener('DOMContentLoaded', function() {
    fetchLeaderboardData();
});

/**
 * Fetch leaderboard data from the API
 */
async function fetchLeaderboardData() {
    try {
        const response = await fetch('/api/leaderboard/rankings');
        if (!response.ok) {
            throw new Error('Failed to fetch leaderboard data');
        }

        const data = await response.json();
        displayWinLeaderboard(data.win_rankings);
        displayStreakLeaderboard(data.streak_rankings);
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('win-leaderboard').innerHTML = '<p>Error loading leaderboard data. Please try again later.</p>';
        document.getElementById('streak-leaderboard').innerHTML = '<p>Error loading leaderboard data. Please try again later.</p>';
    }
}

/**
 * Display the win-based leaderboard
 * @param {Array} players - Array of player data
 */
function displayWinLeaderboard(players) {
    const container = document.getElementById('win-leaderboard');

    if (!players || players.length === 0) {
        container.innerHTML = '<p>No player data available.</p>';
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
        const winRate = player.MatchPlayed > 0
            ? ((player.MatchWin / player.MatchPlayed) * 100).toFixed(1) + '%'
            : '0%';

        tableHTML += `
            <tr>
                <td class="rank">#${index + 1}</td>
                <td class="player">
                    <img src="${player.ImgUrl}" alt="${player.username}" class="player-avatar">
                    <span>${player.username}</span>
                </td>
                <td>${player.MatchWin}</td>
                <td>${player.MatchPlayed}</td>
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
        container.innerHTML = '<p>No player data available.</p>';
        return;
    }

    let tableHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Best Win Streak</th>
                </tr>
            </thead>
            <tbody>
    `;

    players.forEach((player, index) => {
        tableHTML += `
            <tr>
                <td class="rank">#${index + 1}</td>
                <td class="player">
                    <img src="${player.ImgUrl}" alt="${player.username}" class="player-avatar">
                    <span>${player.username}</span>
                </td>
                <td>${player.max_win_streak}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}