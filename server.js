const express = require("express");
const app = express();

const STEAM_KEY = process.env.STEAM_KEY;
const STEAM_ID = process.env.STEAM_ID;

// -------------------------
// CACHE (60 seconds)
// -------------------------
let cache = null;
let cacheTime = 0;

async function fetchSteam() {
    const now = Date.now();

    // refresh every 60 seconds
    if (cache && now - cacheTime < 60000) {
        return cache;
    }

    const [levelRes, profileRes, gamesRes, friendsRes, badgesRes] = await Promise.all([
        fetch(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`),

        fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${STEAM_ID}`),

        fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}&include_played_free_games=1&include_appinfo=1`),

        fetch(`https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`),

        fetch(`https://api.steampowered.com/IPlayerService/GetBadges/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`)
    ]);

    const level = await levelRes.json();
    const profile = await profileRes.json();
    const games = await gamesRes.json();
    const friends = await friendsRes.json();
    const badges = await badgesRes.json();

    cache = { level, profile, games, friends, badges };
    cacheTime = now;

    return cache;
}

// -------------------------
// HELPERS
// -------------------------
function formatDate(unix) {
    const d = new Date(unix * 1000);

    const month = d.toLocaleString("en-US", { month: "long" });
    const day = d.getDate();

    const suffix =
        day % 10 === 1 && day !== 11 ? "st" :
        day % 10 === 2 && day !== 12 ? "nd" :
        day % 10 === 3 && day !== 13 ? "rd" : "th";

    return `${month} ${day}${suffix}`;
}

// -------------------------
// LEVEL
// -------------------------
app.get("/steam/level", async (req, res) => {
    const data = await fetchSteam();
    res.send(String(data.level.response.player_level));
});

// -------------------------
// PERSONA STATUS
// -------------------------
app.get("/steam/persona", async (req, res) => {
    const data = await fetchSteam();

    const state = data.profile.response.players[0].personastate;

    const map = ["offline","online","busy","away","snooze","trade","play"];
    res.send(map[state] || "unknown");
});

// -------------------------
// LAST SEEN
// -------------------------
app.get("/steam/last_seen", async (req, res) => {
    const data = await fetchSteam();

    const unix = data.profile.response.players[0].lastlogoff;
    res.send(formatDate(unix));
});

// -------------------------
// ACCOUNT AGE
// -------------------------
app.get("/steam/account_age", async (req, res) => {
    const data = await fetchSteam();

    const created = data.profile.response.players[0].timecreated;
    const now = Math.floor(Date.now() / 1000);

    let days = Math.ceil((now - created) / 86400);

    if (days < 7) return res.send(`${days}d`);

    let weeks = Math.ceil(days / 7);
    if (weeks < 52) return res.send(`${weeks}w`);

    let years = Math.ceil(weeks / 52);
    return res.send(`${years}y`);
});

// -------------------------
// TOTAL PLAYTIME
// -------------------------
app.get("/steam/total_playtime", async (req, res) => {
    const data = await fetchSteam();

    const totalMinutes = data.games.response.games
        .reduce((sum, g) => sum + (g.playtime_forever || 0), 0);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    res.send(`${hours}h ${minutes}m`);
});

// -------------------------
// RECENT 2 WEEKS
// -------------------------
app.get("/steam/recent_2w_hours", async (req, res) => {
    const data = await fetchSteam();

    const totalMinutes = data.games.response.games
        .reduce((sum, g) => sum + (g.playtime_2weeks || 0), 0);

    const hours = Math.round(totalMinutes / 60);

    res.send(String(hours));
});

// -------------------------
// 🎮 NEW: GAMES OWNED
// -------------------------
app.get("/steam/games_owned", async (req, res) => {
    const data = await fetchSteam();

    const count = data.games.response.game_count || 0;

    res.send(String(count));
});

// -------------------------
// 👥 NEW: FRIENDS COUNT
// -------------------------
app.get("/steam/friends", async (req, res) => {
    const data = await fetchSteam();

    const count = data.friends.friendslist?.friends?.length || 0;

    res.send(String(count));
});

// -------------------------
// BADGES (already cached, now exposed)
// -------------------------
app.get("/steam/badges", async (req, res) => {
    const data = await fetchSteam();

    const count = data.badges.response.badges?.length || 0;

    res.send(String(count));
});

// -------------------------
// START SERVER
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Steam API running on port", PORT);
});
