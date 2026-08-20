require('dotenv').config();
const express = require('express');
const app = express();
const PORT = 3000;

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

app.get('/', (req, res) => {
  res.send('Steam Dashboard API is running!');
});

// 所持ゲーム一覧を取得するエンドポイント
app.get('/api/games', async (req, res) => {
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json&include_appinfo=true`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Steam APIの取得に失敗しました' });
  }
});

app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});