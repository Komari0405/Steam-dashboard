import { useState, useEffect } from 'react';
import './App.css';

const EXCLUDED_APP_IDS = [993090]; // Lossless Scaling

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
  const [friendRanking, setFriendRanking] = useState([]);
  const [friendRankingLoading, setFriendRankingLoading] = useState(true);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('mine'); // 'mine' or 'friends'
  const [hiddenAppIds, setHiddenAppIds] = useState(() => {
    try {
      const saved = localStorage.getItem('hiddenAppIds');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHiddenManager, setShowHiddenManager] = useState(false);
  const [anonymousShare, setAnonymousShare] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3000/api/games')
      .then(res => res.json())
      .then(data => {
        const filtered = data.games.filter(g => !EXCLUDED_APP_IDS.includes(g.appId));
        setGames(filtered);
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

    fetch('http://localhost:3000/api/friends/ranking')
      .then(res => res.json())
      .then(data => {
        setFriendRanking(data.ranking || []);
        setFriendRankingLoading(false);
      })
      .catch(err => {
        console.error(err);
        setFriendRankingLoading(false);
      });

    fetch('http://localhost:3000/api/wishlist/prices')
      .then(res => res.json())
      .then(data => {
        setWishlistItems(data.items || []);
        setWishlistLoading(false);
      })
      .catch(err => {
        console.error(err);
        setWishlistLoading(false);
      });
  }, []);

  if (loading) return <p className="loading">読み込み中...</p>;

  const toggleHidden = (appId) => {
    setHiddenAppIds(prev => {
      const next = prev.includes(appId)
        ? prev.filter(id => id !== appId)
        : [...prev, appId];
      try {
        localStorage.setItem('hiddenAppIds', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const visibleGames = games.filter(g => !hiddenAppIds.includes(g.appId));
  const validFriends = friendRanking.filter(f => !f.error);
  const onSaleItems = wishlistItems.filter(item => item.discountPercent > 0);

  // 共有用データはvisibleGamesのみから作成(SteamIDやAPIキーなど個人特定情報は一切含めない)
  const shareTop3 = [...visibleGames]
    .filter(g => g.playtimeHours > 0)
    .sort((a, b) => b.playtimeHours - a.playtimeHours)
    .slice(0, 3);

  // フレンドとの合計プレイ時間比較(自分を含めた全員を降順に並べて順位・差分を出す)
  const playtimeRankAll = [...validFriends]
    .filter(f => f.totalPlaytimeHours != null)
    .sort((a, b) => b.totalPlaytimeHours - a.totalPlaytimeHours);

  const myRankIndex = playtimeRankAll.findIndex(f => f.displayName === 'あなた');
  const myPlaytimeRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  let rankDiffText = null;
  if (myRankIndex === 0 && playtimeRankAll.length > 1) {
    const diff = Math.round((playtimeRankAll[0].totalPlaytimeHours - playtimeRankAll[1].totalPlaytimeHours) * 10) / 10;
    rankDiffText = `フレンド内1位!2位との差 ${diff}時間`;
  } else if (myRankIndex > 0) {
    const diff = Math.round((playtimeRankAll[0].totalPlaytimeHours - playtimeRankAll[myRankIndex].totalPlaytimeHours) * 10) / 10;
    rankDiffText = `フレンド内${myPlaytimeRank}位(1位との差 ${diff}時間)`;
  }

  // 自虐ネタ称号の判定(当てはまるもの全部表示)
  const badgeCandidates = [];
  const totalGamesCount = visibleGames.length;
  const totalPlaytimeAll = visibleGames.reduce((s, g) => s + g.playtimeHours, 0);
  const unplayedCountForBadge = visibleGames.filter(g => g.playtimeHours === 0).length;
  const recentPlayingCount = visibleGames.filter(g => g.playtimeRecentHours > 0).length;

  if (totalGamesCount > 0 && unplayedCountForBadge >= 10) {
    badgeCandidates.push({
      label: '📦 積みゲー王',
      desc: `未プレイのゲームが${unplayedCountForBadge}本もあります。積みゲーが10本以上でこの称号がつきます。`
    });
  }
  if (totalGamesCount > 0 && unplayedCountForBadge >= 20) {
    badgeCandidates.push({
      label: '🆕 積みゲー新規大量入荷',
      desc: `未プレイのゲームが${unplayedCountForBadge}本、もはや在庫状態です。20本以上でこの称号がつきます。`
    });
  }
  if (totalGamesCount > 0 && unplayedCountForBadge / totalGamesCount >= 0.15) {
    badgeCandidates.push({
      label: '🗂️ 積みゲーコレクター',
      desc: `所持ゲームの${Math.round((unplayedCountForBadge / totalGamesCount) * 100)}%が未プレイです。全体の15%以上が積みゲーだとこの称号がつきます。`
    });
  }
  if (totalGamesCount >= 10 && totalPlaytimeAll / totalGamesCount < 15) {
    badgeCandidates.push({
      label: '🦋 浮気性プレイヤー',
      desc: `1本あたりの平均プレイ時間が${Math.round(totalPlaytimeAll / totalGamesCount * 10) / 10}時間です。平均15時間未満だとこの称号がつきます。`
    });
  }
  if (totalGamesCount >= 15 && totalPlaytimeAll / totalGamesCount < 5) {
    badgeCandidates.push({
      label: '🐢 スロースターター',
      desc: `所持ゲームは${totalGamesCount}本もあるのに、1本あたりの平均プレイ時間はたった${Math.round(totalPlaytimeAll / totalGamesCount * 10) / 10}時間です。`
    });
  }
  if (shareTop3.length > 0 && totalPlaytimeAll > 0 && (shareTop3[0].playtimeHours / totalPlaytimeAll) >= 0.25) {
    badgeCandidates.push({
      label: '🎯 一点集中型',
      desc: `総プレイ時間の${Math.round((shareTop3[0].playtimeHours / totalPlaytimeAll) * 100)}%が「${shareTop3[0].name}」に集中しています。1本で25%以上占めるとこの称号がつきます。`
    });
  }
  if (shareTop3.length > 0 && shareTop3[0].playtimeHours >= 500) {
    badgeCandidates.push({
      label: '🎯 やり込み職人',
      desc: `「${shareTop3[0].name}」を${shareTop3[0].playtimeHours}時間プレイしています。1本で500時間以上でこの称号がつきます。`
    });
  }
  const achievementRates = visibleGames
    .map(g => achievements[g.appId])
    .filter(a => a && a.hasAchievements && a.totalCount > 0)
    .map(a => a.unlockRate);
  const avgAchievementRate = achievementRates.length > 0
    ? achievementRates.reduce((s, r) => s + r, 0) / achievementRates.length
    : null;
  if (avgAchievementRate !== null && avgAchievementRate < 40) {
    badgeCandidates.push({
      label: '🏳️ 実績投げ出しマン',
      desc: `平均実績解除率が${Math.round(avgAchievementRate * 10) / 10}%です。平均40%未満だとこの称号がつきます。`
    });
  }
  if (avgAchievementRate !== null && avgAchievementRate >= 60) {
    badgeCandidates.push({
      label: '🏆 実績マニア',
      desc: `平均実績解除率が${Math.round(avgAchievementRate * 10) / 10}%です。平均60%以上でこの称号がつきます。`
    });
  }
  const perfectGamesCount = visibleGames
    .map(g => achievements[g.appId])
    .filter(a => a && a.hasAchievements && a.totalCount > 0 && a.unlockRate >= 100).length;
  if (perfectGamesCount >= 1) {
    badgeCandidates.push({
      label: '💯 パーフェクショニスト',
      desc: `実績を100%解除したゲームが${perfectGamesCount}本あります。`
    });
  }
  if (onSaleItems.length >= 1) {
    badgeCandidates.push({
      label: '🛒 セール戦士(まだ買ってない)',
      desc: `ウィッシュリストに入っている${onSaleItems.length}本がセール中なのに、まだ買っていません。`
    });
  }
  if (wishlistItems.length > 0 && onSaleItems.length / wishlistItems.length >= 0.3) {
    badgeCandidates.push({
      label: '💰 セールに弱い',
      desc: `ウィッシュリストの${Math.round((onSaleItems.length / wishlistItems.length) * 100)}%が今セール中です。買うタイミングを逃しがちかも?`
    });
  }
  if (totalGamesCount >= 50) {
    badgeCandidates.push({
      label: '🛍️ コレクター気質',
      desc: `所持ゲームが${totalGamesCount}本あります。50本以上でこの称号がつきます。`
    });
  }
  if (totalGamesCount >= 100) {
    badgeCandidates.push({
      label: '🕹️ ゲームコレクター',
      desc: `所持ゲームが${totalGamesCount}本、もはやコレクションです。100本以上でこの称号がつきます。`
    });
  }
  if (recentPlayingCount >= 1) {
    badgeCandidates.push({
      label: '🔥 今が旬',
      desc: `直近2週間でプレイしているゲームが${recentPlayingCount}本あります。今まさに遊んでいる証拠です。`
    });
  }
  if (myPlaytimeRank === 1) {
    badgeCandidates.push({
      label: '👑 フレンド内No.1ゲーマー',
      desc: 'フレンド内で合計プレイ時間が最も長いです。'
    });
  }

  const myBadges = badgeCandidates;


  const generateShareText = () => {
    const name = anonymousShare ? '匿名プレイヤー' : (profile ? profile.displayName : 'プレイヤー');
    const lines = [
      `${name}のSteamライブラリ`,
      `所持ゲーム数: ${visibleGames.length}本`,
      `総プレイ時間: ${Math.round(visibleGames.reduce((s, g) => s + g.playtimeHours, 0))}時間`,
    ];
    if (rankDiffText) {
      lines.push(rankDiffText);
    }
    if (myBadges.length > 0) {
      lines.push(`称号: ${myBadges.map(b => b.label).join(' / ')}`);
    }
    lines.push('');
    lines.push('【プレイ時間TOP3】');
    lines.push(...shareTop3.map((g, i) => `${i + 1}位 ${g.name} (${g.playtimeHours}h)`));
    return lines.join('\n');
  };

  const shareToX = () => {
    const text = generateShareText();
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadShareImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');

    // 背景
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#2a475e');
    gradient.addColorStop(1, '#1b2838');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // タイトル
    const name = anonymousShare ? '匿名プレイヤー' : (profile ? profile.displayName : 'プレイヤー');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(`${name}のSteamライブラリ`, 40, 60);

    // 統計
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#66c0f4';
    const total = Math.round(visibleGames.reduce((s, g) => s + g.playtimeHours, 0));
    ctx.fillText(`所持ゲーム数: ${visibleGames.length}本  /  総プレイ時間: ${total}時間`, 40, 110);

    let extraLineOffset = 0;
    if (rankDiffText) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(rankDiffText, 40, 140);
      extraLineOffset += 25;
    }
    if (myBadges.length > 0) {
      ctx.fillStyle = '#c7d5e0';
      ctx.font = '16px sans-serif';
      ctx.fillText(`称号: ${myBadges.map(b => b.label).join(' / ')}`, 40, 140 + extraLineOffset);
      extraLineOffset += 25;
    }

    // 区切り線(順位・称号表示がある場合は少し下にずらす)
    const lineY = 140 + extraLineOffset + (extraLineOffset > 0 ? 25 : 0);
    ctx.strokeStyle = '#3a5a75';
    ctx.beginPath();
    ctx.moveTo(40, lineY);
    ctx.lineTo(760, lineY);
    ctx.stroke();

    // TOP3見出し
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('プレイ時間 TOP3', 40, lineY + 50);

    // TOP3リスト
    const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
    shareTop3.forEach((g, i) => {
      const y = lineY + 100 + i * 70;
      ctx.fillStyle = medalColors[i] || '#66c0f4';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`${i + 1}`, 40, y);

      ctx.fillStyle = '#ffffff';
      ctx.font = '22px sans-serif';
      const displayName = g.name.length > 28 ? g.name.slice(0, 28) + '…' : g.name;
      ctx.fillText(displayName, 90, y);

      ctx.fillStyle = '#66c0f4';
      ctx.font = '18px sans-serif';
      ctx.fillText(`${g.playtimeHours}h`, 700, y);
    });

    // フッター
    ctx.fillStyle = '#6b7785';
    ctx.font = '14px sans-serif';
    ctx.fillText('Steam Dashboard', 40, 470);

    const link = document.createElement('a');
    link.download = 'steam-library-share.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };



  const filteredGames = visibleGames
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

  const totalHours = visibleGames.reduce((sum, g) => sum + g.playtimeHours, 0);
  const unplayedCount = visibleGames.filter(g => g.playtimeHours === 0).length;
  const unplayedGames = visibleGames.filter(g => g.playtimeHours === 0);

  const recentTop3 = [...visibleGames]
    .filter(g => g.playtimeRecentHours > 0)
    .sort((a, b) => b.playtimeRecentHours - a.playtimeRecentHours)
    .slice(0, 3);

  const spinGacha = () => {
    if (unplayedGames.length === 0) return;
    setIsSpinning(true);
    setGachaResult(null);

    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * unplayedGames.length);
      setGachaResult(unplayedGames[randomIndex]);
      setIsSpinning(false);
    }, 1200);
  };

  const top10 = [...visibleGames]
    .filter(game => game.playtimeHours > 0)
    .sort((a, b) => b.playtimeHours - a.playtimeHours)
    .slice(0, 10);

  const calculateScore = (game) => {
    const ach = achievements[game.appId];
    const achievementRate = ach && ach.hasAchievements ? ach.unlockRate : 0;

    const playtimeScore = Math.min(100, Math.log10(game.playtimeHours * 60 + 1) * 20);
    const achievementScore = achievementRate;
    const totalScore = playtimeScore * 0.5 + achievementScore * 0.5;

    return Math.round(totalScore * 10) / 10;
  };

  const scoreRanking = [...visibleGames]
    .filter(game => game.playtimeHours > 0)
    .map(game => ({
      ...game,
      score: calculateScore(game)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const showRanking = !search && sortBy === 'playtime-desc';

  const friendTotalPlaytimeRanking = [...validFriends]
    .filter(f => f.totalPlaytimeHours > 0)
    .sort((a, b) => b.totalPlaytimeHours - a.totalPlaytimeHours)
    .slice(0, 10);

  const friendTopGameRanking = [...validFriends]
    .filter(f => f.topGame)
    .sort((a, b) => b.topGame.playtimeHours - a.topGame.playtimeHours)
    .slice(0, 10);

  const friendTopScoreRanking = [...validFriends]
    .filter(f => f.topScoreGame)
    .sort((a, b) => b.topScoreGame.score - a.topScoreGame.score)
    .slice(0, 10);

  const friendTopRecentRanking = [...validFriends]
    .filter(f => f.topRecentGame)
    .sort((a, b) => b.topRecentGame.recentHours - a.topRecentGame.recentHours)
    .slice(0, 10);

  return (
    <div className="container">
      <header>
        <p className="eyebrow">Steam ライブラリ</p>
        <div className="identity-row">
          {profile && (
            <img src={profile.avatarUrl} alt={profile.displayName} className="profile-avatar" />
          )}
          <h1 className="player-name">{profile ? profile.displayName : 'プレイヤー'}</h1>
        </div>
        <div className="stat-line">
          <div className="stat-block">
            <span className="stat-value">{visibleGames.length}</span>
            <span className="stat-label">所持ゲーム</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-block">
            <span className="stat-value">{Math.round(totalHours)}</span>
            <span className="stat-label">総プレイ時間(h)</span>
          </div>
        </div>
        {myBadges.length > 0 && (
          <div className="home-badges">
            {myBadges.map(badge => (
              <span key={badge.label} className="tag-badge" title={badge.desc}>{badge.label}</span>
            ))}
          </div>
        )}
        {achievementsLoading && (
          <p className="status-text">実績データを取得中(少し時間がかかります)</p>
        )}
      </header>

      <div className="hidden-manager-toggle">
        <button
          className="hidden-manager-btn"
          onClick={() => setShowHiddenManager(!showHiddenManager)}
        >
          非表示ゲーム管理{hiddenAppIds.length > 0 ? `(${hiddenAppIds.length}件非表示中)` : ''}
        </button>
      </div>

      {showHiddenManager && (
        <div className="hidden-manager-panel">
          <p className="ranking-description">
            チェックを入れたゲームは、一覧・ランキング・積みゲーなど全ての表示から除外されます(設定はこのブラウザに保存されます)。
          </p>
          <div className="hidden-manager-list">
            {games.map(game => (
              <label key={game.appId} className="hidden-manager-item">
                <input
                  type="checkbox"
                  checked={hiddenAppIds.includes(game.appId)}
                  onChange={() => toggleHidden(game.appId)}
                />
                <img
                  src={game.iconUrl}
                  alt={game.name}
                  className="hidden-manager-icon"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="hidden-manager-name">{game.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'mine' ? 'active' : ''}`}
          onClick={() => setActiveTab('mine')}
        >
          マイライブラリ
        </button>
        <button
          className={`tab-btn ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          フレンド
        </button>
      </div>

      {activeTab === 'mine' && (
        <>
          <div className="share-section">
            <h2>実績をシェア</h2>
            <p className="ranking-description">
              所持ゲーム数・総プレイ時間・TOP3ゲームだけをシェアします(SteamIDやプロフィールURLなどの個人情報は含まれません)。
            </p>
            <label className="share-anon-toggle">
              <input
                type="checkbox"
                checked={anonymousShare}
                onChange={(e) => setAnonymousShare(e.target.checked)}
              />
              匿名で共有する(名前・アイコンを表示しない)
            </label>

            <div className="share-preview">
              <p className="share-preview-name">
                {anonymousShare ? '匿名プレイヤー' : (profile ? profile.displayName : 'プレイヤー')}のSteamライブラリ
              </p>
              <p className="share-preview-stats">
                所持ゲーム数: {visibleGames.length}本 / 総プレイ時間: {Math.round(visibleGames.reduce((s, g) => s + g.playtimeHours, 0))}時間
              </p>
              {rankDiffText && (
                <p className="share-preview-rank">{rankDiffText}</p>
              )}
              {myBadges.length > 0 && (
                <div className="share-preview-badges">
                  {myBadges.map(badge => (
                    <span key={badge.label} className="tag-badge" title={badge.desc}>{badge.label}</span>
                  ))}
                </div>
              )}
              <div className="share-preview-top3">
                {shareTop3.map((g, i) => (
                  <span key={g.appId} className="share-preview-item">
                    {i + 1}位 {g.name}({g.playtimeHours}h)
                  </span>
                ))}
              </div>
            </div>

            <div className="share-buttons">
              <button className="share-btn share-btn-x" onClick={shareToX}>
                Xでシェア
              </button>
              <button className="share-btn share-btn-image" onClick={downloadShareImage}>
                画像を保存
              </button>
            </div>
          </div>

          {recentTop3.length > 0 && (
            <div className="recent-section">
              <h2>最近よくプレイしているゲーム</h2>
              <div className="recent-grid">
                {recentTop3.map(game => (
                  <div key={game.appId} className="recent-card">
                    <img
                      src={game.iconUrl}
                      alt={game.name}
                      className="recent-icon"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <p className="recent-name">{game.name}</p>
                    <p className="recent-hours">直近2週間で{game.playtimeRecentHours}h</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!wishlistLoading && onSaleItems.length > 0 && (
            <div className="sale-section">
              <h2>ウィッシュリストのセール情報({onSaleItems.length}件)</h2>
              <p className="ranking-description">
                ウィッシュリストに入っているゲームで、現在セール中のものです。
              </p>
              <div className="sale-grid">
                {onSaleItems.map(item => (
                  <a
                    key={item.appId}
                    href={`https://store.steampowered.com/app/${item.appId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sale-card"
                  >
                    <img
                      src={item.iconUrl}
                      alt={item.name}
                      className="sale-icon"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="sale-info">
                      <p className="sale-name">{item.name}</p>
                      <div className="sale-price-row">
                        <span className="sale-discount">-{item.discountPercent}%</span>
                        <span className="sale-original-price">¥{item.originalPrice.toLocaleString()}</span>
                        <span className="sale-current-price">¥{item.currentPrice.toLocaleString()}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {!wishlistLoading && onSaleItems.length === 0 && wishlistItems.length > 0 && (
            <p className="status-text">現在セール中のウィッシュリスト商品はありません。</p>
          )}

          {wishlistLoading && (
            <p className="status-text">ウィッシュリストのセール情報を確認中...</p>
          )}

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
              <h2>プレイ時間 TOP10</h2>
              <div className="ranking-list">
                {top10.map((game, index) => (
                  <div key={game.appId} className={`ranking-item rank-${index + 1}`}>
                    <span className="rank-number">{index + 1}</span>
                    <img
                      src={game.iconUrl}
                      alt={game.name}
                      className="game-icon"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
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
              <h2>総合スコアランキング(β版)</h2>
              <p className="ranking-description">
                プレイ時間と実績解除率をもとに算出したスコアのランキングです。長く遊んでいるだけでなく、実績もしっかり解除しているゲームほど上位に来ます。
              </p>
              <div className="ranking-list">
                {scoreRanking.map((game, index) => (
                  <div key={game.appId} className={`ranking-item rank-${index + 1}`}>
                    <span className="rank-number">{index + 1}</span>
                    <img
                      src={game.iconUrl}
                      alt={game.name}
                      className="game-icon"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
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
              <h2>積みゲー一覧({unplayedGames.length}本)</h2>
              <p className="ranking-description">
                買ったままプレイできていないゲームです。気分転換に何か1本始めてみませんか?
              </p>

              <div className="gacha-box">
                <button
                  className="gacha-btn"
                  onClick={spinGacha}
                  disabled={isSpinning}
                >
                  {isSpinning ? '抽選中...' : '積みゲーガチャを回す'}
                </button>
                {gachaResult && !isSpinning && (
                  <div className="gacha-result">
                    <img src={gachaResult.iconUrl} alt={gachaResult.name} className="gacha-icon" />
                    <p className="gacha-label">今日はこれをプレイ!</p>
                    <p className="gacha-game-name">{gachaResult.name}</p>
                  </div>
                )}
              </div>

              <div className="game-grid">
                {unplayedGames.map(game => (
                  <div key={game.appId} className="game-card unplayed-card">
                    <img
                      src={game.iconUrl}
                      alt={game.name}
                      className="game-icon"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
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
                  <img
                    src={game.iconUrl}
                    alt={game.name}
                    className="game-icon"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
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
        </>
      )}

      {activeTab === 'friends' && (
        <div className="friend-ranking-block">
          <h2 className="friend-ranking-title">フレンドランキング</h2>
          <p className="ranking-note">※ Lossless Scalingはランキングから除外しています</p>
          {friendRankingLoading && (
            <p className="status-text">フレンドのデータを取得中...(少し時間がかかります)</p>
          )}

          {!friendRankingLoading && (
            <>
              <div className="ranking-section">
                <h3>合計プレイ時間ランキング</h3>
                <p className="ranking-description">
                  所持ゲーム全体の合計プレイ時間で比較したフレンドランキングです。
                </p>
                <div className="ranking-list">
                  {friendTotalPlaytimeRanking.map((friend, index) => (
                    <div key={friend.steamId} className={`ranking-item rank-${index + 1}`}>
                      <span className="rank-number">{index + 1}</span>
                      {friend.avatarUrl && (
                        <img
                          src={friend.avatarUrl}
                          alt={friend.displayName}
                          className="game-icon friend-avatar"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                      <div className="game-info">
                        <p className="game-name">{friend.displayName}</p>
                      </div>
                      <p className="game-time">{friend.totalPlaytimeHours}h</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ranking-section">
                <h3>一番遊んでるゲーム ランキング</h3>
                <p className="ranking-description">
                  それぞれのフレンドが一番長くプレイしているゲームのプレイ時間で比較したランキングです。
                </p>
                <div className="ranking-list">
                  {friendTopGameRanking.map((friend, index) => (
                    <div key={friend.steamId} className={`ranking-item rank-${index + 1}`}>
                      <span className="rank-number">{index + 1}</span>
                      <img
                        src={friend.topGame.iconUrl}
                        alt={friend.topGame.name}
                        className="game-icon"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div className="game-info">
                        <p className="game-name">{friend.displayName} - {friend.topGame.name}</p>
                      </div>
                      <p className="game-time">{friend.topGame.playtimeHours}h</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ranking-section">
                <h3>一番スコアが高いゲーム ランキング</h3>
                <p className="ranking-description">
                  それぞれのフレンドが持つゲームの中で、一番スコアが高い1本同士で比較したランキングです。
                </p>
                <div className="ranking-list">
                  {friendTopScoreRanking.map((friend, index) => (
                    <div key={friend.steamId} className={`ranking-item rank-${index + 1}`}>
                      <span className="rank-number">{index + 1}</span>
                      <img
                        src={friend.topScoreGame.iconUrl}
                        alt={friend.topScoreGame.name}
                        className="game-icon"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div className="game-info">
                        <p className="game-name">{friend.displayName} - {friend.topScoreGame.name}</p>
                      </div>
                      <p className="game-time">スコア {friend.topScoreGame.score}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ranking-section">
                <h3>直近でよく遊んでいるゲーム ランキング</h3>
                <p className="ranking-description">
                  直近2週間のプレイ時間が長いゲームで比較したランキングです。今よく遊ばれているゲームが分かります。
                </p>
                <div className="ranking-list">
                  {friendTopRecentRanking.map((friend, index) => (
                    <div key={friend.steamId} className={`ranking-item rank-${index + 1}`}>
                      <span className="rank-number">{index + 1}</span>
                      <img
                        src={friend.topRecentGame.iconUrl}
                        alt={friend.topRecentGame.name}
                        className="game-icon"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div className="game-info">
                        <p className="game-name">{friend.displayName} - {friend.topRecentGame.name}</p>
                      </div>
                      <p className="game-time">{friend.topRecentGame.recentHours}h</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;