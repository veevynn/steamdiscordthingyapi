const express = require("express");
const app = express();

const STEAM_KEY = process.env.STEAM_KEY;
const STEAM_ID = process.env.STEAM_ID;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const APPLICATION_ID = process.env.APPLICATION_ID;
const USER_ID = process.env.USER_ID;

// Steam API base
const BASE_URL = "https://api.steampowered.com";

// -------------------------
// CACHE (60s Steam + Discord sync)
// -------------------------
let cache = null;
let cacheTime = 0;

// -------------------------
// FETCH STEAM DATA
// -------------------------
async function fetchSteam() {
    const now = Date.now();

    if (cache && now - cacheTime < 60000) {
        return cache;
    }

    const [levelRes, profileRes, gamesRes, friendsRes, badgesRes] = await Promise.all([
        fetch(`${BASE_URL}/IPlayerService/GetSteamLevel/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`),

        fetch(`${BASE_URL}/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${STEAM_ID}`),

        fetch(`${BASE_URL}/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}&include_played_free_games=1&include_appinfo=1`),

        fetch(`${BASE_URL}/ISteamUser/GetFriendList/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`),

        fetch(`${BASE_URL}/IPlayerService/GetBadges/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`)
    ]);

    const data = {
        level: await levelRes.json(),
        profile: await profileRes.json(),
        games: await gamesRes.json(),
        friends: await friendsRes.json(),
        badges: await badgesRes.json()
    };

    cache = data;
    cacheTime = now;

    return data;
}

// -------------------------
// FORMAT DATE (May 20th)
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
// DISCORD UPDATER LOOP
// -------------------------
async function updateDiscord() {
    try {
        const data = await fetchSteam();

        const level = data.level.response.player_level;

        const profile = data.profile.response.players[0];
        const state = profile.personastate;
        const lastSeen = formatDate(profile.lastlogoff);

        const gamesOwned = data.games.response.game_count || 0;

        const totalMinutes = (data.games.response.games || [])
            .reduce((sum, g) => sum + (g.playtime_forever || 0), 0);

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        const friends = data.friends.friendslist?.friends?.length || 0;

        const badges = data.badges.response.badges?.length || 0;

        const now = Math.floor(Date.now() / 1000);
        const created = profile.timecreated;

        let days = Math.ceil((now - created) / 86400);
        let age;

        if (days < 7) age = `${days}d`;
        else if (days < 52 * 7) age = `${Math.ceil(days / 7)}w`;
        else age = `${Math.ceil(days / 365)}y`;

        const body = {
            data: {
                dynamic: [
                    { type: 1, name: "level", value: String(level) },
                    { type: 1, name: "status", value: ["offline","online","busy","away","snooze","trade","play"][state] || "unknown" },
                    { type: 1, name: "owned", value: String(gamesOwned) },
                    { type: 1, name: "playtime", value: `${hours}h ${minutes}m` },
                    { type: 1, name: "last_seen", value: lastSeen },
                    { type: 1, name: "age", value: age },
                    { type: 1, name: "badges", value: String(badges) },
                    { type: 1, name: "friends", value: String(friends) }
                ]
            }
        };

        await fetch(
            `https://discord.com/api/v9/applications/${APPLICATION_ID}/users/${USER_ID}/identities/0/profile`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bot ${DISCORD_TOKEN}`
                },
                body: JSON.stringify(body)
            }
        );

        console.log("Discord profile updated");

    } catch (err) {
        console.error("Update failed:", err);
    }
}

// -------------------------
// START SERVER (optional API access)
// -------------------------
app.get("/steam/:stat", async (req, res) => {
    const data = await fetchSteam();

    const stat = req.params.stat;

    const profile = data.profile.response.players[0];

    const map = {
        level: data.level.response.player_level,
        friends: data.friends.friendslist?.friends?.length || 0,
        badges: data.badges.response.badges?.length || 0,
        owned: data.games.response.game_count || 0
    };

    res.send(String(map[stat] ?? "unknown"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Steam + Discord service running"));

// -------------------------
// RUN LOOP (EVERY 60 SECONDS)
// -------------------------
updateDiscord();
setInterval(updateDiscord, 60000);
