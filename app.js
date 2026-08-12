/* =========================================================
   ÇARŞAMBA LİGİ — Haftalık Futbol İstatistik Uygulaması
   Tek dosyalık, bağımlılıksız (vanilla) JS uygulama.
   Veri katmanı ileride gerçek bir API/DB'ye taşınabilecek
   şekilde tek bir Storage modülü üzerinden yönetilir.
   ========================================================= */

/* ---------------- Sabitler ---------------- */
const STORAGE_KEY = 'futbolAppData_v1';

const FORMAT_CAPACITY = { '5v5': 5, '6v6': 6, '7v7': 7 };

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

const TOTW_DEFAULT_ROLES = ['Kaleci', 'Defans', 'Defans', 'Orta Saha', 'Orta Saha', 'Forvet'];
const ROLE_OPTIONS = ['Kaleci', 'Defans', 'Orta Saha', 'Forvet'];


/* ---------------- Yardımcılar ---------------- */
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* ---------------- Storage katmanı ----------------
   PAYLAŞIMLI (herkes aynı veriyi görür) — Firebase Firestore.
   Vercel gibi bir statik hosting, kendi başına "sunucu hafızası"
   olmadığı için bu tarafta ücretsiz bir Firestore veritabanı
   kullanıyoruz. index.html'deki firebaseConfig alanını kendi
   Firebase projenle doldurmalısın (talimatlar index.html içinde).

   Firestore yapısı:
     futbolApp/state        -> { teamNames, players, weeks, nextWeekNumber }
     futbolApp_photos/{id}  -> { data: "data:image/...;base64,..." }
*/
const STATE_COLLECTION = 'futbolApp';
const STATE_DOC = 'state';
const PHOTOS_COLLECTION = 'futbolApp_photos';

// Bu değişkenler firebase-init.js tarafından bootstrapFirebase() içinde doldurulur.
let db = null;
let fs = null; // { doc, setDoc, getDoc, onSnapshot, collection, getDocs, deleteDoc }
let firebaseReady = false;
let saving = false;
let suppressAutoRender = false; // form doldururken/uyarı açıkken otomatik yeniden çizimi engelle

function buildDefaultState() {
  return {
    version: 1,
    teamNames: { A: 'Barcelona', B: 'Real Madrid' },
    players: DEFAULT_PLAYERS.map((name, i) => ({
      id: 'p' + (i + 1),
      name,
      photo: null,
      color: AVATAR_COLORS[i % AVATAR_COLORS.length],
      squadNumber: i + 1
    })),
    weeks: [],
    nextWeekNumber: 1
  };
}

let state = buildDefaultState();

function coreStateSnapshot() {
  return {
    version: state.version,
    teamNames: state.teamNames,
    players: state.players.map(p => ({ id: p.id, name: p.name, color: p.color, squadNumber: p.squadNumber })),
    weeks: state.weeks,
    nextWeekNumber: state.nextWeekNumber
  };
}

async function saveState() {
  if (!firebaseReady) return;
  saving = true;
  updateSyncBadge();
  try {
    const ref = fs.doc(db, STATE_COLLECTION, STATE_DOC);
    await fs.setDoc(ref, coreStateSnapshot());
  } catch (e) {
    console.error('Veri kaydedilemedi:', e);
    toast('Kaydedilemedi — internet bağlantını kontrol et');
  }
  saving = false;
  updateSyncBadge();
}

function applyLoadedCoreState(loaded) {
  if (!loaded) return;
  state.teamNames = loaded.teamNames || state.teamNames;
  state.weeks = loaded.weeks || [];
  state.nextWeekNumber = loaded.nextWeekNumber || 1;
  if (loaded.players && loaded.players.length) {
    const photoMap = {};
    state.players.forEach(p => { photoMap[p.id] = p.photo; });
    state.players = loaded.players.map(lp => ({ ...lp, photo: photoMap[lp.id] || null }));
  }
}

async function savePhotoToServer(playerId, dataUrl) {
  if (!firebaseReady) return;
  try {
    const ref = fs.doc(db, PHOTOS_COLLECTION, playerId);
    await fs.setDoc(ref, { data: dataUrl });
  } catch (e) {
    console.error('Fotoğraf kaydedilemedi:', e);
    toast('Fotoğraf kaydedilemedi (çok büyük olabilir, daha küçük bir fotoğraf dene)');
  }
}

async function deletePhotoFromServer(playerId) {
  if (!firebaseReady) return;
  try {
    const ref = fs.doc(db, PHOTOS_COLLECTION, playerId);
    await fs.deleteDoc(ref);
  } catch (e) { /* zaten yoksa sorun değil */ }
}

async function loadAllPhotosOnce() {
  if (!firebaseReady) return;
  try {
    const snap = await fs.getDocs(fs.collection(db, PHOTOS_COLLECTION));
    snap.forEach(docSnap => {
      const p = getPlayer(docSnap.id);
      if (p) p.photo = docSnap.data().data;
    });
  } catch (e) {
    console.error('Fotoğraflar okunamadı:', e);
  }
}

function updateSyncBadge() {
  const el = document.getElementById('syncBadge');
  if (el) el.textContent = saving ? '⏳' : '✓';
}

async function refreshFromServer() {
  if (!firebaseReady) return;
  toast('Yenileniyor…');
  try {
    const ref = fs.doc(db, STATE_COLLECTION, STATE_DOC);
    const snap = await fs.getDoc(ref);
    if (snap.exists()) applyLoadedCoreState(snap.data());
  } catch (e) { console.error(e); }
  await loadAllPhotosOnce();
  render();
  toast('Güncel veriler yüklendi');
}

/* --------- Firebase bootstrap: index.html içinden çağrılır --------- */
window.initAppWithFirebase = async function(database, firestoreFns) {
  db = database;
  fs = firestoreFns;
  try {
    const ref = fs.doc(db, STATE_COLLECTION, STATE_DOC);
    const snap = await fs.getDoc(ref);
    if (snap.exists()) {
      applyLoadedCoreState(snap.data());
    } else {
      await saveState(); 
    }
    await loadAllPhotosOnce();
    firebaseReady = true;
    render();

    fs.onSnapshot(fs.doc(db, STATE_COLLECTION, STATE_DOC), (snap2) => {
      if (!snap2.exists()) return;
      applyLoadedCoreState(snap2.data());
      if (!suppressAutoRender) render();
    });
    fs.onSnapshot(fs.collection(db, PHOTOS_COLLECTION), (colSnap) => {
      colSnap.forEach(docSnap => {
        const p = getPlayer(docSnap.id);
        if (p) p.photo = docSnap.data().data;
      });
      if (!suppressAutoRender) render();
    });
  } catch (e) {
    console.error('Firebase başlatılamadı:', e);
    showFirebaseSetupError(e);
  }
};

function showFirebaseSetupError(e) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="padding:40px 20px;text-align:center;color:#F4F7F2;">
      <div style="font-size:2rem;">⚠️</div>
      <h3 style="margin-top:10px;">Veritabanına bağlanılamadı</h3>
      <p style="color:rgba(244,247,242,0.65);font-size:0.85rem;line-height:1.5;">
        index.html içindeki <b>firebaseConfig</b> bilgilerini kendi Firebase projenle
        doldurduğundan ve Firestore veritabanını oluşturduğundan emin ol.
      </p>
      <p style="color:rgba(244,247,242,0.4);font-size:0.72rem;margin-top:10px;">${escapeHtml(String(e && e.message || e))}</p>
    </div>`;
}

/* ---------------- Veri erişim yardımcıları ---------------- */
function getPlayer(id) {
  return state.players.find(p => p.id === id);
}

function getSortedWeeks() {
  return [...state.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
}

function getWeek(id) {
  return state.weeks.find(w => w.id === id);
}

function latestWeek() {
  const sorted = getSortedWeeks();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

function computeTotals() {
  const totals = {};
  state.players.forEach(p => { totals[p.id] = { goals: 0, assists: 0 }; });
  state.weeks.forEach(w => {
    (w.weeklyStats || []).forEach(s => {
      if (!totals[s.playerId]) totals[s.playerId] = { goals: 0, assists: 0 };
      totals[s.playerId].goals += Number(s.goals) || 0;
      totals[s.playerId].assists += Number(s.assists) || 0;
    });
  });
  return totals;
}

function getWeekStat(week, playerId) {
  const s = (week.weeklyStats || []).find(x => x.playerId === playerId);
  return s ? s : { playerId, goals: 0, assists: 0 };
}

function teamCountInWeek(week, team) {
  return (week.lineup || []).filter(l => l.team === team).length;
}

function activeTeamCountInWeek(week, team) {
  return (week.lineup || []).filter(l => l.team === team && !l.redCard).length;
}

function isPlayerInWeek(week, playerId) {
  return (week.lineup || []).find(l => l.playerId === playerId);
}

/* ---------------- Toast ---------------- */
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

/* ---------------- Avatar render ---------------- */
function avatarHTML(player, opts) {
  opts = opts || {};
  const sizeClass = opts.teamClass ? ' ' + opts.teamClass : '';
  const style = player.photo
    ? `background-image:url('${player.photo}');`
    : `background:${player.color};`;
  const content = player.photo ? '' : initials(player.name);
  return `<div class="avatar${sizeClass}" style="${style}">${content}</div>`;
}

function miniAvatarHTML(player) {
  const style = player.photo
    ? `background-image:url('${player.photo}');`
    : `background:${player.color};`;
  const content = player.photo ? '' : initials(player.name);
  return `<div class="mini-avatar" style="${style}">${content}</div>`;
}

/* ---------------- Router ---------------- */
window.addEventListener('hashchange', () => { if (firebaseReady) render(); });

function go(hash) {
  window.location.hash = hash;
}

function render() {
  const hash = window.location.hash || '#/home';
  const [, path, param] = hash.match(/^#\/([a-zA-Z]+)(?:\/(.+))?$/) || [null, 'home', null];
  window.scrollTo(0, 0);
  // İstatistik sayfası hariç her sayfada canlı senkronizasyon serbest.
  // İstatistik sayfası kendi içinde bu bayrağı tekrar true yapar (form doldururken üzerine yazılmasın diye).
  suppressAutoRender = false;
  switch (path) {
    case 'home': return renderHome();
    case 'newmatch': return renderNewMatchFormat();
    case 'match': return renderMatchEditor(param);
    case 'stats': return renderStats(param);
    case 'goalkings': return renderRanking('goals');
    case 'assistkings': return renderRanking('assists');
    case 'totw': return renderTeamOfWeek(param);
    case 'players': return renderPlayers();
    default: return renderHome();
  }
}

/* =========================================================
   ORTAK PARÇALAR
   ========================================================= */
function topbarHTML(title, backHash) {
  return `
  <div class="topbar">
    <button class="backbtn" onclick="go('${backHash || '#/home'}')">⟵ ${backHash ? 'Geri' : 'Ana Sayfa'}</button>
    <div class="pagetitle">${escapeHtml(title)}</div>
    <button class="backbtn" style="padding:9px 12px;" onclick="refreshFromServer()" title="Elle yenile">🔄 <span id="syncBadge">✓</span></button>
  </div>`;
}

/* =========================================================
   ANA SAYFA
   ========================================================= */
function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar" style="justify-content:flex-end;">
      <button class="backbtn" onclick="refreshFromServer()">🔄 Yenile <span id="syncBadge">✓</span></button>
    </div>
    <div class="home-hero">
      <div class="eyebrow">Çarşamba Ligi</div>
      <h1>HAFTALIK FUTBOL</h1>
      <p>14 kişilik kadro • her hafta yeni maç • gol ve asist takibi</p>
      <p style="color:rgba(255,193,69,0.9);font-size:0.72rem;margin-top:10px;">🌐 Bu veriler paylaşımlı — linki açan herkes aynı kadroyu, maçları ve fotoğrafları anlık görür</p>
    </div>
    <div class="menu-grid">
      <div class="menu-card wide accent" onclick="go('#/match/current')">
        <div class="icon">🏟️</div>
        <div class="label">Bu Haftanın Maçı</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card wide" onclick="go('#/newmatch')">
        <div class="icon">➕</div>
        <div class="label">Yeni Maç / Kadro Oluştur</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/stats')">
        <div class="icon">📊</div>
        <div class="label">İstatistikler</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/goalkings')">
        <div class="icon">⚽</div>
        <div class="label">Gol Krallığı</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/assistkings')">
        <div class="icon">🎯</div>
        <div class="label">Asist Krallığı</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card" onclick="go('#/totw')">
        <div class="icon">⭐</div>
        <div class="label">Haftanın 6'sı</div>
        <div class="stripe"></div>
      </div>
      <div class="menu-card wide" onclick="go('#/players')">
        <div class="icon">👥</div>
        <div class="label">Oyuncular</div>
        <div class="stripe"></div>
      </div>
    </div>
    <div class="footer-note">14 sabit oyuncu • ${state.weeks.length} hafta kaydedildi</div>
  `;
}

/* =========================================================
   YENİ MAÇ — FORMAT SEÇİMİ
   ========================================================= */
function renderNewMatchFormat() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${topbarHTML('Yeni Maç')}
    <div class="page">
      <div class="section-title">Kaç kişilik oynanacak?</div>
      <div class="card" style="text-align:center;">
        <p style="color:var(--ink-soft);font-size:0.85rem;margin:0 0 4px;">Format seçtikten sonra kadroyu oluşturmaya başlayacaksın.</p>
      </div>
      <div class="format-grid">
        <div class="format-opt" onclick="createWeek('5v5')">
          <div class="big">5v5</div>
          <div class="sub">10 oyuncu</div>
        </div>
        <div class="format-opt" onclick="createWeek('6v6')">
          <div class="big">6v6</div>
          <div class="sub">12 oyuncu</div>
        </div>
        <div class="format-opt" onclick="createWeek('7v7')">
          <div class="big">7v7</div>
          <div class="sub">14 oyuncu</div>
        </div>
      </div>
    </div>
  `;
}

function createWeek(format) {
  const week = {
    id: uid(),
    weekNumber: state.nextWeekNumber,
    date: todayISO(),
    matchFormat: format,
    lineup: [],       // {playerId, team:'A'|'B', x, y, redCard}
    weeklyStats: [],  // {playerId, goals, assists}
    teamOfWeek: TOTW_DEFAULT_ROLES.map((role, i) => ({ slot: i, role, playerId: null }))
  };
  state.weeks.push(week);
  state.nextWeekNumber += 1;
  saveState();
  toast(`Hafta ${week.weekNumber} oluşturuldu`);
  go('#/match/' + week.id);
}

/* =========================================================
   MAÇ / KADRO EKRANI (Saha)
   ========================================================= */
function pitchLinesSVG() {
  // 0-100 x 0-133.3 viewBox (3:4 oranına yakın), saha çizgileri
  return `
  <svg class="lines" viewBox="0 0 100 133" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="96" height="129" fill="none" stroke="${'rgba(244,247,242,0.55)'}" stroke-width="0.6"/>
    <line x1="2" y1="66.5" x2="98" y2="66.5" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <circle cx="50" cy="66.5" r="10" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <circle cx="50" cy="66.5" r="0.8" fill="rgba(244,247,242,0.55)"/>
    <!-- Üst kale (Real Madrid) -->
    <rect x="24" y="2" width="52" height="18" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="38" y="2" width="24" height="8" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="42" y="-1.6" width="16" height="3.6" fill="none" stroke="rgba(244,247,242,0.75)" stroke-width="0.8"/>
    <!-- Alt kale (Barcelona) -->
    <rect x="24" y="113" width="52" height="18" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="38" y="123" width="24" height="8" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="42" y="131" width="16" height="3.6" fill="none" stroke="rgba(244,247,242,0.75)" stroke-width="0.8"/>
  </svg>`;
}

function renderMatchEditor(param) {
  const weeks = getSortedWeeks();
  let week = null;
  if (param === 'current') {
    week = latestWeek();
  } else {
    week = getWeek(param);
  }

  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `
      ${topbarHTML('Bu Haftanın Maçı')}
      <div class="page">
        <div class="empty-state">
          <div style="font-size:2rem;">🏟️</div>
          <h3 style="color:var(--ink);margin-top:8px;">Henüz maç oluşturulmadı</h3>
          <p>Bu haftanın kadrosunu oluşturmak için başla.</p>
          <button class="btn" onclick="go('#/newmatch')">Yeni Maç Oluştur</button>
        </div>
      </div>`;
    return;
  }

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;
  const cap = FORMAT_CAPACITY[week.matchFormat];
  const countA = teamCountInWeek(week, 'A');
  const countB = teamCountInWeek(week, 'B');
  const activeA = activeTeamCountInWeek(week, 'A');
  const activeB = activeTeamCountInWeek(week, 'B');
  const redA = countA - activeA;
  const redB = countB - activeB;

  const tokensHTML = (week.lineup || []).map(l => {
    const p = getPlayer(l.playerId);
    if (!p) return '';
    const teamClass = l.team === 'A' ? 'teamA' : 'teamB';
    return `
      <div class="token" style="left:${l.x}%;top:${l.y}%;" data-pid="${p.id}" data-week="${week.id}">
        <div class="name-tag">${escapeHtml(p.name.split(' ')[0])}</div>
        <div style="position:relative;">
          ${avatarHTML(p, { teamClass })}
          ${l.redCard ? '<div class="redcard-badge"></div>' : ''}
        </div>
      </div>`;
  }).join('');

  app.innerHTML = `
    ${topbarHTML('Kadro / Saha')}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/match/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/match/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>
      <div class="week-meta">${formatDate(week.date)} · ${week.matchFormat} · ${cap} vs ${cap}</div>

      <div class="match-title">
        <div class="teams"><span class="teamA">${escapeHtml(state.teamNames.A)}</span><span class="vs">—</span><span class="teamB">${escapeHtml(state.teamNames.B)}</span></div>
      </div>

      <div class="team-counts">
        <span>${escapeHtml(state.teamNames.A)}: ${countA}/${cap} ${redA ? `· 🟥${redA}` : ''}</span>
        <span>${escapeHtml(state.teamNames.B)}: ${countB}/${cap} ${redB ? `· 🟥${redB}` : ''}</span>
      </div>

      <div class="team-actions">
        <button class="btn secondary" style="border-color:var(--barca);color:var(--barca);" onclick="openAddPlayerModal('${week.id}','A')">+ ${escapeHtml(state.teamNames.A)}'ya Ekle</button>
        <button class="btn secondary" style="border-color:var(--real);color:var(--real);" onclick="openAddPlayerModal('${week.id}','B')">+ ${escapeHtml(state.teamNames.B)}'e Ekle</button>
      </div>
      <button class="btn block secondary" style="margin-bottom:14px;" onclick="openAddPlayerModal('${week.id}', null)">👤 Oyuncu Ekle</button>

      <div class="pitch-wrap">
        <div class="pitch" id="pitchEl">
          ${pitchLinesSVG()}
          <div class="pitch-half-label top">${escapeHtml(state.teamNames.B)}</div>
          <div class="pitch-half-label bottom">${escapeHtml(state.teamNames.A)}</div>
          ${tokensHTML}
        </div>
      </div>
      <p style="text-align:center;color:rgba(244,247,242,0.5);font-size:0.75rem;">Oyuncuları sahada sürükleyerek konumlandırabilirsin. Detay için oyuncuya dokun.</p>
    </div>
  `;

  attachPitchDragHandlers(week.id);
  attachTokenTapHandlers(week.id);
}

/* --------- Sürükle-bırak (Pointer Events, mobil dokunmatik destekli) --------- */
function attachPitchDragHandlers(weekId) {
  const pitch = document.getElementById('pitchEl');
  if (!pitch) return;
  const tokens = pitch.querySelectorAll('.token');

  tokens.forEach(tok => {
    let dragging = false;
    let moved = false;
    let startX, startY;

    tok.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      tok.setPointerCapture(e.pointerId);
    });

    tok.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > 4 || dy > 4) moved = true;
      if (!moved) return;

      const rect = pitch.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;
      x = Math.max(4, Math.min(96, x));
      y = Math.max(4, Math.min(96, y));
      tok.style.left = x + '%';
      tok.style.top = y + '%';
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        const rect = pitch.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * 100;
        let y = ((e.clientY - rect.top) / rect.height) * 100;
        x = Math.max(4, Math.min(96, x));
        y = Math.max(4, Math.min(96, y));
        const week = getWeek(weekId);
        const entry = isPlayerInWeek(week, tok.dataset.pid);
        if (entry) { entry.x = x; entry.y = y; }
        saveState();
      } else {
        // Tıklama (sürükleme yok) -> detay aç
        openPlayerDetailPopover(weekId, tok.dataset.pid);
      }
    };

    tok.addEventListener('pointerup', endDrag);
    tok.addEventListener('pointercancel', () => { dragging = false; });
  });
}

function attachTokenTapHandlers(weekId) {
  // pointerup zaten tıklamayı da yönetiyor (attachPitchDragHandlers içinde)
}

/* --------- Oyuncu Ekle modalı --------- */
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
  ov.innerHTML = `<div class="sheet" style="position:relative;">
      <button class="sheet-close" onclick="closeSheet()">✕</button>
      <div class="sheet-handle"></div>
      ${innerHTML}
    </div>`;
  document.body.appendChild(ov);
}

function defaultPositionFor(week, team) {
  const cap = FORMAT_CAPACITY[week.matchFormat];
  const countOnTeam = teamCountInWeek(week, team);
  const slot = countOnTeam % cap;
  const cols = Math.min(cap, 5);
  const row = Math.floor(slot / cols);
  const totalInRow = Math.min(cols, cap - row * cols);
  const xStep = 80 / (totalInRow + 1);
  const x = 10 + xStep * ((slot % cols) + 1);
  let y;
  if (team === 'A') {
    // Barcelona: alt yarı (60-92)
    y = 92 - row * 16;
  } else {
    // Real Madrid: üst yarı (8-40)
    y = 10 + row * 16;
  }
  return { x: Math.max(6, Math.min(94, x)), y: Math.max(6, Math.min(94, y)) };
}

function openAddPlayerModal(weekId, presetTeam) {
  const week = getWeek(weekId);
  if (!week) return;

  const rows = state.players.map(p => {
    const entry = isPlayerInWeek(week, p.id);
    let tagHTML, actionHTML;
    if (entry) {
      const teamLabel = entry.team === 'A' ? state.teamNames.A : state.teamNames.B;
      const tagClass = entry.team === 'A' ? 'placedA' : 'placedB';
      tagHTML = `<span class="tag ${tagClass}">${escapeHtml(teamLabel)}</span>`;
      actionHTML = '';
    } else {
      tagHTML = '';
      if (presetTeam) {
        const label = presetTeam === 'A' ? state.teamNames.A : state.teamNames.B;
        actionHTML = `<button class="btn small" style="background:${presetTeam === 'A' ? 'var(--barca)' : 'var(--real)'};color:#fff;" onclick="addPlayerToTeam('${weekId}','${p.id}','${presetTeam}')">${escapeHtml(label)}'ya Ekle</button>`;
      } else {
        actionHTML = `<div class="pick-team-btns">
            <button class="bA" onclick="addPlayerToTeam('${weekId}','${p.id}','A')">${escapeHtml(state.teamNames.A)}</button>
            <button class="bB" onclick="addPlayerToTeam('${weekId}','${p.id}','B')">${escapeHtml(state.teamNames.B)}</button>
          </div>`;
      }
    }
    return `<div class="player-pick-row">
        ${miniAvatarHTML(p)}
        <div class="pname">${escapeHtml(p.name)}</div>
        ${tagHTML}
        ${actionHTML}
      </div>`;
  }).join('');

  openSheet(`
    <h3>Oyuncu Ekle</h3>
    <p style="color:var(--ink-soft);font-size:0.82rem;margin-top:-6px;">Kadroda olmayan bir oyuncuya dokunup takım seç.</p>
    <div style="margin-top:10px;max-height:56vh;overflow-y:auto;">${rows}</div>
  `);
}

function addPlayerToTeam(weekId, playerId, team) {
  const week = getWeek(weekId);
  if (!week) return;
  const cap = FORMAT_CAPACITY[week.matchFormat];
  if (teamCountInWeek(week, team) >= cap) {
    toast(`${team === 'A' ? state.teamNames.A : state.teamNames.B} kadrosu dolu (${cap} oyuncu).`);
    return;
  }
  if (isPlayerInWeek(week, playerId)) {
    toast('Bu oyuncu zaten kadroda.');
    return;
  }
  const pos = defaultPositionFor(week, team);
  week.lineup.push({ playerId, team, x: pos.x, y: pos.y, redCard: false });
  saveState();
  closeSheet();
  renderMatchEditor(week.id);
  toast('Oyuncu eklendi');
}

/* --------- Oyuncu detay / kırmızı kart --------- */
function openPlayerDetailPopover(weekId, playerId) {
  const week = getWeek(weekId);
  const p = getPlayer(playerId);
  if (!week || !p) return;
  const entry = isPlayerInWeek(week, playerId);
  const totals = computeTotals()[p.id] || { goals: 0, assists: 0 };
  const teamLabel = entry.team === 'A' ? state.teamNames.A : state.teamNames.B;

  openSheet(`
    <div class="detail-photo-row">
      ${avatarHTML(p, {})}
      <div>
        <h3>${escapeHtml(p.name)}</h3>
        <span class="pill">${escapeHtml(teamLabel)}</span>
      </div>
    </div>
    <div class="detail-stats">
      <div class="stat-box"><div class="num">${totals.goals}</div><div class="lbl">Toplam Gol</div></div>
      <div class="stat-box"><div class="num">${totals.assists}</div><div class="lbl">Toplam Asist</div></div>
    </div>
    <button class="btn ${entry.redCard ? 'secondary' : 'danger'} block" style="margin-bottom:10px;" onclick="toggleRedCard('${weekId}','${playerId}')">
      ${entry.redCard ? '🟥 Kırmızı Kartı Kaldır' : '🟥 Kırmızı Kart Ver'}
    </button>
    <button class="btn secondary block" style="margin-bottom:10px;" onclick="go('#/players'); closeSheet();">Oyuncu Profiline Git</button>
    <button class="btn block" style="background:rgba(228,72,63,0.1);color:var(--red-card);box-shadow:none;" onclick="removeFromWeek('${weekId}','${playerId}')">Takımdan Çıkar</button>
  `);
}

function toggleRedCard(weekId, playerId) {
  const week = getWeek(weekId);
  const entry = isPlayerInWeek(week, playerId);
  if (!entry) return;
  entry.redCard = !entry.redCard;
  saveState();
  closeSheet();
  renderMatchEditor(week.id);
}

function removeFromWeek(weekId, playerId) {
  const week = getWeek(weekId);
  if (!week) return;
  week.lineup = week.lineup.filter(l => l.playerId !== playerId);
  saveState();
  closeSheet();
  renderMatchEditor(week.id);
  toast('Oyuncu kadrodan çıkarıldı');
}

/* =========================================================
   İSTATİSTİKLER (Manuel gol/asist girişi)
   ========================================================= */
function renderStats(weekIdParam) {
  const app = document.getElementById('app');
  const weeks = getSortedWeeks();

  if (weeks.length === 0) {
    app.innerHTML = `
      ${topbarHTML('İstatistikler')}
      <div class="page">
        <div class="empty-state">
          <div style="font-size:2rem;">📊</div>
          <h3 style="color:var(--ink);margin-top:8px;">Henüz hafta yok</h3>
          <p>İstatistik girmek için önce bir maç/kadro oluştur.</p>
          <button class="btn" onclick="go('#/newmatch')">Yeni Maç Oluştur</button>
        </div>
      </div>`;
    return;
  }

  const week = weekIdParam ? getWeek(weekIdParam) : weeks[weeks.length - 1];
  const activeWeek = week || weeks[weeks.length - 1];

  const weekOptions = weeks.slice().reverse().map(w =>
    `<option value="${w.id}" ${w.id === activeWeek.id ? 'selected' : ''}>Hafta ${w.weekNumber} — ${formatDate(w.date)}</option>`
  ).join('');

  const rows = state.players.map(p => {
    const s = getWeekStat(activeWeek, p.id);
    return `<div class="stat-entry-row">
        ${miniAvatarHTML(p)}
        <div class="sname">${escapeHtml(p.name)}</div>
        <div class="num-input-group">
          <label>Gol</label>
          <input type="number" min="0" inputmode="numeric" id="goal_${p.id}" value="${s.goals || 0}">
        </div>
        <div class="num-input-group">
          <label>Asist</label>
          <input type="number" min="0" inputmode="numeric" id="assist_${p.id}" value="${s.assists || 0}">
        </div>
      </div>`;
  }).join('');

  const totals = computeTotals();
  const overviewRows = [...state.players].sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(p => `
    <div class="rank-row">
      ${miniAvatarHTML(p)}
      <div class="rname">${escapeHtml(p.name)}</div>
      <div class="rval">${totals[p.id].goals}<span>GOL</span></div>
      <div class="rval">${totals[p.id].assists}<span>ASİST</span></div>
    </div>`).join('');

  app.innerHTML = `
    ${topbarHTML('İstatistikler')}
    <div class="page">
      <label class="field-label">Hafta Seç</label>
      <select id="statWeekSelect" onchange="go('#/stats/' + this.value)">${weekOptions}</select>
      <div class="week-meta" style="margin-top:6px;">${activeWeek.matchFormat} maçı için gol/asist gir</div>

      <div class="card" style="margin-top:14px;">
        ${rows}
      </div>
      <button class="btn block" onclick="saveWeekStats('${activeWeek.id}')">Kaydet</button>

      <div class="section-title">Genel Toplamlar</div>
      ${overviewRows}
    </div>
  `;
  // Form doldururken uzaktan gelen anlık güncellemeler bu ekranı ezmesin.
  suppressAutoRender = true;
}

function saveWeekStats(weekId) {
  const week = getWeek(weekId);
  if (!week) return;
  const stats = state.players.map(p => {
    const g = parseInt(document.getElementById('goal_' + p.id).value, 10) || 0;
    const a = parseInt(document.getElementById('assist_' + p.id).value, 10) || 0;
    return { playerId: p.id, goals: g, assists: a };
  });
  week.weeklyStats = stats;
  saveState();
  toast('İstatistikler kaydedildi');
  renderStats(weekId);
}

/* =========================================================
   GOL / ASİST KRALLIĞI
   ========================================================= */
function renderRanking(type) {
  const app = document.getElementById('app');
  const totals = computeTotals();
  const title = type === 'goals' ? 'Gol Krallığı' : 'Asist Krallığı';
  const icon = type === 'goals' ? '⚽' : '🎯';

  const list = state.players
    .map(p => ({ p, val: totals[p.id][type] }))
    .sort((a, b) => b.val - a.val);

  let rank = 0, lastVal = null, shown = 0;
  const medals = ['🥇', '🥈', '🥉'];

  const rowsHTML = list.map((item, i) => {
    if (item.val !== lastVal) { rank = i + 1; lastVal = item.val; }
    const medal = rank <= 3 ? medals[rank - 1] : `#${rank}`;
    const topClass = rank === 1 ? ' top1' : '';
    return `<div class="rank-row${topClass}">
        <div class="rank-medal">${medal}</div>
        ${miniAvatarHTML(item.p)}
        <div class="rname">${escapeHtml(item.p.name)}</div>
        <div class="rval">${item.val}<span>${type === 'goals' ? 'GOL' : 'ASİST'}</span></div>
      </div>`;
  }).join('');

  app.innerHTML = `
    ${topbarHTML(title)}
    <div class="page">
      <div class="section-title">${icon} ${title}</div>
      ${rowsHTML}
    </div>
  `;
}

/* =========================================================
   HAFTANIN 6'SI
   ========================================================= */
function renderTeamOfWeek(weekIdParam) {
  const app = document.getElementById('app');
  const weeks = getSortedWeeks();

  if (weeks.length === 0) {
    app.innerHTML = `
      ${topbarHTML("Haftanın 6'sı")}
      <div class="page">
        <div class="empty-state">
          <div style="font-size:2rem;">⭐</div>
          <h3 style="color:var(--ink);margin-top:8px;">Henüz hafta yok</h3>
          <p>Önce bir maç/kadro oluştur, sonra o haftanın 6'sını seç.</p>
          <button class="btn" onclick="go('#/newmatch')">Yeni Maç Oluştur</button>
        </div>
      </div>`;
    return;
  }

  let week = weekIdParam ? getWeek(weekIdParam) : weeks[weeks.length - 1];
  if (!week) week = weeks[weeks.length - 1];
  if (!week.teamOfWeek) week.teamOfWeek = TOTW_DEFAULT_ROLES.map((role, i) => ({ slot: i, role, playerId: null }));

  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  // Formasyon görünümü: Forvet(1) - Orta Saha(2) - Defans(2) - Kaleci(1)
  const bySlotOrder = [5, 3, 4, 1, 2, 0]; // index sırası: forvet, os, os, def, def, kaleci
  const rowsDef = [
    [bySlotOrder[0]],
    [bySlotOrder[1], bySlotOrder[2]],
    [bySlotOrder[3], bySlotOrder[4]],
    [bySlotOrder[5]]
  ];

  function slotToken(slotIdx) {
    const s = week.teamOfWeek[slotIdx];
    const p = s.playerId ? getPlayer(s.playerId) : null;
    return `<div class="totw-slot" onclick="openTotwSlotEditor('${week.id}', ${slotIdx})">
        ${p ? avatarHTML(p, {}) : `<div class="avatar" style="background:rgba(255,255,255,0.15);border-style:dashed;">?</div>`}
        <div class="tname">${p ? escapeHtml(p.name.split(' ')[0]) : 'Seç'}</div>
        <div class="trole">${escapeHtml(s.role)}</div>
      </div>`;
  }

  const fieldHTML = rowsDef.map(row => `<div class="totw-row">${row.map(slotToken).join('')}</div>`).join('');

  app.innerHTML = `
    ${topbarHTML("Haftanın 6'sı")}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/totw/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/totw/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>
      <div class="week-meta">${formatDate(week.date)} · Kaleci dahil 6 oyuncu</div>

      <div class="totw-field">${fieldHTML}</div>
      <p style="text-align:center;color:rgba(244,247,242,0.5);font-size:0.75rem;margin-top:10px;">Bir slota dokunarak oyuncu ve pozisyon seç.</p>
    </div>
  `;
}

function openTotwSlotEditor(weekId, slotIdx) {
  const week = getWeek(weekId);
  if (!week) return;
  const slot = week.teamOfWeek[slotIdx];

  const usedIds = week.teamOfWeek.filter((s, i) => i !== slotIdx && s.playerId).map(s => s.playerId);
  const playerOptions = state.players.map(p =>
    `<option value="${p.id}" ${slot.playerId === p.id ? 'selected' : ''} ${usedIds.includes(p.id) ? 'disabled' : ''}>${escapeHtml(p.name)}${usedIds.includes(p.id) ? ' (seçili)' : ''}</option>`
  ).join('');

  const roleOptions = ROLE_OPTIONS.map(r => `<option value="${r}" ${slot.role === r ? 'selected' : ''}>${r}</option>`).join('');

  openSheet(`
    <h3>Slot ${slotIdx + 1}</h3>
    <label class="field-label">Pozisyon</label>
    <select id="totwRoleSelect">${roleOptions}</select>
    <label class="field-label">Oyuncu</label>
    <select id="totwPlayerSelect">
      <option value="">— Seçilmedi —</option>
      ${playerOptions}
    </select>
    <button class="btn block" style="margin-top:16px;" onclick="saveTotwSlot('${weekId}', ${slotIdx})">Kaydet</button>
    ${slot.playerId ? `<button class="btn secondary block" style="margin-top:10px;" onclick="clearTotwSlot('${weekId}', ${slotIdx})">Slotu Temizle</button>` : ''}
  `);
}

function saveTotwSlot(weekId, slotIdx) {
  const week = getWeek(weekId);
  const role = document.getElementById('totwRoleSelect').value;
  const playerId = document.getElementById('totwPlayerSelect').value || null;
  week.teamOfWeek[slotIdx].role = role;
  week.teamOfWeek[slotIdx].playerId = playerId;
  saveState();
  closeSheet();
  renderTeamOfWeek(week.id);
}

function clearTotwSlot(weekId, slotIdx) {
  const week = getWeek(weekId);
  week.teamOfWeek[slotIdx].playerId = null;
  saveState();
  closeSheet();
  renderTeamOfWeek(week.id);
}

/* =========================================================
   OYUNCULAR
   ========================================================= */
function renderPlayers() {
  const app = document.getElementById('app');
  const totals = computeTotals();

  const cards = [...state.players].sort((a, b) => a.squadNumber - b.squadNumber).map(p => `
    <div class="player-card" onclick="openPlayerProfile('${p.id}')">
      ${avatarHTML(p, {})}
      <div class="pname">${escapeHtml(p.name)}</div>
      <div class="pstats">
        <span>⚽ ${totals[p.id].goals}</span>
        <span>🎯 ${totals[p.id].assists}</span>
      </div>
    </div>
  `).join('');

  app.innerHTML = `
    ${topbarHTML('Oyuncular')}
    <div class="page">
      <div class="players-grid">${cards}</div>
    </div>
  `;
}

function openPlayerProfile(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;
  const totals = computeTotals()[p.id];

  // Bu oyuncunun haftalık geçmişi
  const weeks = getSortedWeeks().slice().reverse();
  const historyRows = weeks.map(w => {
    const s = getWeekStat(w, p.id);
    if (!s.goals && !s.assists && !isPlayerInWeek(w, p.id)) return '';
    return `<div class="stat-entry-row">
        <div class="sname">Hafta ${w.weekNumber} <span style="color:var(--ink-soft);font-weight:400;">(${formatDate(w.date)})</span></div>
        <div class="rval" style="font-size:0.95rem;">${s.goals}G / ${s.assists}A</div>
      </div>`;
  }).filter(Boolean).join('') || '<p style="color:var(--ink-soft);font-size:0.85rem;">Henüz kayıt yok.</p>';

  openSheet(`
    <div class="detail-photo-row">
      ${avatarHTML(p, {})}
      <div>
        <h3>${escapeHtml(p.name)}</h3>
        <span class="pill">Forma No: ${p.squadNumber}</span>
      </div>
    </div>
    <div class="detail-stats">
      <div class="stat-box"><div class="num">${totals.goals}</div><div class="lbl">Toplam Gol</div></div>
      <div class="stat-box"><div class="num">${totals.assists}</div><div class="lbl">Toplam Asist</div></div>
    </div>
    <input type="file" accept="image/*" id="photoInput_${p.id}" style="display:none;" onchange="handlePhotoUpload(event,'${p.id}')">
    <button class="btn secondary block" style="margin-bottom:10px;" onclick="document.getElementById('photoInput_${p.id}').click()">📷 Fotoğraf Değiştir</button>
    ${p.photo ? `<button class="btn block" style="background:rgba(228,72,63,0.1);color:var(--red-card);box-shadow:none;margin-bottom:14px;" onclick="removePhoto('${p.id}')">Fotoğrafı Kaldır</button>` : ''}
    <div class="section-title" style="color:var(--ink);margin-top:6px;">Haftalık Geçmiş</div>
    <div class="card" style="padding:6px 12px;">${historyRows}</div>
  `);
}

function compressImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
      else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handlePhotoUpload(event, playerId) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Lütfen bir görsel dosyası seç'); return; }
  toast('Fotoğraf hazırlanıyor…');
  try {
    const dataUrl = await compressImageFile(file, 480, 0.75);
    const p = getPlayer(playerId);
    p.photo = dataUrl;
    openPlayerProfile(playerId);
    suppressAutoRender = true;
    await savePhotoToServer(playerId, dataUrl);
    suppressAutoRender = false;
    toast('Fotoğraf herkesle paylaşıldı ✓');
  } catch (e) {
    console.error(e);
    toast('Fotoğraf işlenemedi');
  }
}

function removePhoto(playerId) {
  const p = getPlayer(playerId);
  p.photo = null;
  openPlayerProfile(playerId);
  deletePhotoFromServer(playerId);
  toast('Fotoğraf kaldırıldı');
}