const express = require("express");
const app = express();

const STEAM_KEY = process.env.39CE68E3368C3C864C41E5094EC4DAB2;
const STEAM_ID = process.env.76561199555932921;

// LEVEL
app.get("/steam/level", async (req, res) => {
    const r = await fetch(
        `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${STEAM_KEY}&steamid=${STEAM_ID}`
    );

    const data = await r.json();
    res.send(String(data.response.player_level));
});

// PERSONA STATE
app.get("/steam/persona", async (req, res) => {
    const r = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${STEAM_ID}`
    );

    const data = await r.json();
    const state = data.response.players[0].personastate;

    const map = ["offline","online","busy","away","snooze","trade","play"];
    res.send(map[state] || "unknown");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port", PORT));