require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const DEFAULT_STEAM_ID = process.env.STEAM_ID; // 未ログイン時のフォールバック(あなた自身、ローカル開発用)
const EXCLUDED_APP_IDS = [993090]; // Lossless Scaling
const JWT_SECRET = process.env.SESSION_SECRET || 'steam-dashboard-dev-secret';

// 本番では環境変数で上書き、未設定ならローカル開発用のURLを使う
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const IS_HTTPS = BACKEND_URL.startsWith('https');

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

// express-sessionはSteamログインの一連の手続き(OpenIDの検証)中だけ使う一時的なもので、
// ログイン後の「誰がログインしているか」の判定には使わない(そちらはAuthorizationヘッダーのトークンで行う)
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 10 * 60 * 1000, // ログイン手続き中だけ有効な短い有効期限(10分)
    secure: IS_HTTPS,
    sameSite: IS_HTTPS ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new SteamStrategy({
  returnURL: `${BACKEND_URL}/auth/steam/return`,
  realm: `${BACKEND_URL}/`,
  apiKey: STEAM_API_KEY
}, (identifier, profile, done) => {
  // profile.id が64bitのSteamID
  return done(null, {
    steamId: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.photos && profile.photos.length > 0 ? profile.photos[profile.photos.length - 1].value : null
  });
}));

// リクエストの Authorization: Bearer <token> ヘッダーから、ログイン中のユーザー情報を取り出す(なければnull)
// Cookieを一切使わないため、スマホのSafariなどのサードパーティCookie制限の影響を受けない
function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { steamId: decoded.steamId, displayName: decoded.displayName, avatarUrl: decoded.avatarUrl };
  } catch (err) {
    return null; // 期限切れ・改ざんなどは未ログイン扱い
  }
}

// リクエストごとに「今どのSteamIDを見るべきか」を解決するヘルパー
// ログイン済みならそのユーザーのSteamID、未ログインなら.envのデフォルト(あなた自身、ローカル開発用のフォールバック)
function getSteamId(req) {
  const user = getAuthUser(req);
  return user ? user.steamId : DEFAULT_STEAM_ID;
}

app.get('/', (req, res) => {
  res.send('Steam Dashboard API is running!');
});

// Steamログイン開始
app.get('/auth/steam', passport.authenticate('steam'));

// Steamからのコールバック:ログイン手続き成功後、トークンをURLパラメータでフロントエンドに渡す
// (Cookieでの受け渡しはスマホのSafari等でブロックされるため、URLパラメータ経由にしている)
app.get('/auth/steam/return',
  passport.authenticate('steam', { failureRedirect: '/', session: false }),
  (req, res) => {
    const token = jwt.sign(req.user, JWT_SECRET, { expiresIn: '7d' });
    // OpenID手続き用の一時セッションはもう不要なので破棄しておく
    if (req.session) req.session.destroy(() => {});
    res.redirect(`${FRONTEND_URL}/?token=${encodeURIComponent(token)}`);
  }
);

// 今ログインしているユーザー情報(未ログインならnull)。フロントエンドがAuthorizationヘッダーでトークンを送ってくる想定
app.get('/auth/user', (req, res) => {
  const user = getAuthUser(req);
  if (user) {
    res.json({ loggedIn: true, user });
  } else {
    res.json({ loggedIn: false, user: null });
  }
});

// 所持ゲーム一覧を取得するエンドポイント
app.get('/api/games', async (req, res) => {
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${getSteamId(req)}&format=json&include_appinfo=true`;
    const response = await fetch(url);
    const data = await response.json();

    const games = data.response.games.map(game => ({
      appId: game.appid,
      name: game.name,
      playtimeHours: Math.round(game.playtime_forever / 60 * 10) / 10,
      playtimeRecentHours: Math.round((game.playtime_2weeks || 0) / 60 * 10) / 10,
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
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${getSteamId(req)}`;
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
    const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${STEAM_API_KEY}&steamid=${getSteamId(req)}`;
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
    const gamesUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${getSteamId(req)}&format=json`;
    const gamesResponse = await fetch(gamesUrl);
    const gamesData = await gamesResponse.json();
    const ownedGames = gamesData.response.games || [];

    const results = [];

    for (const game of ownedGames) {
      try {
        const achUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${game.appid}&key=${STEAM_API_KEY}&steamid=${getSteamId(req)}`;
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
    const friendsUrl = `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${getSteamId(req)}&relationship=friend`;
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
    const friendsUrl = `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${getSteamId(req)}&relationship=friend`;
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
      { steamid: getSteamId(req), personaname: 'あなた', avatarfull: null, communityvisibilitystate: 3 },
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

        const ownedGames = (gamesData.response.games || []).filter(g => !EXCLUDED_APP_IDS.includes(g.appid));
        const gameCount = ownedGames.length;
        const totalPlaytimeHours = ownedGames.reduce((sum, g) => sum + g.playtime_forever, 0) / 60;

        let topGame = null;
        let topScore = 0;
        let topScoreGame = null;
        let topRecentGame = null;

        for (const g of ownedGames) {
          const playtimeHours = g.playtime_forever / 60;
          const gameScore = Math.min(100, Math.log10(g.playtime_forever + 1) * 20);
          const recentHours = (g.playtime_2weeks || 0) / 60;

          if (!topGame || playtimeHours > topGame.playtimeHours) {
            topGame = {
              appId: g.appid,
              name: g.name,
              playtimeHours: Math.round(playtimeHours * 10) / 10,
              iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
            };
          }

          if (gameScore > topScore) {
            topScore = gameScore;
            topScoreGame = {
              appId: g.appid,
              name: g.name,
              score: Math.round(gameScore * 10) / 10,
              iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
            };
          }

          if (recentHours > 0 && (!topRecentGame || recentHours > topRecentGame.recentHours)) {
            topRecentGame = {
              appId: g.appid,
              name: g.name,
              recentHours: Math.round(recentHours * 10) / 10,
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
          topScoreGame,
          topRecentGame
        });
      } catch (err) {
        results.push({
          steamId: player.steamid,
          displayName: player.personaname,
          avatarUrl: player.avatarfull,
          error: '取得に失敗しました'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({ ranking: results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'フレンドランキングの取得に失敗しました' });
  }
});

// ウィッシュリストを取得するエンドポイント
app.get('/api/wishlist', async (req, res) => {
  try {
    const url = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${getSteamId(req)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.response || !data.response.items) {
      return res.json({ wishlist: [] });
    }

    const appIds = data.response.items.map(item => item.appid);

    res.json({ wishlist: appIds });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ウィッシュリストの取得に失敗しました' });
  }
});

// ウィッシュリストの価格・セール情報を取得するエンドポイント
app.get('/api/wishlist/prices', async (req, res) => {
  try {
    const wishlistUrl = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${getSteamId(req)}`;
    const wishlistResponse = await fetch(wishlistUrl);
    const wishlistData = await wishlistResponse.json();

    if (!wishlistData.response || !wishlistData.response.items) {
      return res.json({ items: [] });
    }

    const appIds = wishlistData.response.items.map(item => item.appid);
    const results = [];

    for (const appId of appIds) {
      try {
        const detailUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=jp&filters=price_overview,basic`;
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();

        const appData = detailData[appId];

        if (appData && appData.success && appData.data) {
          const priceInfo = appData.data.price_overview;

          if (priceInfo) {
            results.push({
              appId,
              name: appData.data.name,
              iconUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`,
              currentPrice: priceInfo.final / 100,
              originalPrice: priceInfo.initial / 100,
              discountPercent: priceInfo.discount_percent
            });
          } else {
            results.push({
              appId,
              name: appData.data.name,
              iconUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`,
              currentPrice: null,
              originalPrice: null,
              discountPercent: 0
            });
          }
        }
      } catch (err) {
        console.error(`appId ${appId} の取得に失敗:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    results.sort((a, b) => b.discountPercent - a.discountPercent);

    res.json({ items: results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ウィッシュリストの価格取得に失敗しました' });
  }
});

app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});