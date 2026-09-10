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

/* ---------------- Yardimcilar ---------------- */
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
    version: 2,
    users: [],
    teamNames: { A: 'Barcelona', B: 'Real Madrid' },
    players: DEFAULT_PLAYERS.map((name, i) => ({
      id: 'p' + (i + 1),
      name,
      photo: null,
      color: AVATAR_COLORS[i % AVATAR_COLORS.length],
      squadNumber: i + 1,
      stats: { goals: 0, assists: 0 }
    })),
    weeks: [{
      id: 'w1',
      weekNumber: 1,
      matchDate: '',
      playerPoints: {},
      lineup: [],
      score: { A: 0, B: 0, entered: false }
    }],
    totw: {},
    userSquads: {},
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
  state.weeks = loaded.weeks || [];
  state.totw = loaded.totw || {};
  state.nextWeekNumber = loaded.nextWeekNumber || 1;
  state.userSquads = loaded.userSquads || {};
  if (loaded.players && loaded.players.length) {
    const photoMap = {};
    state.players.forEach(p => { photoMap[p.id] = p.photo; });
    state.players = loaded.players.map(lp => ({ 
      ...lp, 
      photo: photoMap[lp.id] || null,
      stats: lp.stats || { goals: 0, assists: 0 }
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

/* ---------------- Veri Erişim ---------------- */
function getPlayer(id) { return state.players.find(p => p.id === id); }
function getSortedWeeks() { return [...state.weeks].sort((a, b) => a.weekNumber - b.weekNumber); }
function getWeek(id) { return state.weeks.find(w => w.id === id); }
function latestWeek() {
  const sorted = getSortedWeeks();
  return sorted.length ? sorted[sorted.length - 1] : null;
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
  const style = player.photo ? `background-image:url('${player.photo}');` : `background:${player.color};`;
  return `<div class="avatar" style="${style}">${player.photo ? '' : initials(player.name)}</div>`;
}

function miniAvatarHTML(player) {
  if (!player) return `<div class="mini-avatar" style="background:#256E48;">?</div>`;
  const style = player.photo ? `background-image:url('${player.photo}');` : `background:${player.color};`;
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
      <div class="menu-card wide" onclick="go('#/totw')">
        <div class="icon">🌟</div>
        <div class="label">Haftanın 6'sı</div>
        <div class="stripe"></div>
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
  selectedIds.forEach(id => {
    weekPointsEarned += Number(week.playerPoints?.[id] || 0);
  });

  const selectedListHTML = selectedIds.map(id => {
    const p = getPlayer(id);
    if (!p) return '';
    const pts = week.playerPoints?.[id] ?? '-';
    return `
      <div class="player-pick-row">
        ${miniAvatarHTML(p)}
        <div class="pname">${escapeHtml(p.name)}</div>
        <div style="font-weight:bold;margin-right:8px;">Puan: ${pts}</div>
        ${!isLocked ? `<button class="btn small danger" onclick="toggleSelectPlayer('${week.id}','${p.id}')">Çıkar</button>` : ''}
      </div>`;
  }).join('');

  const remainingPlayers = state.players.filter(p => !selectedIds.includes(p.id));
  const availableListHTML = remainingPlayers.map(p => `
    <div class="player-pick-row">
      ${miniAvatarHTML(p)}
      <div class="pname">${escapeHtml(p.name)}</div>
      ${!isLocked ? `<button class="btn small" onclick="toggleSelectPlayer('${week.id}','${p.id}')">Ekle</button>` : ''}
    </div>`).join('');

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

  if (squad.includes(playerId)) {
    squad = squad.filter(id => id !== playerId);
  } else {
    if (squad.length >= 7) {
      toast('En fazla 7 futbolcu seçebilirsin!');
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

  // Güvenli datetime-local string oluşturma
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
    const goals = p.stats?.goals || 0;
    const assists = p.stats?.assists || 0;

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #eee;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${miniAvatarHTML(p)}
          <span style="font-weight:600;font-size:0.88rem;">${escapeHtml(p.name)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <div class="num-input-group">
            <label>Puan</label>
            <input type="number" value="${currentPts}" onchange="updateHostPlayerPoint('${week.id}','${p.id}',this.value)">
          </div>
          <div class="num-input-group">
            <label>Gol</label>
            <input type="number" value="${goals}" onchange="updatePlayerStat('${p.id}','goals',this.value)">
          </div>
          <div class="num-input-group">
            <label>Asist</label>
            <input type="number" value="${assists}" onchange="updatePlayerStat('${p.id}','assists',this.value)">
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
        <h3>⚽ Futbolcu Puan & İstatistik Yönetimi</h3>
        <div style="margin-top:12px;">${playerPointsRows}</div>
      </div>

      <div class="card" style="margin-top:15px;">
        <button class="btn block secondary" onclick="addNewWeek()">➕ Yeni Hafta Ekle (Hafta ${state.nextWeekNumber})</button>
      </div>
    </div>`;
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

function updatePlayerStat(playerId, statKey, val) {
  const p = getPlayer(playerId);
  if (!p) return;
  if (!p.stats) p.stats = { goals: 0, assists: 0 };
  p.stats[statKey] = Number(val) || 0;
  saveState();
  toast('İstatistik güncellendi');
}

function addNewWeek() {
  const newW = {
    id: uid(),
    weekNumber: state.nextWeekNumber,
    matchDate: '',
    playerPoints: {},
    lineup: [],
    score: { A: 0, B: 0, entered: false }
  };
  state.weeks.push(newW);
  state.nextWeekNumber += 1;
  saveState();
  toast(`Hafta ${newW.weekNumber} eklendi`);
  go('#/hostpanel/' + newW.id);
}

/* =========================================================
   6. GOL & ASİST KRALLIĞI
   ========================================================= */
function renderStatsRanking(type) {
  const players = state.players || [];
  
  const sorted = [...players].sort((a, b) => {
    const valA = (a.stats && a.stats[type]) || 0;
    const valB = (b.stats && b.stats[type]) || 0;
    return valB - valA;
  });

  const isGoal = type === 'goals';
  const title = isGoal ? '⚽ Gol Krallığı' : '🅰️ Asist Krallığı';
  
  let html = `
    ${topbarHTML(title)}
    <div class="page">
      <div class="section-title">${title}</div>
  `;

  if (sorted.length === 0) {
    html += `<div class="empty-state"><p>Henüz veri bulunmuyor.</p></div>`;
  } else {
    sorted.forEach((p, index) => {
      const val = (p.stats && p.stats[type]) || 0;
      const rank = index + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      
      html += `
        <div class="rank-row ${rank === 1 ? 'top1' : ''}" onclick="openPlayerPhotoModal('${p.id}')">
          <div class="rank-medal">${medal}</div>
          ${miniAvatarHTML(p)}
          <div class="rname">${escapeHtml(p.name)}</div>
          <div class="rval">
            ${val}
            <span>${isGoal ? 'GOL' : 'ASİST'}</span>
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
    <div class="row">
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
   8. OYUNCU LİSTESİ VE FOTOĞRAF YÖNETİMİ
   ========================================================= */
function renderPlayers() {
  const app = document.getElementById('app');

  const rows = state.players.map(p => `
    <div class="player-card" onclick="openPlayerPhotoModal('${p.id}')">
      ${avatarHTML(p)}
      <div class="pname">${escapeHtml(p.name)}</div>
      <div class="pstats">#${p.squadNumber} | ⚽ ${p.stats?.goals || 0} | 🅰️ ${p.stats?.assists || 0}</div>
    </div>`).join('');

  app.innerHTML = `
    ${topbarHTML('14 Futbolcu')}
    <div class="page">
      <div class="players-grid">${rows}</div>
    </div>`;
}

function openPlayerPhotoModal(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;

  openSheet(`
    <div style="text-align:center;">
      ${avatarHTML(p)}
      <h3>${escapeHtml(p.name)}</h3>
      <p style="color:var(--ink-soft);font-size:0.85rem;">Forma No: #${p.squadNumber}</p>
      <div style="display:flex;justify-content:center;gap:15px;margin-top:10px;">
        <div class="pill">⚽ Gol: ${p.stats?.goals || 0}</div>
        <div class="pill">🅰️ Asist: ${p.stats?.assists || 0}</div>
      </div>
    </div>
    ${isHost() ? `
      <input type="file" accept="image/*" id="photoInput_${p.id}" style="display:none;" onchange="handlePhotoUpload(event,'${p.id}')">
      <button class="btn block secondary" style="margin-top:15px;" onclick="document.getElementById('photoInput_${p.id}').click()">📷 Fotoğraf Değiştir (Host)</button>
    ` : '<p style="text-align:center;color:var(--ink-soft);font-size:0.75rem;margin-top:10px;">* Fotoğrafları sadece Host değiştirebilir.</p>'}
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
