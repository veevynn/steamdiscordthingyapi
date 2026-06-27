const express = require("express");
const app = express();

const STEAM_KEY = process.env.STEAM_KEY;
const STEAM_ID = process.env.STEAM_ID;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const APPLICATION_ID = process.env.APPLICATION_ID;
const USER_ID = process.env.USER_ID;

const BASE_URL = "https://api.steampowered.com";

// -------------------------
// CACHE (60 seconds)
// -------------------------
let cache = null;
let cacheTime = 0;

// -------------------------
// FETCH ALL STEAM DATA
// -------------------------
async function fetchSteam() {
    const now = Date.now();

    if (cache && now - cacheTime < 60000) {
        return cache;
    }

    const [
        levelRes,
        profileRes,
        gamesRes,
        friendsRes,
        badgesRes,
        recentRes
    ] = await Promise.all([
        fetch(`${BASE_URL}/IPlayerService/GetSteamLevel/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`),

        fetch(`${BASE_URL}/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${STEAM_ID}`),

        fetch(`${BASE_URL}/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}&include_played_free_games=1&include_appinfo=1`),

        fetch(`${BASE_URL}/ISteamUser/GetFriendList/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`),

        fetch(`${BASE_URL}/IPlayerService/GetBadges/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`),

        fetch(`${BASE_URL}/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`)
    ]);

    cache = {
        level: await levelRes.json(),
        profile: await profileRes.json(),
        games: await gamesRes.json(),
        friends: await friendsRes.json(),
        badges: await badgesRes.json(),
        recent: await recentRes.json()
    };

    cacheTime = now;
    return cache;
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

        const profile = data.profile.response.players[0];

        const level = data.level.response.player_level;

        const state = profile.personastate;

        const gamesOwned = (data.games.response.games || []).length;

        const totalMinutes = (data.games.response.games || [])
            .reduce((sum, g) => sum + (g.playtime_forever || 0), 0);

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        const friends = data.friends.friendslist?.friends?.length || 0;

        const badges = data.badges.response.badges?.length || 0;

        // -------------------------
        // RECENT 2 WEEKS FIX
        // -------------------------
        const recentMinutes = (data.recent.response.games || [])
            .reduce((sum, g) => sum + (g.playtime_2weeks || 0), 0);

        const recentHours = Math.round(recentMinutes / 60);

        // -------------------------
        // ACCOUNT AGE FIX
        // -------------------------
        const now = Math.floor(Date.now() / 1000);
        const created = profile.timecreated;

        const days = Math.floor((now - created) / 86400);
        const weeks = Math.floor(days / 7);

        let age;

        if (weeks < 1) {
            age = `${days}d`;
        } else if (weeks < 52) {
            age = `${weeks}w`;
        } else {
            const years = Math.floor(weeks / 52);
            const remainingWeeks = weeks % 52;

            age = remainingWeeks > 0
                ? `${years}y ${remainingWeeks}w`
                : `${years}y`;
        }

        // -------------------------
        // DISCORD PAYLOAD
        // -------------------------
        const body = {
            data: {
                dynamic: [
                    { type: 1, name: "level", value: String(level) },
                    { type: 1, name: "status", value: ["offline","online","busy","away","snooze","trade","play"][state] || "unknown" },
                    { type: 1, name: "owned", value: String(gamesOwned) },
                    { type: 1, name: "playtime", value: `${hours}h ${minutes}m` },
                    { type: 1, name: "last_seen", value: formatDate(profile.lastlogoff) },
                    { type: 1, name: "recent", value: String(recentHours) },
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

        console.log("Updated Discord profile");

    } catch (err) {
        console.error("Update failed:", err);
    }
}

// -------------------------
// OPTIONAL API ROUTES
// -------------------------
app.get("/steam/:stat", async (req, res) => {
    const data = await fetchSteam();
    const profile = data.profile.response.players[0];

    const stats = {
        level: data.level.response.player_level,
        friends: data.friends.friendslist?.friends?.length || 0,
        badges: data.badges.response.badges?.length || 0,
        owned: (data.games.response.games || []).length
    };

    res.send(String(stats[req.params.stat] ?? "unknown"));
});

// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Steam + Discord service running"));

// -------------------------
// START LOOP (60s)
// -------------------------
updateDiscord();
setInterval(updateDiscord, 60000);
