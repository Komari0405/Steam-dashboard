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

// 所持ゲーム一覧を取得するエンドポイント
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

// プロフィール情報を取得するエンドポイント
app.get('/api/profile', async (req, res) => {
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${STEAM_ID}`;
    const response = await fetch(url);
    const data = await response.json();

    const player = data.response.players[0];

    res.json({
      displayName: player.personaname,
      avatarUrl: player.avatarfull,
      profileUrl: player.profileurl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'プロフィールの取得に失敗しました' });
  }
});

// 特定ゲームの実績を取得するエンドポイント
app.get('/api/achievements/:appId', async (req, res) => {
  try {
    const { appId } = req.params;
    const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.playerstats.success) {
      return res.json({ appId, hasAchievements: false, achievements: [] });
    }

    const achievements = data.playerstats.achievements || [];
    const totalCount = achievements.length;
    const unlockedCount = achievements.filter(a => a.achieved === 1).length;
    const unlockRate = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 1000) / 10 : 0;

    res.json({
      appId,
      hasAchievements: true,
      totalCount,
      unlockedCount,
      unlockRate
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '実績の取得に失敗しました' });
  }
});

// 全ゲームの実績解除率をまとめて取得するエンドポイント
app.get('/api/achievements/summary/all', async (req, res) => {
  try {
    const gamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`;
    const gamesResponse = await fetch(gamesUrl);
    const gamesData = await gamesResponse.json();
    const ownedGames = gamesData.response.games || [];

    const results = [];

    for (const game of ownedGames) {
      try {
        const achUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${game.appid}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`;
        const achResponse = await fetch(achUrl);
        const achData = await achResponse.json();

        if (achData.playerstats && achData.playerstats.success) {
          const achievements = achData.playerstats.achievements || [];
          const totalCount = achievements.length;
          const unlockedCount = achievements.filter(a => a.achieved === 1).length;
          const unlockRate = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 1000) / 10 : 0;

          results.push({
            appId: game.appid,
            hasAchievements: true,
            totalCount,
            unlockedCount,
            unlockRate
          });
        } else {
          results.push({ appId: game.appid, hasAchievements: false });
        }
      } catch (err) {
        results.push({ appId: game.appid, hasAchievements: false, error: true });
      }

      // レート制限対策:リクエスト間に少し間隔を空ける
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '実績サマリーの取得に失敗しました' });
  }
});

// フレンドリストを取得するエンドポイント
app.get('/api/friends', async (req, res) => {
  try {
    const friendsUrl = `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&relationship=friend`;
    const friendsResponse = await fetch(friendsUrl);
    const friendsData = await friendsResponse.json();

    if (!friendsData.friendslist) {
      return res.json({ friends: [] });
    }

    const friendIds = friendsData.friendslist.friends.map(f => f.steamid);

    const summariesUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${friendIds.join(',')}`;
    const summariesResponse = await fetch(summariesUrl);
    const summariesData = await summariesResponse.json();

    const friends = summariesData.response.players.map(p => ({
      steamId: p.steamid,
      displayName: p.personaname,
      avatarUrl: p.avatarfull,
      profileState: p.communityvisibilitystate
    }));

    res.json({ friends });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'フレンドリストの取得に失敗しました' });
  }
});

// フレンドランキング用:全フレンド(+自分)の代表スコアを計算するエンドポイント
app.get('/api/friends/ranking', async (req, res) => {
  try {
    const friendsUrl = `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&relationship=friend`;
    const friendsResponse = await fetch(friendsUrl);
    const friendsData = await friendsResponse.json();

    if (!friendsData.friendslist) {
      return res.json({ ranking: [] });
    }

    const friendIds = friendsData.friendslist.friends.map(f => f.steamid);

    const summariesUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${friendIds.join(',')}`;
    const summariesResponse = await fetch(summariesUrl);
    const summariesData = await summariesResponse.json();
    const profiles = summariesData.response.players;

    const results = [];

    const allPlayers = [
      { steamid: STEAM_ID, personaname: 'あなた', avatarfull: null, communityvisibilitystate: 3 },
      ...profiles
    ];

    for (const player of allPlayers) {
      try {
        if (player.communityvisibilitystate !== 3) {
          results.push({
            steamId: player.steamid,
            displayName: player.personaname,
            avatarUrl: player.avatarfull,
            error: 'プロフィールが非公開のため取得できません'
          });
          continue;
        }

        const gamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${player.steamid}&format=json&include_appinfo=true`;
        const gamesResponse = await fetch(gamesUrl);
        const gamesData = await gamesResponse.json();

        const ownedGames = gamesData.response.games || [];
        const gameCount = ownedGames.length;
        const totalPlaytimeHours = ownedGames.reduce((sum, g) => sum + g.playtime_forever, 0) / 60;

        // 一番プレイ時間が長いゲームと、一番スコアが高いゲームを探す
        let topGame = null;
        let topScore = 0;
        let topScoreGame = null;

        for (const g of ownedGames) {
          const playtimeHours = g.playtime_forever / 60;
          const gameScore = Math.min(100, Math.log10(g.playtime_forever + 1) * 20);

          if (!topGame || playtimeHours > topGame.playtimeHours) {
            topGame = {
              name: g.name,
              playtimeHours: Math.round(playtimeHours * 10) / 10,
              iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
            };
          }

          if (gameScore > topScore) {
            topScore = gameScore;
            topScoreGame = {
              name: g.name,
              score: Math.round(gameScore * 10) / 10,
              iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
            };
          }
        }

        results.push({
          steamId: player.steamid,
          displayName: player.personaname,
          avatarUrl: player.avatarfull,
          gameCount,
          totalPlaytimeHours: Math.round(totalPlaytimeHours * 10) / 10,
          topGame,
          topScoreGame
        });
      } catch (err) {
        results.push({
          steamId: player.steamid,
          displayName: player.personaname,
          avatarUrl: player.avatarfull,
          error: '取得に失敗しました'
        });
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({ ranking: results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'フレンドランキングの取得に失敗しました' });
  }
});

app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});