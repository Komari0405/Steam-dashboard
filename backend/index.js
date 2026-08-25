require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

app.get('/', (req, res) => {
  res.send('Steam Dashboard API is running!');
});

app.get('/api/games', async (req, res) => {
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json&include_appinfo=true`;
    const response = await fetch(url);
    const data = await response.json();

    const games = data.response.games.map(game => ({
      appId: game.appid,
      name: game.name,
      playtimeHours: Math.round(game.playtime_forever / 60 * 10) / 10,
      iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
    }));

    games.sort((a, b) => b.playtimeHours - a.playtimeHours);

    res.json({
      totalGames: data.response.game_count,
      games: games
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Steam APIの取得に失敗しました' });
  }
});

app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});