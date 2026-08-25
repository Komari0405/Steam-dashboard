import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('playtime-desc');

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
  }, []);

  if (loading) return <p className="loading">読み込み中...</p>;

  const filteredGames = games
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

  const top10 = [...games]
    .sort((a, b) => b.playtimeHours - a.playtimeHours)
    .slice(0, 10);

  const showRanking = !search && sortBy === 'playtime-desc';

  return (
    <div className="container">
      <header>
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

      <div className="game-grid">
        {filteredGames.map(game => (
          <div key={game.appId} className="game-card">
            <img src={game.iconUrl} alt={game.name} className="game-icon" />
            <div className="game-info">
              <p className="game-name">{game.name}</p>
            </div>
            <p className="game-time">{game.playtimeHours}h</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;