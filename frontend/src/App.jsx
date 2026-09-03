import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [games, setGames] = useState([]);
  const [profile, setProfile] = useState(null);
  const [achievements, setAchievements] = useState({});
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('playtime-desc');
  const [showUnplayed, setShowUnplayed] = useState(false);
  const [gachaResult, setGachaResult] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    fetch('http://localhost:3000/api/games')
      .then(res => res.json())
      .then(data => {
        setGames(data.games);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });

    fetch('http://localhost:3000/api/profile')
      .then(res => res.json())
      .then(data => setProfile(data))
      .catch(err => console.error(err));

    fetch('http://localhost:3000/api/achievements/summary/all')
      .then(res => res.json())
      .then(data => {
        const achMap = {};
        data.results.forEach(item => {
          achMap[item.appId] = item;
        });
        setAchievements(achMap);
        setAchievementsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setAchievementsLoading(false);
      });
  }, []);

  if (loading) return <p className="loading">読み込み中...</p>;

  const filteredGames = games
    .filter(game => showUnplayed || game.playtimeHours > 0)
    .filter(game => game.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'playtime-desc':
          return b.playtimeHours - a.playtimeHours;
        case 'playtime-asc':
          return a.playtimeHours - b.playtimeHours;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

  const totalHours = games.reduce((sum, g) => sum + g.playtimeHours, 0);
  const unplayedCount = games.filter(g => g.playtimeHours === 0).length;
  const unplayedGames = games.filter(g => g.playtimeHours === 0);
  const spinGacha = () => {
    if (unplayedGames.length === 0) return;
    setIsSpinning(true);
    setGachaResult(null);

    // 演出のため少し待ってから結果を出す
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * unplayedGames.length);
      setGachaResult(unplayedGames[randomIndex]);
      setIsSpinning(false);
    }, 1200);
  };

  const top10 = [...games]
    .filter(game => game.playtimeHours > 0)
    .sort((a, b) => b.playtimeHours - a.playtimeHours)
    .slice(0, 10);

  // 各ゲームの総合スコアを計算(簡易版:プレイ時間 + 実績解除率)
  const calculateScore = (game) => {
    const ach = achievements[game.appId];
    const achievementRate = ach && ach.hasAchievements ? ach.unlockRate : 0;

    // プレイ時間スコア(対数化して頭打ちにする、0〜100点)
    const playtimeScore = Math.min(100, Math.log10(game.playtimeHours * 60 + 1) * 20);

    // 実績解除率スコアはそのまま0〜100
    const achievementScore = achievementRate;

    // 重み付け合成(暫定:プレイ時間0.5、実績0.5)
    const totalScore = playtimeScore * 0.5 + achievementScore * 0.5;

    return Math.round(totalScore * 10) / 10;
  };

  // 総合スコアランキング(プレイ時間があるゲームのみ対象)
  const scoreRanking = [...games]
    .filter(game => game.playtimeHours > 0)
    .map(game => ({
      ...game,
      score: calculateScore(game)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const showRanking = !search && sortBy === 'playtime-desc';

  return (
    <div className="container">
      <header>
        {profile && (
          <div className="profile-bar">
            <img src={profile.avatarUrl} alt={profile.displayName} className="profile-avatar" />
            <div className="profile-text">
              <span className="profile-name">{profile.displayName}</span>
              <span className="profile-sub">Steam ライブラリダッシュボード</span>
            </div>
          </div>
        )}
        <h1>🎮 Steam ライブラリ</h1>
        <div className="stats">
          <div className="stat-card">
            <span className="stat-number">{games.length}</span>
            <span className="stat-label">所持ゲーム数</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{Math.round(totalHours)}</span>
            <span className="stat-label">総プレイ時間(h)</span>
          </div>
        </div>
        {achievementsLoading && (
          <p className="achievements-status">実績データを取得中...(少し時間がかかります)</p>
        )}
      </header>

      <div className="controls">
        <input
          type="text"
          placeholder="ゲームを検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-box"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="sort-select"
        >
          <option value="playtime-desc">プレイ時間が多い順</option>
          <option value="playtime-asc">プレイ時間が少ない順</option>
          <option value="name-asc">名前順(A→Z)</option>
          <option value="name-desc">名前順(Z→A)</option>
        </select>
        <button
          className={`toggle-btn ${showUnplayed ? 'active' : ''}`}
          onClick={() => setShowUnplayed(!showUnplayed)}
        >
          未プレイ({unplayedCount})を{showUnplayed ? '隠す' : '表示'}
        </button>
      </div>

      {showRanking && (
        <div className="ranking-section">
          <h2>🏆 プレイ時間 TOP10</h2>
          <div className="ranking-list">
            {top10.map((game, index) => (
              <div key={game.appId} className={`ranking-item rank-${index + 1}`}>
                <span className="rank-number">{index + 1}</span>
                <img src={game.iconUrl} alt={game.name} className="game-icon" />
                <div className="game-info">
                  <p className="game-name">{game.name}</p>
                </div>
                <p className="game-time">{game.playtimeHours}h</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRanking && (
        <div className="ranking-section">
          <h2>⭐ 総合スコアランキング(β版)</h2>
          <p className="ranking-description">
            プレイ時間と実績解除率をもとに算出したスコアのランキングです。長く遊んでいるだけでなく、実績もしっかり解除しているゲームほど上位に来ます。
          </p>
          <div className="ranking-list">
            {scoreRanking.map((game, index) => (
              <div key={game.appId} className={`ranking-item rank-${index + 1}`}>
                <span className="rank-number">{index + 1}</span>
                <img src={game.iconUrl} alt={game.name} className="game-icon" />
                <div className="game-info">
                  <p className="game-name">{game.name}</p>
                </div>
                <p className="game-time">スコア {game.score}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {unplayedGames.length > 0 && (
        <div className="unplayed-section">
          <h2>📦 積みゲー一覧({unplayedGames.length}本)</h2>
          <p className="ranking-description">
            買ったままプレイできていないゲームです。気分転換に何か1本始めてみませんか?
          </p>

          <div className="gacha-box">
            <button
              className="gacha-btn"
              onClick={spinGacha}
              disabled={isSpinning}
            >
              {isSpinning ? '抽選中...' : '🎰 積みゲーガチャを回す'}
            </button>
            {gachaResult && !isSpinning && (
              <div className="gacha-result">
                <img src={gachaResult.iconUrl} alt={gachaResult.name} className="gacha-icon" />
                <p className="gacha-name">今日はこれをプレイ!</p>
                <p className="gacha-game-name">{gachaResult.name}</p>
              </div>
            )}
          </div>

          <div className="game-grid">
            {unplayedGames.map(game => (
              <div key={game.appId} className="game-card unplayed-card">
                <img src={game.iconUrl} alt={game.name} className="game-icon" />
                <div className="game-info">
                  <p className="game-name">{game.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="game-grid">
        {filteredGames.map(game => {
          const ach = achievements[game.appId];
          return (
            <div key={game.appId} className="game-card">
              <img src={game.iconUrl} alt={game.name} className="game-icon" />
              <div className="game-info">
                <p className="game-name">{game.name}</p>
                {ach && ach.hasAchievements && (
                  <p className="game-achievement">実績 {ach.unlockRate}%</p>
                )}
              </div>
              <p className="game-time">{game.playtimeHours}h</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;