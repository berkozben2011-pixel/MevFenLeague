/* =========================================================
   ÇARŞAMBA LİGİ — TFF FANTEZİ LİG UYGULAMASI
   ========================================================= */

/* ---------------- Sabitler ---------------- */
const SUPABASE_URL = 'https://ivchraeubgpmwvfmknjz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_M4k9fJUvd8gC0dsGRGKY0w_q5J5qZu7';

const HOST_USERNAME = 'Berk9320';
const HOST_PASSWORD = 'Berk2011+';

const DEFAULT_PLAYERS = [
  'Berk ÖZBEN', 'Koray MİRALAY', 'Erdoğan Kerem TAŞDELEN', 'Yankı YAŞAR',
  'Olcay Rüzgar TUFAN', 'Can Burak ULUSOY', 'Kaan ETLİOĞLU', 'Eren Arda TURAN',
  'Atakan KÖROĞLU', 'Umut AKILLIGİL', 'Demir ÇİĞDEMOĞLU', 'Kemal Demir SÖKEL',
  'Ahmet Kağan KAVALCI', 'Demir KANDEMİR'
];

const AVATAR_COLORS = [
  '#1E7145', '#A50044', '#1B2A4A', '#E8A62B', '#2F8F5B', '#8E3B46',
  '#3E5C76', '#C4622D', '#4B6B3A', '#7A3E8E', '#2A7A8C', '#B5482F',
  '#5B7A4F', '#6B4E9A'
];

/* ---------------- Oturum Mantığı ---------------- */
let currentUser = JSON.parse(localStorage.getItem('fantasy_user')) || null;

function isHost() {
  return currentUser && currentUser.username === HOST_USERNAME;
}

function logout() {
  currentUser = null;
  localStorage.removeItem('fantasy_user');
  render();
  toast('Çıkış yapıldı');
}

/* ---------------- Yardımcılar ---------------- */
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDateTime(isoStr) {
  if (!isoStr) return 'Belirlenmedi';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ---------------- Supabase & State ---------------- */
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let supabaseReady = false;
let saving = false;

function buildDefaultState() {
  return {
    version: 3,
    users: [],
    teamNames: { A: 'Barcelona', B: 'Real Madrid' },
    players: DEFAULT_PLAYERS.map((name, i) => ({
      id: 'p' + (i + 1),
      name,
      photo: null,
      color: AVATAR_COLORS[i % AVATAR_COLORS.length],
      squadNumber: i + 1,
      price: 10
    })),
    weeks: [{
      id: 'w1',
      weekNumber: 1,
      matchDate: '',
      playerPoints: {},
      playerWeeklyStats: {},
      lineup: [],
      score: { A: 0, B: 0, entered: false }
    }],
    totw: {},
    potw: {},
    lineups: {},
    userSquads: {},
    predictions: {},
    nextWeekNumber: 2
  };
}

let state = buildDefaultState();

async function saveState() {
  if (!supabaseReady) return;
  saving = true;
  updateSyncBadge();
  try {
    const { error } = await sb.from('app_state').upsert({
      id: 1, 
      data: state, 
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  } catch (e) {
    console.error('Veri kaydedilemedi:', e);
    toast('Kaydedilemedi — bağlantınızı kontrol edin');
  }
  saving = false;
  updateSyncBadge();
}

function applyLoadedCoreState(loaded) {
  if (!loaded) return;
  state.users = loaded.users || [];
  state.teamNames = loaded.teamNames || state.teamNames;

  if (Array.isArray(loaded.weeks) && loaded.weeks.length > 0) {
    state.weeks = loaded.weeks.map(w => ({
      ...w,
      playerWeeklyStats: w.playerWeeklyStats || {}
    }));
  } else if (!state.weeks || state.weeks.length === 0) {
    state.weeks = [{
      id: 'w1',
      weekNumber: 1,
      matchDate: '',
      playerPoints: {},
      playerWeeklyStats: {},
      lineup: [],
      score: { A: 0, B: 0, entered: false }
    }];
  }

  state.totw = loaded.totw || {};
  state.potw = loaded.potw || {};
  state.lineups = loaded.lineups || {};
  state.predictions = loaded.predictions || {};
  state.nextWeekNumber =
    Number(loaded.nextWeekNumber) ||
    (state.weeks.length
      ? Math.max(...state.weeks.map(w => Number(w.weekNumber) || 0)) + 1
      : 2);

  state.userSquads = loaded.userSquads || {};
  if (loaded.players && loaded.players.length) {
    const photoMap = {};
    state.players.forEach(p => { photoMap[p.id] = p.photo; });
    state.players = loaded.players.map(lp => ({ 
      ...lp, 
      photo: photoMap[lp.id] || null,
      price: lp.price !== undefined ? lp.price : 10
    }));
  }
}

async function loadAllPhotosOnce() {
  if (!supabaseReady) return;
  try {
    const { data } = await sb.from('player_photos').select('player_id, photo');
    (data || []).forEach(row => {
      const p = getPlayer(row.player_id);
      if (p) p.photo = row.photo;
    });
  } catch (e) { console.error(e); }
}

function updateSyncBadge() {
  const el = document.getElementById('syncBadge');
  if (el) el.textContent = saving ? '⏳' : '✓';
}

async function refreshFromServer() {
  if (!supabaseReady) return;
  toast('Yenileniyor…');
  try {
    const { data } = await sb.from('app_state').select('data').eq('id', 1).single();
    if (data) applyLoadedCoreState(data.data);
  } catch (e) { console.error(e); }
  await loadAllPhotosOnce();
  render();
  toast('Güncel veriler yüklendi');
}

async function initApp() {
  try {
    const { data } = await sb.from('app_state').select('data').eq('id', 1).single();
    if (data && data.data) {
      applyLoadedCoreState(data.data);
    } else {
      supabaseReady = true;
      await saveState();
    }
    supabaseReady = true;
    await loadAllPhotosOnce();
    render();

    sb.channel('app_state_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (payload) => {
        if (payload.new && payload.new.data) {
          applyLoadedCoreState(payload.new.data);
          render();
        }
      }).subscribe();
  } catch (e) { console.error(e); }
}

/* ---------------- Veri Hesaplama & Erişim ---------------- */
function getPlayer(id) { return state.players.find(p => p.id === id); }
function getSortedWeeks() { return [...state.weeks].sort((a, b) => a.weekNumber - b.weekNumber); }
function getWeek(id) { return state.weeks.find(w => w.id === id); }
function latestWeek() {
  const sorted = getSortedWeeks();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

function getPlayerTotalStats(playerId) {
  let goals = 0;
  let assists = 0;
  state.weeks.forEach(w => {
    const st = w.playerWeeklyStats?.[playerId];
    if (st) {
      goals += Number(st.goals || 0);
      assists += Number(st.assists || 0);
    }
  });
  return { goals, assists };
}

/* ---------------- Toast & Modal ---------------- */
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toastEl');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'toastEl';
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

function closeSheet() {
  // Açık 3D model görüntüleyicileri varsa (sheet kapanınca DOM'dan silinecekleri için) düzgünce temizle
  if (window._glbViewers) {
    Object.keys(window._glbViewers).forEach((pid) => disposeGlbViewer(pid));
  }
  const ov = document.getElementById('overlayEl');
  if (ov) ov.remove();
}

function openSheet(innerHTML) {
  closeSheet();
  const ov = document.createElement('div');
  ov.id = 'overlayEl';
  ov.className = 'overlay';
  ov.onclick = (e) => { if (e.target === ov) closeSheet(); };
  ov.innerHTML = `
    <div class="sheet">
      <button class="sheet-close" onclick="closeSheet()">✕</button>
      <div class="sheet-handle"></div>
      ${innerHTML}
    </div>`;
  document.body.appendChild(ov);
}

/* ---------------- UI Render Yardımcıları ---------------- */
function avatarHTML(player) {
  if (!player) return `<div class="avatar" style="background:#256E48;">?</div>`;
  const style = player.photo 
    ? `background-image:url('${player.photo}'); background-size:contain; background-repeat:no-repeat; background-position:center; border-radius:8px;` 
    : `background:${player.color}; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold;`;
  return `<div class="avatar" style="${style}">${player.photo ? '' : initials(player.name)}</div>`;
}

function miniAvatarHTML(player) {
  if (!player) return `<div class="mini-avatar" style="background:#256E48;">?</div>`;
  const style = player.photo 
    ? `background-image:url('${player.photo}'); background-size:contain; background-repeat:no-repeat; background-position:center; border-radius:6px;` 
    : `background:${player.color}; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold;`;
  return `<div class="mini-avatar" style="${style}">${player.photo ? '' : initials(player.name)}</div>`;
}

function topbarHTML(title, backHash) {
  return `
  <div class="topbar">
    <button class="backbtn" onclick="go('${backHash || '#/home'}')">⟵ Geri</button>
    <div class="pagetitle">${escapeHtml(title)}</div>
    <button class="backbtn" onclick="refreshFromServer()">🔄 <span id="syncBadge">✓</span></button>
  </div>`;
}

/* ---------------- Router ---------------- */
window.addEventListener('hashchange', () => { if (supabaseReady) render(); });
initApp();

function go(hash) { window.location.hash = hash; }

function render() {
  if (!currentUser) {
    return renderAuthScreen();
  }
  const hash = window.location.hash || '#/home';
  const [, path, param] = hash.match(/^#\/([a-zA-Z]+)(?:\/(.+))?$/) || [null, 'home', null];
  window.scrollTo(0, 0);

  switch (path) {
    case 'home': return renderHome();
    case 'fantasysquad': return renderFantasySquad(param);
    case 'leaderboard': return renderLeaderboard();
    case 'hostpanel': return renderHostPanel(param);
    case 'players': return renderPlayers();
    case 'goals': return renderStatsRanking('goals');
    case 'assists': return renderStatsRanking('assists');
    case 'totw': return renderTOTW(param);
    case 'potw': return renderPOTW(param);
    case 'lineups': return renderLineups(param);
    case 'predictions': return renderPredictions(param);
    default: return renderHome();
  }
}

/* =========================================================
   1. GİRİŞ & KAYIT EKRANI
   ========================================================= */
function renderAuthScreen() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page" style="max-width:380px;margin:40px auto;text-align:center;">
      <div style="font-size:3rem;margin-bottom:10px;">⚽</div>
      <h2>TFF FANTEZİ LİG</h2>
      <p style="color:var(--ink-soft);font-size:0.85rem;margin-bottom:20px;">Hoş geldiniz! Lütfen giriş türünü seçin.</p>
      
      <div class="card" style="margin-bottom:15px;">
        <button class="btn block" style="margin-bottom:10px;" onclick="showLoginForm('existing')">Geri Gelen Oyuncu</button>
        <button class="btn block secondary" onclick="showLoginForm('new')">Yeni Giriş (Kayıt Ol)</button>
      </div>
      
      <div id="authFormArea"></div>
    </div>`;
}

function showLoginForm(type) {
  const area = document.getElementById('authFormArea');
  if (type === 'new') {
    area.innerHTML = `
      <div class="card">
        <h3>Yeni Oyuncu Kaydı</h3>
        <input type="text" id="regUser" placeholder="Kullanıcı Adı" style="margin-top:10px;width:100%;">
        <input type="password" id="regPass" placeholder="Şifre" style="margin-top:10px;width:100%;">
        <button class="btn block" style="margin-top:14px;" onclick="handleRegister()">Hesap Oluştur ve Giriş Yap</button>
      </div>`;
  } else {
    area.innerHTML = `
      <div class="card">
        <h3>Oyuncu / Host Girişi</h3>
        <input type="text" id="loginUser" placeholder="Kullanıcı Adı" style="margin-top:10px;width:100%;">
        <input type="password" id="loginPass" placeholder="Şifre" style="margin-top:10px;width:100%;">
        <button class="btn block" style="margin-top:14px;" onclick="handleLogin()">Giriş Yap</button>
      </div>`;
  }
}

function handleRegister() {
  const u = document.getElementById('regUser').value.trim();
  const p = document.getElementById('regPass').value.trim();
  if (!u || !p) return toast('Lütfen tüm alanları doldurun');
  if (u === HOST_USERNAME) return toast('Bu kullanıcı adı kullanılamaz');
  if (state.users.find(x => x.username.toLowerCase() === u.toLowerCase())) {
    return toast('Bu kullanıcı adı zaten alınmış');
  }
  
  const newUser = { username: u, password: p };
  state.users.push(newUser);
  saveState();
  currentUser = newUser;
  localStorage.setItem('fantasy_user', JSON.stringify(currentUser));
  toast('Hesap oluşturuldu!');
  render();
}

function handleLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value.trim();
  
  if (u === HOST_USERNAME && p === HOST_PASSWORD) {
    currentUser = { username: HOST_USERNAME, isHost: true };
    localStorage.setItem('fantasy_user', JSON.stringify(currentUser));
    toast('Host girişi başarılı 👑');
    render();
    return;
  }
  
  const found = state.users.find(x => x.username.toLowerCase() === u.toLowerCase() && x.password === p);
  if (found) {
    currentUser = found;
    localStorage.setItem('fantasy_user', JSON.stringify(currentUser));
    toast('Giriş başarılı');
    render();
  } else {
    toast('Hatalı kullanıcı adı veya şifre');
  }
}

/* =========================================================
   2. ANA SAYFA
   ========================================================= */
function renderHome() {
  const app = document.getElementById('app');
  const w = latestWeek();
const potwData = (w && state.potw && state.potw[w.id]) || { playerId: null, note: '' };
const selectedPlayer = getPlayer(potwData.playerId);

  const matchDateText = w && w.matchDate ? formatDateTime(w.matchDate) : 'Henüz Tarih Girilmedi';

  app.innerHTML = `
    <div class="topbar" style="justify-content:space-between;">
      <div style="font-weight:bold;">👤 ${escapeHtml(currentUser.username)} ${isHost() ? '👑 (Host)' : ''}</div>
      <div>
        <button class="backbtn" onclick="refreshFromServer()">🔄 <span id="syncBadge">✓</span></button>
        <button class="backbtn" onclick="logout()" style="color:var(--red-card);">Çıkış</button>
      </div>
    </div>
    
    <div class="home-hero">
      <div class="eyebrow">TFF Fantezi Lig</div>
      <h1>HAFTANIN MAÇI</h1>
      <p style="color:#FFC125;font-weight:bold;margin-top:5px;">📅 Maç Günü: ${matchDateText}</p>
    </div>

    <div class="menu-grid">
      <div class="menu-card wide" onclick="go('#/lineups')">
        <div class="icon">🗒️</div>
        <div class="label">Bu Haftanın Kadroları</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card wide accent" onclick="go('#/fantasysquad')">
        <div class="icon">📋</div>
        <div class="label">7 Kişilik Kadronu Kur</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card wide" onclick="go('#/leaderboard')">
        <div class="icon">🏆</div>
        <div class="label">Puan Tablosu</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/players')">
        <div class="icon">👥</div>
        <div class="label">14 Futbolcu</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/goals')">
        <div class="icon">⚽</div>
        <div class="label">Gol Krallığı</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/assists')">
        <div class="icon">🅰️</div>
        <div class="label">Asist Krallığı</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/predictions')">
        <div class="icon">🔮</div>
        <div class="label">Tahmin</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/totw')">
        <div class="icon">🌟</div>
        <div class="label">Haftanın 6'sı</div>
        <div class="stripe"></div>
      </div>
      <div class="card" style="text-align:center; padding:24px 16px; background: linear-gradient(180deg, #FFFDF8 0%, #FFF3D1 100%); border: 2px solid #FFC125;">
  <div style="font-size: 2.5rem; margin-bottom: 6px;">👑</div>
  <div style="font-size:1.1rem; color:#8A6D0B; letter-spacing:0.1em; font-weight:bold;">HAFTANIN OYUNCUSU</div>
  <div style="margin: 14px auto; width:110px;">${avatarHTML(selectedPlayer)}</div>
  <h2 style="color:var(--ink); font-size: 2rem; margin-top:6px;">${selectedPlayer ? escapeHtml(selectedPlayer.name) : 'Henüz Seçilmedi'}</h2>
  ${potwData.note ? `<p style="color:var(--ink-soft); font-size:0.85rem; margin-top:6px;">${escapeHtml(potwData.note)}</p>` : ''}
</div>

      ${isHost() ? `
      <div class="menu-card wide" style="border: 2px solid #FFC125;" onclick="go('#/hostpanel')">
        <div class="icon">⚙️</div>
        <div class="label">Host Yönetim Paneli</div>
        <div class="stripe"></div>
      </div>` : ''}
    </div>
  `;
}

/* =========================================================
   3. FANTEZİ KADRO KURMA (7 KİŞİLİK)
   ========================================================= */
function renderFantasySquad(weekParam) {
  const weeks = getSortedWeeks();
  let week = weekParam ? getWeek(weekParam) : latestWeek();
  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `${topbarHTML('Kadro Kur')} <div class="page"><p>Henüz hafta tanımlanmadı.</p></div>`;
    return;
  }

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  const now = new Date();
  const matchDate = week.matchDate ? new Date(week.matchDate) : null;
  const isLocked = matchDate && !isNaN(matchDate.getTime()) && now >= matchDate;

  const squadKey = `${currentUser.username}_${week.id}`;
  const selectedIds = state.userSquads[squadKey] || [];

  let weekPointsEarned = 0;
  let totalValue = 0;
  selectedIds.forEach(id => {
    weekPointsEarned += Number(week.playerPoints?.[id] || 0);
    const p = getPlayer(id);
    if (p) totalValue += Number(p.price !== undefined ? p.price : 10);
  });

  const MAX_BUDGET = 100;
  const remainingBudget = MAX_BUDGET - totalValue;

  const selectedListHTML = selectedIds.map(id => {
    const p = getPlayer(id);
    if (!p) return '';
    const pts = week.playerPoints?.[id] ?? '-';
    const priceVal = p.price !== undefined ? p.price : 10;
    return `
      <div class="player-pick-row">
        ${miniAvatarHTML(p)}
        <div class="pname">${escapeHtml(p.name)} <span style="font-size:0.75rem; color:#888;">(${priceVal}M €)</span></div>
        <div style="font-weight:bold;margin-right:8px;">Puan: ${pts}</div>
        ${!isLocked ? `<button class="btn small danger" onclick="toggleSelectPlayer('${week.id}','${p.id}')">Çıkar</button>` : ''}
      </div>`;
  }).join('');

  const remainingPlayers = state.players.filter(p => !selectedIds.includes(p.id));
  const availableListHTML = remainingPlayers.map(p => {
    const priceVal = p.price !== undefined ? p.price : 10;
    return `
    <div class="player-pick-row">
      ${miniAvatarHTML(p)}
      <div class="pname">${escapeHtml(p.name)} <span style="font-size:0.75rem; color:#888;">(${priceVal}M €)</span></div>
      ${!isLocked ? `<button class="btn small" onclick="toggleSelectPlayer('${week.id}','${p.id}')">Ekle</button>` : ''}
    </div>`;
  }).join('');

  app.innerHTML = `
    ${topbarHTML('Kadro Kur')}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/fantasysquad/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/fantasysquad/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>

      <div class="card" style="text-align:center;margin-bottom:12px;">
        <div>Maç Zamanı: <b>${formatDateTime(week.matchDate)}</b></div>
        ${isLocked 
          ? `<div style="color:var(--red-card);font-weight:bold;margin-top:4px;">🔒 Kadrolar Kilitlendi (Süre Doldu)</div>` 
          : `<div style="color:var(--pitch);font-weight:bold;margin-top:4px;">🔓 Kadro Değişikliği Açık</div>`}
        <div style="font-size:1.1rem;font-weight:bold;margin-top:8px;">Bu Hafta Kazanılan Puan: ⭐ ${weekPointsEarned}</div>
      </div>

      <div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-size:0.8rem; color:var(--ink-soft);">Top. Kadro Değeri</div>
          <div style="font-weight:bold; font-size:1.1rem; color:${totalValue > MAX_BUDGET ? 'var(--red-card)' : 'var(--pitch)'};">
            ${totalValue}M € / 100M €
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.8rem; color:var(--ink-soft);">Kalan Bütçe</div>
          <div style="font-weight:bold; font-size:1.1rem; color:${remainingBudget < 0 ? 'var(--red-card)' : '#FFC125'};">
            ${remainingBudget}M €
          </div>
        </div>
      </div>

      <div class="section-title">Seçtiğin Kadro (${selectedIds.length} / 7)</div>
      <div class="card">${selectedListHTML || '<p style="color:var(--ink-soft);font-size:0.85rem;">Henüz futbolcu seçilmedi.</p>'}</div>

      ${!isLocked ? `
      <div class="section-title" style="margin-top:15px;">Seçebileceğin Futbolcular</div>
      <div class="card">${availableListHTML}</div>` : ''}
    </div>`;
}

function toggleSelectPlayer(weekId, playerId) {
  const squadKey = `${currentUser.username}_${weekId}`;
  let squad = [...(state.userSquads[squadKey] || [])];
  const targetPlayer = getPlayer(playerId);

  if (squad.includes(playerId)) {
    squad = squad.filter(id => id !== playerId);
  } else {
    if (squad.length >= 7) {
      toast('En fazla 7 futbolcu seçebilirsin!');
      return;
    }

    let currentTotal = 0;
    squad.forEach(id => {
      const p = getPlayer(id);
      if (p) currentTotal += Number(p.price !== undefined ? p.price : 10);
    });

    const targetPrice = Number(targetPlayer && targetPlayer.price !== undefined ? targetPlayer.price : 10);
    const newTotal = currentTotal + targetPrice;

    if (newTotal > 100) {
      toast(`Bütçe yetersiz! Kadro değeri 100M € sınırını aşamaz. (Gereken: ${newTotal}M €)`);
      return;
    }

    squad.push(playerId);
  }

  state.userSquads[squadKey] = squad;
  saveState();
  renderFantasySquad(weekId);
}

/* =========================================================
   4. PUAN TABLOSU (LEADERBOARD)
   ========================================================= */
function renderLeaderboard() {
  const app = document.getElementById('app');

  const userScores = state.users.map(u => {
    let totalScore = 0;
    state.weeks.forEach(w => {
      const squadKey = `${u.username}_${w.id}`;
      const squad = state.userSquads[squadKey] || [];
      squad.forEach(pid => {
        totalScore += Number(w.playerPoints?.[pid] || 0);
      });
      const tahminScore = (state.predictions && state.predictions[w.id] && state.predictions[w.id].scores)
        ? Number(state.predictions[w.id].scores[u.username] || 0)
        : 0;
      totalScore += tahminScore;
    });
    return { username: u.username, totalScore };
  });

  userScores.sort((a, b) => b.totalScore - a.totalScore);

  const rows = userScores.map((us, idx) => `
    <div class="rank-row" style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="width:30px;font-weight:bold;">${idx + 1}.</div>
      <div style="flex:1;font-weight:600;">${escapeHtml(us.username)}</div>
      <div style="font-weight:bold;color:#FFC125;font-size:1.1rem;">⭐ ${us.totalScore} Puan</div>
    </div>`).join('');

  app.innerHTML = `
    ${topbarHTML('Genel Puan Tablosu')}
    <div class="page">
      <div class="card">
        <div style="font-size:0.8rem;color:var(--ink-soft);margin-bottom:10px;">* Tüm haftaların toplam puan sıralamasıdır.</div>
        ${rows || '<p>Henüz kayıtlı oyuncu puanı yok.</p>'}
      </div>
    </div>`;
}

/* =========================================================
   5. HOST PANELİ
   ========================================================= */
function renderHostPanel(weekParam) {
  if (!isHost()) return renderHome();

  const weeks = getSortedWeeks();
  let week = weekParam ? getWeek(weekParam) : latestWeek();
  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `${topbarHTML('Host Paneli')} <div class="page"><p>Hafta bulunamadı</p></div>`;
    return;
  }

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  let dateInputValue = '';
  if (week.matchDate) {
    const d = new Date(week.matchDate);
    if (!isNaN(d.getTime())) {
      const pad = n => String(n).padStart(2, '0');
      dateInputValue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  const playerPointsRows = state.players.map(p => {
    const currentPts = week.playerPoints?.[p.id] ?? 0;
    const weeklyStat = (week.playerWeeklyStats && week.playerWeeklyStats[p.id]) || { goals: 0, assists: 0 };
    const goals = weeklyStat.goals || 0;
    const assists = weeklyStat.assists || 0;
    const priceVal = p.price !== undefined ? p.price : 10;

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #eee;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${miniAvatarHTML(p)}
          <span style="font-weight:600;font-size:0.88rem;">${escapeHtml(p.name)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <div class="num-input-group">
            <label>Fiyat (M€)</label>
            <input type="number" step="0.5" value="${priceVal}" onchange="updatePlayerPrice('${p.id}',this.value)">
          </div>
          <div class="num-input-group">
            <label>Forma No</label>
            <input type="number" value="${p.squadNumber || ''}" onchange="updatePlayerSquadNumber('${p.id}', this.value)">
          </div>
          <div class="num-input-group">
            <label>Puan</label>
            <input type="number" value="${currentPts}" onchange="updateHostPlayerPoint('${week.id}','${p.id}',this.value)">
          </div>
          <div class="num-input-group">
            <label>Gol</label>
            <input type="number" value="${goals}" onchange="updatePlayerWeeklyStat('${week.id}','${p.id}','goals',this.value)">
          </div>
          <div class="num-input-group">
            <label>Asist</label>
            <input type="number" value="${assists}" onchange="updatePlayerWeeklyStat('${week.id}','${p.id}','assists',this.value)">
          </div>
        </div>
      </div>`;
  }).join('');

  app.innerHTML = `
    ${topbarHTML('Host Paneli 👑')}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/hostpanel/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber} YÖNETİMİ</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/hostpanel/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>

      <div class="card">
        <h3>📅 Maç Gününü ve Saatini Ayarla</h3>
        <input 
          type="datetime-local" 
          id="matchDateTimeInput" 
          value="${dateInputValue}" 
          style="width:100%;margin-top:8px;padding:8px;border-radius:6px;border:1px solid #ccc;"
        >
        <button class="btn block primary" style="margin-top:10px;" onclick="saveMatchDate('${week.id}')">Tarihi Kaydet</button>
      </div>

      <div class="card" style="margin-top:15px;">
        <h3>⚽ Futbolcu Puan & İstatistik Yönetimi (Hafta ${week.weekNumber})</h3>
        <div style="margin-top:12px;">${playerPointsRows}</div>
      </div>

      <div class="card" style="margin-top:15px; display:flex; gap:10px;">
        <button class="btn block secondary" style="flex:1;" onclick="addNewWeek()">➕ Yeni Hafta Ekle (Hafta ${state.nextWeekNumber})</button>
        <button class="btn block danger" style="flex:1; background-color:#dc3545; color:#fff;" onclick="deleteWeek('${week.id}')">🗑️ Bu Haftayı Sil</button>
      </div>
    </div>`;
}

function updatePlayerPrice(playerId, val) {
  const p = getPlayer(playerId);
  if (!p) return;
  p.price = Number(val) || 0;
  saveState();
  toast(`${p.name} fiyatı ${p.price}M € olarak güncellendi`);
}

function saveMatchDate(weekId) {
  const inputEl = document.getElementById('matchDateTimeInput');
  if (!inputEl) return;

  const matchDateVal = inputEl.value;
  if (!matchDateVal) {
    toast('Lütfen geçerli bir tarih ve saat seçin!');
    return;
  }

  const week = getWeek(weekId);
  if (!week) {
    toast('Hafta bulunamadı!');
    return;
  }

  const d = new Date(matchDateVal);
  if (isNaN(d.getTime())) {
    toast('Geçersiz tarih girdiniz!');
    return;
  }

  week.matchDate = d.toISOString();
  saveState();
  toast('Maç tarihi başarıyla kaydedildi 📅');
  render();
}

function updateHostPlayerPoint(weekId, playerId, val) {
  const week = getWeek(weekId);
  if (!week) return;
  if (!week.playerPoints) week.playerPoints = {};
  week.playerPoints[playerId] = Number(val) || 0;
  saveState();
  toast('Puan kaydedildi');
}

function updatePlayerSquadNumber(playerId, val) {
  const p = getPlayer(playerId);
  if (!p) return;
  p.squadNumber = Number(val) || 0;
  saveState();
  toast(`${p.name} forma numarası #${p.squadNumber} olarak güncellendi`);
}

function updatePlayerWeeklyStat(weekId, playerId, statKey, val) {
  const week = getWeek(weekId);
  if (!week) return;
  if (!week.playerWeeklyStats) week.playerWeeklyStats = {};
  if (!week.playerWeeklyStats[playerId]) {
    week.playerWeeklyStats[playerId] = { goals: 0, assists: 0 };
  }
  week.playerWeeklyStats[playerId][statKey] = Number(val) || 0;
  saveState();
  toast(`Hafta ${week.weekNumber} istatistiği güncellendi`);
}

function addNewWeek() {
  const newW = {
    id: uid(),
    weekNumber: state.nextWeekNumber,
    matchDate: '',
    playerPoints: {},
    playerWeeklyStats: {},
    lineup: [],
    score: { A: 0, B: 0, entered: false }
  };
  state.weeks.push(newW);
  state.nextWeekNumber += 1;
  saveState();
  toast(`Hafta ${newW.weekNumber} eklendi`);
  go('#/hostpanel/' + newW.id);
}

function deleteWeek(weekId) {
  if (state.weeks.length <= 1) {
    toast('En az 1 hafta bulunmalıdır, son haftayı silemezsiniz!');
    return;
  }

  const weekToDelete = getWeek(weekId);
  if (!weekToDelete) return;

  const confirmDelete = confirm(`Hafta ${weekToDelete.weekNumber} silinecektir. Emin misiniz?`);
  if (!confirmDelete) return;

  state.weeks = state.weeks.filter(w => w.id !== weekId);
  state.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  state.weeks.forEach((w, index) => {
    w.weekNumber = index + 1;
  });

  state.nextWeekNumber = state.weeks.length + 1;
  saveState();
  toast('Hafta başarıyla silindi');

  const lastRemainingWeek = state.weeks[state.weeks.length - 1];
  go('#/hostpanel/' + lastRemainingWeek.id);
}

/* =========================================================
   HAFTANIN OYUNCUSU (POTW)
   ========================================================= */
function renderPOTW(weekParam) {
  const weeks = getSortedWeeks();
  let week = weekParam ? getWeek(weekParam) : latestWeek();
  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `${topbarHTML('Haftanın Oyuncusu')} <div class="page"><p>Hafta bulunamadı</p></div>`;
    return;
  }

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  const potwData = (state.potw && state.potw[week.id]) || { playerId: null, note: '' };
  const selectedPlayer = getPlayer(potwData.playerId);

  app.innerHTML = `
    ${topbarHTML('Haftanın Oyuncusu')}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/potw/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/potw/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>

      ${selectedPlayer ? `
        <div class="card" style="text-align:center; padding:24px 16px; background: linear-gradient(180deg, #FFFDF8 0%, #FFF3D1 100%); border: 2px solid #FFC125;">
          <div style="font-size: 2.5rem; margin-bottom: 6px;">👑</div>
          <div style="font-size:1.1rem; color:#8A6D0B; letter-spacing:0.1em; font-weight:bold;">HAFTANIN YILDIZI</div>
          <div style="margin: 14px auto; width:110px;">${avatarHTML(selectedPlayer)}</div>
          <h2 style="color:var(--ink); font-size: 2rem; margin-top:6px;">${escapeHtml(selectedPlayer.name)}</h2>${potwData.note ? `<p style="color:var(--ink-soft); font-size:0.9rem; font-style:italic; margin-top:8px;">"${escapeHtml(potwData.note)}"</p>` : ''}
        </div>
      ` : `
        <div class="card" style="text-align:center; padding:20px;">
          <div style="font-size:2.5rem; margin-bottom:10px;">🌟</div>
          <p>Bu hafta için henüz Haftanın Oyuncusu seçilmedi.</p>
        </div>
      `}

      ${isHost() ? `
        <div class="card" style="margin-top:16px;">
          <h3>⚙️ Host Yönetimi</h3>
          <label class="field-label" style="display:block;margin-top:8px;">Oyuncu Seç</label>
          <select id="potwPlayerSelect" style="width:100%;padding:8px;border-radius:6px;margin-bottom:10px;">
            <option value="">-- Oyuncu Seçin --</option>
            ${state.players.map(p => `
              <option value="${p.id}" ${potwData.playerId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
            `).join('')}
          </select>

          <label class="field-label" style="display:block;">Açıklama / Performans Notu</label>
          <input type="text" id="potwNoteInput" value="${escapeHtml(potwData.note || '')}" placeholder="Örn: 3 Gol 2 Asistlik harika performans!" style="width:100%;padding:8px;border-radius:6px;margin-bottom:14px;">

          <button class="btn block" onclick="savePOTW('${week.id}')">🌟 Haftanın Oyuncusunu Yayınla</button>
        </div>
      ` : ''}
    </div>
  `;
}

function savePOTW(weekId) {
  if (!isHost()) return;
  const playerId = document.getElementById('potwPlayerSelect').value;
  const note = document.getElementById('potwNoteInput').value;

  if (!playerId) {
    toast("Lütfen bir oyuncu seçin!");
    return;
  }
   
  if (!state.potw) state.potw = {};
  state.potw[weekId] = { playerId, note };

  saveState();
  toast("Haftanın Oyuncusu kaydedildi! 👑");
  renderPOTW(weekId);

   // Eğer oyuncunun 3D modeli tanımlıysa otomatik 3D görünümünü başlat
  const savedPlayer = getPlayer(playerId);
  if (savedPlayer && savedPlayer.glb) {
    setTimeout(() => {
      toggleGlbModel(savedPlayer.id);
    }, 100);
  }
}

/* =========================================================
   6. GOL & ASİST KRALLIĞI
   ========================================================= */
function renderStatsRanking(type) {
  const players = state.players || [];
  
  const sorted = [...players].map(p => {
    const totalStats = getPlayerTotalStats(p.id);
    return {
      ...p,
      val: totalStats[type] || 0
    };
  }).sort((a, b) => b.val - a.val);

  const isGoal = type === 'goals';
  const title = isGoal ? '⚽ Gol Krallığı (Toplam)' : '🅰️ Asist Krallığı (Toplam)';
  
  let html = `
    ${topbarHTML(title)}
    <div class="page">
      <div class="section-title">${title}</div>
  `;

  if (sorted.length === 0) {
    html += `<div class="empty-state"><p>Henüz veri bulunmuyor.</p></div>`;
  } else {
    sorted.forEach((p, index) => {
      const rank = index + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      
      html += `
        <div class="rank-row ${rank === 1 ? 'top1' : ''}" onclick="openPlayerPhotoModal('${p.id}')" style="display:flex;align-items:center;padding:10px;border-bottom:1px solid #eee;">
          <div class="rank-medal" style="width:30px;font-weight:bold;">${medal}</div>
          ${miniAvatarHTML(p)}
          <div class="rname" style="flex:1;margin-left:10px;font-weight:600;">${escapeHtml(p.name)}</div>
          <div class="rval" style="font-weight:bold;text-align:right;">
            ${p.val}
            <span style="font-size:0.75rem;color:#888;display:block;">${isGoal ? 'GOL' : 'ASİST'}</span>
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  document.getElementById('app').innerHTML = html;
}

/* =========================================================
   7. HAFTANIN 6'SI (TOTW)
   ========================================================= */
function renderTOTW(weekParam) {
  const weeks = getSortedWeeks();
  let week = weekParam ? getWeek(weekParam) : latestWeek();
  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `${topbarHTML("Haftanın 6'sı")} <div class="page"><p>Hafta bulunamadı</p></div>`;
    return;
  }

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  const totwData = (state.totw && state.totw[week.id]) || {
    gk: null, def1: null, def2: null, mid1: null, mid2: null, att: null
  };

  let html = `
    ${topbarHTML("Haftanın 6'sı")}
    <div class="page">
      
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/totw/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/totw/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>

      <div class="section-title" style="text-align:center;">HAFTANIN EN İYİ 6 OYUNCUSU</div>

      <div class="totw-field">
        <div class="totw-row">
          ${renderTOTWSlot('FW', totwData.att)}
        </div>
        <div class="totw-row">
          ${renderTOTWSlot('MF', totwData.mid1)}
          ${renderTOTWSlot('MF', totwData.mid2)}
        </div>
        <div class="totw-row">
          ${renderTOTWSlot('DF', totwData.def1)}
          ${renderTOTWSlot('DF', totwData.def2)}
        </div>
        <div class="totw-row">
          ${renderTOTWSlot('GK', totwData.gk)}
        </div>
      </div>
  `;

  if (isHost()) {
    html += `
      <div class="card" style="margin-top:16px;">
        <h3>⚙️ Host Yönetimi: Haftanın 6'sını Seç</h3>
        <div class="field-set" style="margin-top:10px;">
          ${renderTOTWSelectRow('Kaleci (GK)', 'gk', totwData.gk)}
          ${renderTOTWSelectRow('Defans 1 (DF)', 'def1', totwData.def1)}
          ${renderTOTWSelectRow('Defans 2 (DF)', 'def2', totwData.def2)}
          ${renderTOTWSelectRow('Orta Saha 1 (MF)', 'mid1', totwData.mid1)}
          ${renderTOTWSelectRow('Orta Saha 2 (MF)', 'mid2', totwData.mid2)}
          ${renderTOTWSelectRow('Forvet (FW)', 'att', totwData.att)}
        </div>
        <button class="btn block" style="margin-top:10px;" onclick="saveTOTW('${week.id}')">Haftanın 6'sını Kaydet & Yayınla</button>
      </div>
    `;
  }

  html += `</div>`;
  app.innerHTML = html;
}

function renderTOTWSlot(roleLabel, playerId) {
  const player = getPlayer(playerId);
  if (!player) {
    return `
      <div class="totw-slot">
        <div class="avatar" style="background:#256E48;border:1px dashed #fff;">?</div>
        <div class="tname" style="color:#fff;">Seçilmedi</div>
        <div class="trole">${roleLabel}</div>
      </div>
    `;
  }

  return `
    <div class="totw-slot" onclick="openPlayerPhotoModal('${player.id}')">
      ${avatarHTML(player)}
      <div class="tname" style="color:#fff;">${escapeHtml(player.name)}</div>
      <div class="trole">${roleLabel}</div>
    </div>
  `;
}

function renderTOTWSelectRow(label, slotKey, selectedId) {
  let options = `<option value="">-- Oyuncu Seç --</option>`;
  state.players.forEach(p => {
    const sel = p.id === selectedId ? 'selected' : '';
    options += `<option value="${p.id}" ${sel}>${escapeHtml(p.name)}</option>`;
  });

  return `
    <div class="row" style="margin-bottom:8px;">
      <label style="width:110px;font-size:0.8rem;font-weight:700;">${label}:</label>
      <select id="totw_select_${slotKey}">${options}</select>
    </div>
  `;
}

function saveTOTW(weekId) {
  if (!isHost()) return;

  if (!state.totw) state.totw = {};

  state.totw[weekId] = {
    gk: document.getElementById('totw_select_gk').value || null,
    def1: document.getElementById('totw_select_def1').value || null,
    def2: document.getElementById('totw_select_def2').value || null,
    mid1: document.getElementById('totw_select_mid1').value || null,
    mid2: document.getElementById('totw_select_mid2').value || null,
    att: document.getElementById('totw_select_att').value || null,
  };

  saveState();
  toast("Haftanın 6'sı kaydedildi!");
  renderTOTW(weekId);
}

/* =========================================================
   8. TAHMİN (HAFTALIK 9 SORU)
   ========================================================= */
const TAHMIN_QUESTION_COUNT = 9;

function safeId(str) {
  return String(str || '').replace(/[^a-zA-Z0-9]/g, '_');
}

function getTahminData(weekId) {
  if (!state.predictions) state.predictions = {};
  if (!state.predictions[weekId]) {
    state.predictions[weekId] = {
      questions: Array(TAHMIN_QUESTION_COUNT).fill(''),
      published: false,
      answers: {},
      scores: {}
    };
  }
  const d = state.predictions[weekId];
  if (!d.questions || d.questions.length !== TAHMIN_QUESTION_COUNT) {
    const q = Array(TAHMIN_QUESTION_COUNT).fill('');
    (d.questions || []).forEach((v, i) => { if (i < TAHMIN_QUESTION_COUNT) q[i] = v; });
    d.questions = q;
  }
  if (!d.answers) d.answers = {};
  if (!d.scores) d.scores = {};
  return d;
}

function renderPredictions(weekParam) {
  const weeks = getSortedWeeks();
  let week = weekParam ? getWeek(weekParam) : latestWeek();
  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `${topbarHTML('Tahmin')} <div class="page"><p>Hafta bulunamadı</p></div>`;
    return;
  }

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  const data = getTahminData(week.id);
  const hasQuestions = data.published && data.questions.some(q => q && q.trim() !== '');

  let html = `
    ${topbarHTML('🔮 Tahmin')}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/predictions/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/predictions/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>
      <div class="section-title" style="text-align:center;">HAFTANIN 9 TAHMİN SORUSU</div>
  `;

  if (isHost()) {
    html += `
      <div class="card">
        <h3>⚙️ Host: Soruları Hazırla</h3>
        <p style="color:var(--ink-soft);font-size:0.8rem;margin-top:4px;">Bu haftanın 9 sorusunu yaz ve yayınla. Herkes aynı soruları görüp cevaplayacak.</p>
        <div style="margin-top:10px;">
          ${data.questions.map((q, i) => `
            <label class="field-label" style="display:block;margin-top:6px;">Soru ${i + 1}</label>
            <input type="text" id="tahmin_q_${i}" value="${escapeHtml(q)}" placeholder="Soru ${i + 1}..." style="width:100%;">
          `).join('')}
        </div>
        <button class="btn block" style="margin-top:14px;" onclick="saveTahminQuestions('${week.id}')">${data.published ? 'Soruları Güncelle & Yayınla' : 'Soruları Kaydet & Yayınla'}</button>
      </div>
    `;

    if (data.published) {
      const nonHostUsers = state.users || [];
      html += `
        <div class="card" style="margin-top:15px;">
          <h3>📝 Gönderilen Cevaplar & Puanlama</h3>
      `;
      if (nonHostUsers.length === 0) {
        html += `<p style="color:var(--ink-soft);font-size:0.85rem;">Henüz kayıtlı oyuncu yok.</p>`;
      } else {
        nonHostUsers.forEach(u => {
          const ans = data.answers[u.username];
          const currentScore = data.scores[u.username] || 0;
          html += `
            <div style="border-bottom:1px solid #eee;padding:10px 0;margin-bottom:6px;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="font-weight:700;">${escapeHtml(u.username)}</div>
                <div class="num-input-group">
                  <label>Tahmin Puanı</label>
                  <input type="number" id="tahmin_score_${safeId(u.username)}" value="${currentScore}">
                </div>
              </div>
              ${ans ? `
                <div style="margin-top:8px;font-size:0.82rem;color:var(--ink-soft);">
                  ${data.questions.map((q, i) => `<div style="margin-bottom:4px;"><b>Soru ${i + 1}: ${escapeHtml(q || '(Soru belirtilmedi)')}</b><br>↳ Cevap: ${escapeHtml(ans[i] || '(boş cevap)')}</div>`).join('')}
                </div>
              ` : `<div style="margin-top:6px;color:var(--ink-soft);font-size:0.8rem;">Henüz cevap göndermedi.</div>`}
            </div>
          `;
        });
        html += `<button class="btn block" style="margin-top:8px;" onclick="saveAllTahminScores('${week.id}')">Tüm Tahmin Puanlarını Kaydet</button>`;
      }
      html += `</div>`;
    }
  } else {
    if (!hasQuestions) {
      html += `<div class="empty-state"><p>Bu hafta için tahmin soruları henüz yayınlanmadı.</p></div>`;
    } else {
      const myAnswers = data.answers[currentUser.username] || Array(TAHMIN_QUESTION_COUNT).fill('');
      const myScore = data.scores[currentUser.username];
      html += `
        <div class="card">
          ${data.questions.map((q, i) => `
            <label class="field-label" style="display:block;margin-top:6px;">Soru ${i + 1}:${escapeHtml(q || 'Soru Metni Belirtilmedi')}</label>
            <input type="text" id="tahmin_ans_${i}" value="${escapeHtml(myAnswers[i] || '')}" placeholder="Cevabını yaz..." style="width:100%;">
          `).join('')}
          <button class="btn block" style="margin-top:14px;" onclick="submitTahminAnswers('${week.id}')">Cevapları Gönder</button>
        </div>
        ${typeof myScore === 'number' ? `
          <div class="card" style="text-align:center;margin-top:12px;">
            <div style="font-size:0.85rem;color:var(--ink-soft);">Bu haftaki tahmin puanın</div>
            <div style="font-size:1.8rem;font-weight:bold;color:var(--pitch-dark);">⭐ ${myScore}</div>
          </div>
        ` : ''}
      `;
    }
  }

  html += `</div>`;
  app.innerHTML = html;
}

function saveTahminQuestions(weekId) {
  if (!isHost()) return;
  const data = getTahminData(weekId);
  const qs = [];
  for (let i = 0; i < TAHMIN_QUESTION_COUNT; i++) {
    const el = document.getElementById('tahmin_q_' + i);
    qs.push(el ? el.value.trim() : '');
  }
  data.questions = qs;
  data.published = true;
  saveState();
  toast('Tahmin soruları yayınlandı!');
  renderPredictions(weekId);
}

function submitTahminAnswers(weekId) {
  const data = getTahminData(weekId);
  const answers = [];
  for (let i = 0; i < TAHMIN_QUESTION_COUNT; i++) {
    const el = document.getElementById('tahmin_ans_' + i);
    answers.push(el ? el.value.trim() : '');
  }
  if (!data.answers) data.answers = {};
  data.answers[currentUser.username] = answers;
  saveState();
  toast('Cevapların gönderildi!');
  renderPredictions(weekId);
}

function saveAllTahminScores(weekId) {
  if (!isHost()) return;
  const data = getTahminData(weekId);
  if (!data.scores) data.scores = {};
  (state.users || []).forEach(u => {
    const el = document.getElementById('tahmin_score_' + safeId(u.username));
    if (el) data.scores[u.username] = Number(el.value) || 0;
  });
  saveState();
  toast('Tahmin puanları kaydedildi!');
  renderPredictions(weekId);
}

/* =========================================================
   9. OYUNCU LİSTESİ VE FOTOĞRAF YÖNETİMİ
   ========================================================= */
function renderPlayers() {
  const app = document.getElementById('app');

  const rows = state.players.map(p => {
    const totalStats = getPlayerTotalStats(p.id);
    const priceVal = p.price !== undefined ? p.price : 10;
    return `
      <div class="player-card" onclick="openPlayerPhotoModal('${p.id}')">
        ${avatarHTML(p)}
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="pstats">#${p.squadNumber} | 💶 ${priceVal}M € | ⚽ ${totalStats.goals} | 🅰️ ${totalStats.assists}</div>
      </div>`;
  }).join('');

  app.innerHTML = `
    ${topbarHTML('14 Futbolcu')}
    <div class="page">
      <div class="players-grid">${rows}</div>
    </div>`;
}

function openPlayerPhotoModal(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;
  const totalStats = getPlayerTotalStats(p.id);
  const priceVal = p.price !== undefined ? p.price : 10;

  openSheet(`
    <div style="text-align:center;">
      <div id="modelContainer_${p.id}" style="display:inline-block; position:relative; cursor:pointer;" onclick="toggleGlbModel('${p.id}')">
        ${avatarHTML(p)}
        ${p.glb ? `<div style="font-size:0.7rem; color:var(--gold); font-weight:bold; margin-top:4px;">🎮 3D Modeli Gör (Tıkla)</div>` : ''}
      </div>
      <h3>${escapeHtml(p.name)}</h3>
      <p style="color:var(--ink-soft);font-size:0.85rem;">Forma No: #${p.squadNumber} | Değer: ${priceVal}M €</p>
      <div style="display:flex;justify-content:center;gap:15px;margin-top:10px;">
        <div class="pill">⚽ Toplam Gol: ${totalStats.goals}</div>
        <div class="pill">🅰️ Toplam Asist: ${totalStats.assists}</div>
      </div>
    </div>
    ${isHost() ? `
      <div style="margin-top:15px; display:flex; flex-direction:column; gap:8px;">
        <input type="file" accept="image/*" id="photoInput_${p.id}" style="display:none;" onchange="handlePhotoUpload(event,'${p.id}')">
        <button class="btn block secondary" onclick="document.getElementById('photoInput_${p.id}').click()">📷 Fotoğraf Değiştir (Host)</button>
        
        <input type="file" accept=".glb" id="glbInput_${p.id}" style="display:none;" onchange="handleGlbUpload(event,'${p.id}')">
        <button class="btn block secondary" style="border-color:var(--gold); color:var(--gold-deep);" onclick="document.getElementById('glbInput_${p.id}').click()">📦 3D Model (GLB) Yükle (Host)</button>
      </div>
    ` : '<p style="text-align:center;color:var(--ink-soft);font-size:0.75rem;margin-top:10px;">* Fotoğraf ve 3D modelleri sadece Host değiştirebilir.</p>'}
  `);
}
async function handlePhotoUpload(event, playerId) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  toast('Fotoğraf işleniyor…');

  const reader = new FileReader();
  reader.onload = async () => {
    const p = getPlayer(playerId);
    p.photo = reader.result;
    
    if (supabaseReady) {
      try {
        await sb.from('player_photos').upsert({
          player_id: playerId,
          photo: reader.result,
          updated_at: new Date().toISOString()
        });
      } catch(e) { console.error(e); }
    }

    saveState();
    closeSheet();
    render();
    toast('Fotoğraf güncellendi');
  };
  reader.readAsDataURL(file);
}

/* =========================================================
   10. BU HAFTANIN KADROLARI (SAHA DİZİLİŞİ)
   ========================================================= */
function getLineupData(weekId) {
  if (!state.lineups) state.lineups = {};
  if (!state.lineups[weekId]) {
    state.lineups[weekId] = {
      teamNames: { A: 'Takım A', B: 'Takım B' },
      players: [],
      published: false
    };
  }
  const d = state.lineups[weekId];
  if (!d.teamNames) d.teamNames = { A: 'Takım A', B: 'Takım B' };
  if (!d.players) d.players = [];
  return d;
}

function lineupAvatarHTML(player, team) {
  if (!player) return `<div class="avatar">?</div>`;
  const teamClass = team === 'B' ? 'teamB' : 'teamA';
  const style = player.photo
    ? `background-image:url('${player.photo}'); border-radius:8px;`
    : `background:${player.color}; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold;`;
  return `<div class="avatar ${teamClass}" style="${style}">${player.photo ? '' : initials(player.name)}</div>`;
}

function lineupTokenHTML(weekId, entry, editable) {
  const p = getPlayer(entry.playerId);
  if (!p) return '';
  const firstName = (p.name || '').trim().split(/\s+/)[0] || p.name;
  const dragAttrs = editable
    ? `onmousedown="beginLineupDrag(event,this,'${weekId}','${entry.id}')" ontouchstart="beginLineupDrag(event,this,'${weekId}','${entry.id}')"`
    : `onclick="openPlayerPhotoModal('${p.id}')"`;
  return `
    <div class="token" style="left:${entry.x}%;top:${entry.y}%;" ${dragAttrs}>
      <div class="name-tag">${escapeHtml(firstName)}</div>
      ${lineupAvatarHTML(p, entry.team)}
      ${editable ? `<div onmousedown="event.stopPropagation();" ontouchstart="event.stopPropagation();" onclick="event.stopPropagation();removeLineupPlayer('${weekId}','${entry.id}')" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--red-card);color:#fff;font-size:0.62rem;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.3);">✕</div>` : ''}
    </div>
  `;
}

function lineupPitchLinesSVG() {
  return `
    <svg class="lines" viewBox="0 0 300 400" preserveAspectRatio="none">
      <rect x="8" y="8" width="284" height="384" fill="none" stroke="rgba(244,247,242,0.4)" stroke-width="2"/>
      <line x1="8" y1="200" x2="292" y2="200" stroke="rgba(244,247,242,0.4)" stroke-width="2"/>
      <circle cx="150" cy="200" r="45" fill="none" stroke="rgba(244,247,242,0.4)" stroke-width="2"/>
      <circle cx="150" cy="200" r="2.5" fill="rgba(244,247,242,0.4)"/>
      <rect x="85" y="8" width="130" height="55" fill="none" stroke="rgba(244,247,242,0.4)" stroke-width="2"/>
      <rect x="120" y="8" width="60" height="22" fill="none" stroke="rgba(244,247,242,0.4)" stroke-width="2"/>
      <rect x="85" y="337" width="130" height="55" fill="none" stroke="rgba(244,247,242,0.4)" stroke-width="2"/>
      <rect x="120" y="370" width="60" height="22" fill="none" stroke="rgba(244,247,242,0.4)" stroke-width="2"/>
    </svg>
  `;
}

function renderLineups(weekParam) {
  const weeks = getSortedWeeks();
  let week = weekParam ? getWeek(weekParam) : latestWeek();
  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `${topbarHTML('Bu Haftanın Kadroları')} <div class="page"><p>Henüz hafta tanımlanmadı.</p></div>`;
    return;
  }

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  const data = getLineupData(week.id);
  const host = isHost();
  const placedIds = data.players.map(p => p.playerId);
  const availablePlayers = state.players.filter(p => !placedIds.includes(p.id));
  const tokensHTML = data.players.map(entry => lineupTokenHTML(week.id, entry, host)).join('');

  let html = `
    ${topbarHTML('Bu Haftanın Kadroları')}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/lineups/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/lineups/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>

      <div class="match-title">
        <div class="teams">
          <span class="teamB">${escapeHtml(data.teamNames.B)}</span>
          <span class="vs">VS</span>
          <span class="teamA">${escapeHtml(data.teamNames.A)}</span>
        </div>
      </div>
  `;

  if (!host && !data.published) {
    html += `
      <div class="empty-state" style="margin-top:16px;">
        <p>Bu hafta için kadrolar henüz host tarafından yayınlanmadı.</p>
      </div>
    `;
  } else {
    html += `
      <div class="pitch-wrap" style="margin-top:14px;">
        <div class="pitch" id="lineupPitch">
          ${lineupPitchLinesSVG()}
          <div class="pitch-half-label top">${escapeHtml(data.teamNames.B)}</div>
          <div class="pitch-half-label bottom">${escapeHtml(data.teamNames.A)}</div>
          ${tokensHTML}
        </div>
      </div>
      ${!host ? `<div style="text-align:center;color:rgba(244,247,242,0.55);font-size:0.75rem;margin-top:4px;">${data.published ? '✅ Kadro host tarafından yayınlandı' : ''}</div>` : ''}
    `;
  }

  if (host) {
    html += `
      <div class="card" style="margin-top:16px;">
        <h3>⚙️ Host: Takım İsimleri</h3>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <div style="flex:1;">
            <label class="field-label">Takım A (Alt Saha)</label>
            <input type="text" id="lineupTeamAName" value="${escapeHtml(data.teamNames.A)}">
          </div>
          <div style="flex:1;">
            <label class="field-label">Takım B (Üst Saha)</label>
            <input type="text" id="lineupTeamBName" value="${escapeHtml(data.teamNames.B)}">
          </div>
        </div>
        <button class="btn block secondary" style="margin-top:10px;" onclick="saveLineupTeamNames('${week.id}')">Takım İsimlerini Kaydet</button>
      </div>

      <div class="card" style="margin-top:14px;">
        <h3>➕ Sahaya Oyuncu Ekle</h3>
        ${availablePlayers.length === 0 ? `<p style="color:var(--ink-soft);font-size:0.85rem;margin-top:8px;">Tüm oyuncular sahada.</p>` : `
        <div class="field-set" style="margin-top:10px;">
          <div class="row">
            <select id="lineupAddPlayerSelect">
              ${availablePlayers.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <select id="lineupAddPlayerTeam">
              <option value="A">${escapeHtml(data.teamNames.A)} (Alt Saha)</option>
              <option value="B">${escapeHtml(data.teamNames.B)} (Üst Saha)</option>
            </select>
          </div>
        </div>
        <button class="btn block" onclick="addLineupPlayer('${week.id}')">Sahaya Ekle</button>
        `}
        <p style="color:var(--ink-soft);font-size:0.78rem;margin-top:10px;">💡 Oyuncuları sahadaki mevkilerine sürükleyerek yerleştirebilirsin. Konumlar otomatik kaydedilir.</p>
      </div>

      <div class="card" style="margin-top:14px;text-align:center;">
        ${data.published
          ? `<div style="color:var(--pitch);font-weight:700;margin-bottom:10px;">✅ Bu hafta yayında</div>
             <div style="display:flex;gap:10px;">
               <button class="btn block" onclick="publishLineup('${week.id}')">Değişiklikleri Kaydet</button>
               <button class="btn block secondary" onclick="unpublishLineup('${week.id}')">Yayından Kaldır</button>
             </div>`
          : `<button class="btn block" onclick="publishLineup('${week.id}')">Kadroyu Kaydet &amp; Yayınla</button>`
        }
      </div>
    `;
  }

  html += `</div>`;
  app.innerHTML = html;
}

function beginLineupDrag(e, tokenEl, weekId, entryId) {
  if (!isHost()) return;
  e.preventDefault();
  const pitch = document.getElementById('lineupPitch');
  if (!pitch) return;
  tokenEl.style.zIndex = 30;

  function getPoint(ev) {
    return (ev.touches && ev.touches.length) ? ev.touches[0] : ev;
  }

  function move(ev) {
    ev.preventDefault();
    const rect = pitch.getBoundingClientRect();
    const pt = getPoint(ev);
    let x = ((pt.clientX - rect.left) / rect.width) * 100;
    let y = ((pt.clientY - rect.top) / rect.height) * 100;
    x = Math.max(4, Math.min(96, x));
    y = Math.max(6, Math.min(94, y));
    tokenEl.style.left = x + '%';
    tokenEl.style.top = y + '%';
    tokenEl.dataset.px = x;
    tokenEl.dataset.py = y;
  }

  function end() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', end);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end);
    tokenEl.style.zIndex = '';
    const px = tokenEl.dataset.px, py = tokenEl.dataset.py;
    if (px !== undefined && py !== undefined) {
      const data = getLineupData(weekId);
      const entry = data.players.find(p => p.id === entryId);
      if (entry) {
        entry.x = parseFloat(px);
        entry.y = parseFloat(py);
        saveState();
      }
    }
  }

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', end);
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end);
}

function addLineupPlayer(weekId) {
  if (!isHost()) return;
  const sel = document.getElementById('lineupAddPlayerSelect');
  const teamSel = document.getElementById('lineupAddPlayerTeam');
  if (!sel || !sel.value) { toast('Lütfen bir oyuncu seç'); return; }
  const playerId = sel.value;
  const team = (teamSel && teamSel.value === 'B') ? 'B' : 'A';

  const data = getLineupData(weekId);
  if (data.players.some(p => p.playerId === playerId)) {
    toast('Bu oyuncu zaten sahada');
    return;
  }
  data.players.push({
    id: uid(),
    playerId,
    team,
    x: 50,
    y: team === 'A' ? 75 : 25
  });
  saveState();
  toast('Oyuncu sahaya eklendi');
  renderLineups(weekId);
}

function removeLineupPlayer(weekId, entryId) {
  if (!isHost()) return;
  const data = getLineupData(weekId);
  data.players = data.players.filter(p => p.id !== entryId);
  saveState();
  toast('Oyuncu sahadan çıkarıldı');
  renderLineups(weekId);
}

function saveLineupTeamNames(weekId) {
  if (!isHost()) return;
  const data = getLineupData(weekId);
  const aEl = document.getElementById('lineupTeamAName');
  const bEl = document.getElementById('lineupTeamBName');
  const aName = (aEl && aEl.value.trim()) || 'Takım A';
  const bName = (bEl && bEl.value.trim()) || 'Takım B';
  data.teamNames = { A: aName, B: bName };
  saveState();
  toast('Takım isimleri güncellendi');
  renderLineups(weekId);
}

function publishLineup(weekId) {
  if (!isHost()) return;
  const data = getLineupData(weekId);
  data.published = true;
  saveState();
  toast("Kadrolar yayınlandı! 🎉");
  renderLineups(weekId);
}

function unpublishLineup(weekId) {
  if (!isHost()) return;
  const data = getLineupData(weekId);
  data.published = false;
  saveState();
  toast('Yayın kaldırıldı, kadro taslak durumunda');
  renderLineups(weekId);
}


/* =========================================================
   GLB 3D MODEL YÖNETİMİ & GÖRÜNTÜLEME
   ========================================================= */

// Fotoğrafa tıklandığında GLB modelini yükler / gösterir
/* =========================================================
   GLB 3D MODEL YÖNETİMİ & GÖRÜNTÜLEME
   ========================================================= */

// Fotoğrafa tıklandığında GLB modelini yükler / gösterir
// GLB Dosyası Yükleme (Host)
// GLB Dosyasını Supabase Storage'a Yükleme ve URL Alma
async function handleGlbUpload(event, playerId) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  // Dosya formatı kontrolü
  if (!file.name.endsWith('.glb')) {
    return toast('Lütfen geçerli bir .glb dosyası seçin!');
  }

  toast('3D Model Supabase Storage\'a yükleniyor…');

  try {
    // 1. Benzersiz bir dosya adı oluşturun (örn: player_123_169000000.glb)
    const fileName = `player_${playerId}_${Date.now()}.glb`;

    // 2. Dosyayı Supabase 'models' bucket'ına yükleyin
    const { data: uploadData, error: uploadError } = await sb.storage
      .from('models') // Supabase'de oluşturduğunuz bucket adı
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage Yükleme Hatası:', uploadError);
      return toast('Yükleme başarısız: ' + uploadError.message);
    }

    // 3. Yüklenen dosyanın doğrudan erişilebilir Public URL'sini alın
    const { data: publicUrlData } = sb.storage
      .from('models')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl; // https://xyz.supabase.co/storage/v1/object/public/models/player_123_...glb

    // 4. Oyuncu nesnesine ve veritabanına doğrudan bu URL'yi kaydedin
    const p = getPlayer(playerId);
    p.glb = publicUrl;

    if (typeof supabaseReady !== 'undefined' && supabaseReady) {
      await sb.from('player_photos').upsert({
        player_id: playerId,
        glb: publicUrl,
        updated_at: new Date().toISOString()
      });
    }

    saveState();
    closeSheet();
    render();
    toast('3D Model başarıyla yüklendi! 🎮');

  } catch (err) {
    console.error('İşlem hatası:', err);
    toast('Bir hata oluştu!');
  }
}

// Aktif GLB görüntüleyicileri (context sızıntısını önlemek için)
window._glbViewers = window._glbViewers || {};

function disposeGlbViewer(playerId) {
  const active = window._glbViewers[playerId];
  if (!active) return;
  if (active.rafId) cancelAnimationFrame(active.rafId);
  if (active.controls) active.controls.dispose();
  if (active.renderer) {
    active.renderer.dispose();
    active.renderer.forceContextLoss && active.renderer.forceContextLoss();
  }
  if (active.scene) {
    active.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
          m.dispose && m.dispose();
        });
      }
    });
  }
  delete window._glbViewers[playerId];
}

// 3D Modeli Görüntüleme / Sahneleme
function toggleGlbModel(playerId) {
  const p = getPlayer(playerId);
  if (!p || !p.glb) return toast('Bu oyuncu için 3D model yüklenmemiş.');

  const container = document.getElementById(`modelContainer_${playerId}`);
  if (!container) return;

  // Zaten açıksa: kapat ve foto görünümüne geri dön (context sızıntısı olmasın)
  if (window._glbViewers[playerId]) {
    disposeGlbViewer(playerId);
    container.innerHTML = `
      ${avatarHTML(p)}
      <div style="font-size:0.7rem; color:var(--gold); font-weight:bold; margin-top:4px;">🎮 3D Modeli Gör (Tıkla)</div>
    `;
    return;
  }

  // Temizle ve Canvas Oluştur
  container.innerHTML = `<div id="threeCanvas_${playerId}" style="width: 200px; height: 200px; margin: 0 auto; border-radius: 12px; overflow: hidden; background: #1E7145;"></div>`;

  const canvasDiv = document.getElementById(`threeCanvas_${playerId}`);
  
  // Three.js Kurulumu
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  
  renderer.setSize(200, 200);
  canvasDiv.appendChild(renderer.domElement);

  // Işıklandırma
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  camera.position.set(0, 1, 3);

  // Görüntüleyiciyi kaydet (henüz model/controls yok, sonra doldurulacak)
  const viewerEntry = { renderer, scene, camera, controls: null, rafId: null };
  window._glbViewers[playerId] = viewerEntry;

  // OrbitControls (Modeli Dündürme)
  if (THREE.OrbitControls) {
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    viewerEntry.controls = controls;
  }

  // GLTF Loader ile modeli yükleme (Draco sıkıştırma desteğiyle)
  const loader = new THREE.GLTFLoader();
  if (THREE.DRACOLoader) {
    if (!window._dracoLoaderInstance) {
      const dracoLoader = new THREE.DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      window._dracoLoaderInstance = dracoLoader;
    }
    loader.setDRACOLoader(window._dracoLoaderInstance);
  } else {
    console.warn('THREE.DRACOLoader bulunamadı — index.html içindeki DRACOLoader.js script etiketinin yüklendiğinden emin olun.');
  }
  loader.load(
    p.glb,
    (gltf) => {
      // Kullanıcı bu sırada modeli kapattıysa (viewer artık kayıtlı değilse) sahneye ekleme
      if (window._glbViewers[playerId] !== viewerEntry) return;

      const model = gltf.scene;
      scene.add(model);

      // Modeli Otomatik Döndürme Döngüsü
      function animate() {
        // Görüntüleyici hâlâ aktifse devam et
        if (window._glbViewers[playerId] !== viewerEntry) return;
        viewerEntry.rafId = requestAnimationFrame(animate);
        model.rotation.y += 0.01;
        if (viewerEntry.controls) viewerEntry.controls.update();
        renderer.render(scene, camera);
      }
      animate();
    },
    undefined,
    (error) => {
      console.error('GLB yüklenirken hata oluştu:', error);
      toast('Model dosyası bozuk veya render edilemiyor.');
      disposeGlbViewer(playerId);
    }
  );
}
