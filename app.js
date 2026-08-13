/* =========================================================
   ÇARŞAMBA LİGİ — Haftalık Futbol İstatistik Uygulaması
   Tek dosyalık, bağımlılıksız (vanilla) JS uygulama.
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

const SUPABASE_URL = 'https://ivchraeubgpmwvfmknjz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M4k9fJUvd8gC0dsGRGKY0w_q5J5qZu7';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

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

/* ---------------- Storage katmanı ---------------- */
/* ---------------- Supabase Storage katmanı ---------------- */

const Storage = {

  async load() {
    try {
      const { data, error } = await supabaseClient
  .from('app_state')
  .select('data')
  .eq('id', 1)
  .maybeSingle();

      if (error) throw error;

      if (!data) {
        console.log('Supabase üzerinde henüz veri yok.');
        return null;
      }

      // Aynı zamanda tarayıcıya yedekle
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(data.data)
        );
      } catch (e) {
        console.warn('LocalStorage yedeği yazılamadı:', e);
      }

      return data.data;

    } catch (e) {
      console.error('Supabase verisi okunamadı:', e);

      // İnternet/Supabase sorunu olursa eski LocalStorage verisini kullan
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (localError) {
        console.error('Yerel veri de okunamadı:', localError);
        return null;
      }
    }
  },

  async save(data) {
  try {
    // LocalStorage yedeği
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
      );
    } catch (e) {
      console.warn('LocalStorage yedeği yazılamadı:', e);
    }

    console.log('Supabase kaydı başlıyor...');

    const result = await supabaseClient
      .from('app_state')
      .upsert(
        {
          id: 1,
          data: data,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'id'
        }
      )
      .select();

    console.log('Supabase sonucu:', result);

    if (result.error) {
      throw result.error;
    }

    console.log('✅ SUPABASE KAYDI BAŞARILI');
    return true;

  } catch (error) {
    console.error('❌ SUPABASE KAYDI BAŞARISIZ:', error);
    toast('Supabase kaydı başarısız: ' + error.message);
    return false;
  };
}

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

async function initializeApp() {
  try {
    const savedState = await Storage.load();

    if (savedState) {
      state = savedState;
      console.log('✓ Supabase verileri yüklendi.');
    } else {
      state = buildDefaultState();

      // İlk kez çalışıyorsa Supabase'e başlangıç verisini yaz
      await Storage.save(state);

      console.log('✓ İlk uygulama verileri oluşturuldu.');
    }

  } catch (error) {
    console.error('Uygulama başlatılamadı:', error);

    // Son çare LocalStorage
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (raw) {
        state = JSON.parse(raw);
      }
    } catch (e) {
      state = buildDefaultState();
    }
  }

  render();
}

let saveQueue = Promise.resolve();

function saveState() {
  // Kayıtları sıraya alır; aynı anda birden fazla Supabase kaydı çakışmaz.
  saveQueue = saveQueue
    .then(() => Storage.save(state))
    .catch(error => {
      console.error('Kayıt kuyruğu hatası:', error);
    });

  return saveQueue;
}
/* ---------------- Şifre Koruması ----------------
   İstatistik (gol/asist) değiştirme ve fotoğraf değiştirme işlemleri
   şifre ile korunur. Şifre bir kere girildikten sonra, sayfa yenilenene
   kadar (bu cihaz/sekme için) tekrar sorulmaz. */
const EDIT_PASSWORD = 'Berk2011+';
let isUnlocked = false;
let pendingAuthCallback = null;

function requireAuth(onSuccess) {
  if (isUnlocked) { onSuccess(); return; }
  openPasswordModal(onSuccess);
}

function openPasswordModal(onSuccess) {
  pendingAuthCallback = onSuccess;
  openSheet(`
    <h3>🔒 Şifre Gerekli</h3>
    <p style="color:var(--ink-soft);font-size:0.85rem;margin-top:-6px;">İstatistik veya fotoğraf değiştirmek için şifreyi gir.</p>
    <input type="password" id="authPasswordInput" placeholder="Şifre" autocomplete="off" style="margin-top:10px;width:100%;padding:11px 12px;border-radius:10px;border:1px solid #ddd;font-size:0.9rem;">
    <button class="btn block" style="margin-top:14px;" onclick="submitPassword()">Onayla</button>
  `);
  setTimeout(() => {
    const inp = document.getElementById('authPasswordInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPassword(); });
    }
  }, 60);
}

function submitPassword() {
  const inp = document.getElementById('authPasswordInput');
  const val = inp ? inp.value : '';
  if (val === EDIT_PASSWORD) {
    isUnlocked = true;
    closeSheet();
    toast('Kilit açıldı ✓');
    const cb = pendingAuthCallback;
    pendingAuthCallback = null;
    if (cb) cb();
  } else {
    toast('Yanlış şifre');
    if (inp) { inp.value = ''; inp.focus(); }
  }
}

function lockEditing() {
  isUnlocked = false;
  toast('Düzenleme kilitlendi 🔒');
  render();
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

function teamCountInWeek(week, team) {
  return (week.lineup || []).filter(l => l.team === team).length;
}

function activeTeamCountInWeek(week, team) {
  return (week.lineup || []).filter(l => l.team === team && !l.redCard).length;
}

function isPlayerInWeek(week, playerId) {
  return (week.lineup || []).find(l => l.playerId === playerId);
}

function getWeekStat(week, playerId) {
  const s = (week.weeklyStats || []).find(x => x.playerId === playerId);
  return s ? s : { playerId, goals: 0, assists: 0 };
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
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

function go(hash) {
  window.location.hash = hash;
}

function render() {
  const hash = window.location.hash || '#/home';
  const [, path, param] = hash.match(/^#\/([a-zA-Z]+)(?:\/(.+))?$/) || [null, 'home', null];
  window.scrollTo(0, 0);
  switch (path) {
    case 'home': return renderHome();
    case 'newmatch': return renderNewMatchFormat();
    case 'match': return renderMatchEditor(param);
    case 'stats': return renderStats(param);
    case 'goalkings': return renderRanking('goals');
    case 'assistkings': return renderRanking('assists');
    case 'totw': return renderTeamOfWeek(param);
    case 'players': return renderPlayers();
    case 'settings': return renderSettings();
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
  </div>`;
}

/* =========================================================
   ANA SAYFA
   ========================================================= */
function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="home-hero">
      <div class="eyebrow">Çarşamba Ligi</div>
      <h1>HAFTALIK FUTBOL</h1>
      <p>14 kişilik kadro • her hafta yeni maç • gol ve asist takibi</p>
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
    <div style="text-align:center; padding: 0 20px;"><button class="btn secondary block" onclick="go('#/settings')">⚙️ Ayarlar</button></div>
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
    lineup: [],
    weeklyStats: [],
    teamOfWeek: TOTW_DEFAULT_ROLES.map((role, i) => ({ slot: i, role, playerId: null })),
    score: { A: 0, B: 0, entered: false }
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
  return `
  <svg class="lines" viewBox="0 0 100 133" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="96" height="129" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <line x1="2" y1="66.5" x2="98" y2="66.5" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <circle cx="50" cy="66.5" r="10" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <circle cx="50" cy="66.5" r="0.8" fill="rgba(244,247,242,0.55)"/>
    <rect x="24" y="2" width="52" height="18" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="38" y="2" width="24" height="8" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="42" y="-1.6" width="16" height="3.6" fill="none" stroke="rgba(244,247,242,0.75)" stroke-width="0.8"/>
    <rect x="24" y="113" width="52" height="18" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="38" y="123" width="24" height="8" fill="none" stroke="rgba(244,247,242,0.55)" stroke-width="0.6"/>
    <rect x="42" y="131" width="16" height="3.6" fill="none" stroke="rgba(244,247,242,0.75)" stroke-width="0.8"/>
  </svg>`;
}

function renderMatchEditor(param) {
  const weeks = getSortedWeeks();
  let week = param === 'current' ? latestWeek() : getWeek(param);
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

  ensureWeekData(week);
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
      
      ${getScoreHTML(week)}
      <div class="extra-actions" style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn secondary block" onclick="openTeamNameModal()">⚙️ Takım İsimleri</button>
        <button class="btn danger block" onclick="deleteWeek('${week.id}')">🗑️ Haftayı Sil</button>
      </div>
    </div>
  `;

  attachPitchDragHandlers(week.id);
}

/* --------- Sürükle-bırak --------- */
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
      if (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) {
        moved = true;
      }
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
        if (entry) {
          entry.x = x;
          entry.y = y;
        }
        saveState();
      } else {
        openPlayerDetailPopover(weekId, tok.dataset.pid);
      }
    };

    tok.addEventListener('pointerup', endDrag);
    tok.addEventListener('pointercancel', () => { dragging = false; });
  });
}

/* --------- Modal / Sheet Yönetimi --------- */
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
    <div class="sheet" style="position:relative;">
      <button class="sheet-close" onclick="closeSheet()">✕</button>
      <div class="sheet-handle"></div>
      ${innerHTML}
    </div>
  `;
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
  const y = team === 'A' ? 92 - row * 16 : 10 + row * 16;
  return { x: Math.max(6, Math.min(94, x)), y: Math.max(6, Math.min(94, y)) };
}

function openAddPlayerModal(weekId, presetTeam) {
  const week = getWeek(weekId);
  if (!week) return;

  const rows = state.players.map(p => {
    const entry = isPlayerInWeek(week, p.id);
    let tagHTML = '', actionHTML = '';

    if (entry) {
      const teamLabel = entry.team === 'A' ? state.teamNames.A : state.teamNames.B;
      const tagClass = entry.team === 'A' ? 'placedA' : 'placedB';
      tagHTML = `<span class="tag ${tagClass}">${escapeHtml(teamLabel)}</span>`;
    } else {
      if (presetTeam) {
        const label = presetTeam === 'A' ? state.teamNames.A : state.teamNames.B;
        actionHTML = `<button class="btn small" style="background:${presetTeam === 'A' ? 'var(--barca)' : 'var(--real)'};color:#fff;" onclick="addPlayerToTeam('${weekId}','${p.id}','${presetTeam}')">${escapeHtml(label)}'ya Ekle</button>`;
      } else {
        actionHTML = `
          <div class="pick-team-btns">
            <button class="bA" onclick="addPlayerToTeam('${weekId}','${p.id}','A')">${escapeHtml(state.teamNames.A)}</button>
            <button class="bB" onclick="addPlayerToTeam('${weekId}','${p.id}','B')">${escapeHtml(state.teamNames.B)}</button>
          </div>`;
      }
    }

    return `
      <div class="player-pick-row">
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

/* ---------------- Veri ve İstatistik Tamamlayıcıları ---------------- */
function ensureWeekData(week) {
  if (!week.lineup) week.lineup = [];
  if (!week.weeklyStats) week.weeklyStats = [];
  if (!week.teamOfWeek) {
    week.teamOfWeek = TOTW_DEFAULT_ROLES.map((role, i) => ({ slot: i, role, playerId: null }));
  }
  if (!week.score) {
    week.score = { A: 0, B: 0, entered: false };
  }
  week.lineup.forEach(l => {
    if (typeof l.x !== 'number') l.x = 50;
    if (typeof l.y !== 'number') l.y = 50;
    if (typeof l.redCard !== 'boolean') l.redCard = false;
  });
  return week;
}

state.weeks.forEach(ensureWeekData);

function computeFullTotals() {
  const totals = {};
  state.players.forEach(p => {
    totals[p.id] = { matches: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, redCards: 0 };
  });

  state.weeks.forEach(week => {
    ensureWeekData(week);
    const playersThisWeek = new Set();

    week.lineup.forEach(lineup => {
      const id = lineup.playerId;
      if (!totals[id]) totals[id] = { matches: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, redCards: 0 };
      playersThisWeek.add(id);
      if (lineup.redCard) totals[id].redCards++;
    });

    playersThisWeek.forEach(playerId => {
      totals[playerId].matches++;
      const lineup = week.lineup.find(x => x.playerId === playerId);
      if (!lineup || !week.score.entered) return;

      if (week.score.A === week.score.B) {
        totals[playerId].draws++;
      } else if ((lineup.team === 'A' && week.score.A > week.score.B) || (lineup.team === 'B' && week.score.B > week.score.A)) {
        totals[playerId].wins++;
      } else {
        totals[playerId].losses++;
      }
    });

    (week.weeklyStats || []).forEach(stat => {
      if (!totals[stat.playerId]) totals[stat.playerId] = { matches: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, redCards: 0 };
      totals[stat.playerId].goals += Number(stat.goals) || 0;
      totals[stat.playerId].assists += Number(stat.assists) || 0;
    });
  });
  return totals;
}

function ensurePlayerWeekStat(week, playerId) {
  let stat = week.weeklyStats.find(x => x.playerId === playerId);
  if (!stat) {
    stat = { playerId, goals: 0, assists: 0 };
    week.weeklyStats.push(stat);
  }
  return stat;
}

/* ---------------- Oyuncu Detay & Skor İşlemleri ---------------- */
function openPlayerDetailPopover(weekId, playerId) {
  const week = getWeek(weekId);
  const player = getPlayer(playerId);
  if (!week || !player) return;

  const lineup = isPlayerInWeek(week, playerId);
  if (!lineup) return;

  const stat = getWeekStat(week, playerId);
  const totals = computeFullTotals()[playerId] || {};
  const teamName = lineup.team === 'A' ? state.teamNames.A : state.teamNames.B;

  openSheet(`
    <div style="text-align:center;">
      ${avatarHTML(player)}
      <h2 style="margin:10px 0 3px;">${escapeHtml(player.name)}</h2>
      <div style="color:var(--ink-soft);font-size:0.82rem;margin-bottom:15px;">${escapeHtml(teamName)}</div>
    </div>
    <div class="stat-grid" style="display:flex;gap:10px;margin-bottom:12px;">
      <div class="stat-box"><strong>${stat.goals}</strong><span>Gol</span></div>
      <div class="stat-box"><strong>${stat.assists}</strong><span>Asist</span></div>
      <div class="stat-box"><strong>${totals.matches || 0}</strong><span>Maç</span></div>
      <div class="stat-box"><strong>${totals.goals || 0}</strong><span>Toplam Gol</span></div>
    </div>
    <div class="card" style="margin-top:12px;">
      <div style="font-weight:800;margin-bottom:8px;">Bu Haftaki İstatistikleri</div>
      <div style="display:flex;gap:8px;">
        <button class="btn small" onclick="changePlayerStat('${weekId}','${playerId}','goals',1)">⚽ +1 Gol</button>
        <button class="btn small secondary" onclick="changePlayerStat('${weekId}','${playerId}','goals',-1)">− Gol</button>
        <button class="btn small" onclick="changePlayerStat('${weekId}','${playerId}','assists',1)">🎯 +1 Asist</button>
        <button class="btn small secondary" onclick="changePlayerStat('${weekId}','${playerId}','assists',-1)">− Asist</button>
      </div>
    </div>
    <div class="card" style="margin-top:12px;">
      <button class="btn block secondary" onclick="toggleRedCard('${weekId}','${playerId}')">${lineup.redCard ? '🟢 Kartı Kaldır' : '🟥 Kırmızı Kart Ver'}</button>
      <button class="btn block secondary" style="margin-top:7px;" onclick="switchPlayerTeam('${weekId}','${playerId}')">🔄 Takımı Değiştir</button>
      <button class="btn block danger" style="margin-top:7px;" onclick="removePlayerFromWeek('${weekId}','${playerId}')">❌ Kadrodan Çıkar</button>
    </div>
  `);
}

function changePlayerStat(weekId, playerId, type, amount) {
  requireAuth(() => {
    const week = getWeek(weekId);
    if (!week) return;
    const stat = ensurePlayerWeekStat(week, playerId);
    stat[type] = Math.max(0, (Number(stat[type]) || 0) + amount);
    saveState();
    closeSheet();
    openPlayerDetailPopover(weekId, playerId);
  });
}

function toggleRedCard(weekId, playerId) {
  const week = getWeek(weekId);
  const lineup = isPlayerInWeek(week, playerId);
  if (!lineup) return;
  lineup.redCard = !lineup.redCard;
  saveState();
  closeSheet();
  renderMatchEditor(weekId);
  toast(lineup.redCard ? '🟥 Kırmızı kart verildi' : '🟢 Kart kaldırıldı');
}

function switchPlayerTeam(weekId, playerId) {
  const week = getWeek(weekId);
  const lineup = isPlayerInWeek(week, playerId);
  if (!lineup) return;
  const newTeam = lineup.team === 'A' ? 'B' : 'A';
  const cap = FORMAT_CAPACITY[week.matchFormat];

  if (teamCountInWeek(week, newTeam) >= cap) {
    toast('Hedef takım kadrosu dolu.');
    return;
  }
  lineup.team = newTeam;
  const pos = defaultPositionFor(week, newTeam);
  lineup.x = pos.x;
  lineup.y = pos.y;
  saveState();
  closeSheet();
  renderMatchEditor(weekId);
  toast('Takım değiştirildi');
}

function removePlayerFromWeek(weekId, playerId) {
  const week = getWeek(weekId);
  if (!week || !window.confirm('Oyuncuyu kadrodan çıkarmak istiyor musun?')) return;
  week.lineup = week.lineup.filter(x => x.playerId !== playerId);
  week.weeklyStats = week.weeklyStats.filter(x => x.playerId !== playerId);
  saveState();
  closeSheet();
  renderMatchEditor(weekId);
  toast('Oyuncu çıkarıldı');
}

/* ---------------- Skor Yönetimi ---------------- */
function openScoreModal(weekId) {
  const week = getWeek(weekId);
  if (!week) return;
  ensureWeekData(week);

  openSheet(`
    <h3>Maç Skoru</h3>
    <div style="display:flex;gap:10px;align-items:center;margin:15px 0;">
      <div style="flex:1;"><label>${escapeHtml(state.teamNames.A)}</label><input id="scoreAInput" type="number" min="0" value="${week.score.A}"></div>
      <div>—</div>
      <div style="flex:1;"><label>${escapeHtml(state.teamNames.B)}</label><input id="scoreBInput" type="number" min="0" value="${week.score.B}"></div>
    </div>
    <button class="btn block" onclick="saveMatchScore('${weekId}')">💾 Skoru Kaydet</button>
  `);
}

function saveMatchScore(weekId) {
  const week = getWeek(weekId);
  if (!week) return;
  week.score = {
    A: Math.max(0, Number(document.getElementById('scoreAInput')?.value) || 0),
    B: Math.max(0, Number(document.getElementById('scoreBInput')?.value) || 0),
    entered: true
  };
  saveState();
  closeSheet();
  renderMatchEditor(weekId);
  toast('Skor kaydedildi');
}

function getScoreHTML(week) {
  ensureWeekData(week);
  if (!week.score.entered) {
    return `<div class="card" style="text-align:center;margin-top:14px;"><button class="btn small" onclick="openScoreModal('${week.id}')">Maç Skoru Gir</button></div>`;
  }
  return `
    <div class="card" style="text-align:center;margin-top:14px;">
      <div style="font-size:1.2rem;font-weight:bold;">${week.score.A} — ${week.score.B}</div>
      <button class="btn small secondary" style="margin-top:8px;" onclick="openScoreModal('${week.id}')">Skoru Düzenle</button>
    </div>`;
}

/* ---------------- Diğer Sayfalar (İstatistikler, Krallıklar, Ayarlar vb.) ---------------- */
function renderStats(param) {
  const app = document.getElementById('app');
  const totals = computeFullTotals();
  const sorted = [...state.players].sort((a, b) => (totals[b.id]?.goals || 0) - (totals[a.id]?.goals || 0));

  const rows = sorted.map((p, idx) => {
    const t = totals[p.id] || {};
    return `
      <div class="rank-row">
        <div class="rank-medal">${idx + 1}</div>
        ${miniAvatarHTML(p)}
        <div class="rname">${escapeHtml(p.name)}</div>
        <div class="rval">⚽ ${t.goals || 0} <span>🎯 ${t.assists || 0} Asist</span></div>
      </div>`;
  }).join('');

  app.innerHTML = `${topbarHTML('İstatistikler')} <div class="page"><div class="card">${rows}</div></div>`;
}

function renderRanking(type) {
  const app = document.getElementById('app');
  const totals = computeFullTotals();
  const title = type === 'goals' ? 'Gol Krallığı' : 'Asist Krallığı';
  const sorted = [...state.players].sort((a, b) => (totals[b.id]?.[type] || 0) - (totals[a.id]?.[type] || 0));

  const rows = sorted.map((p, idx) => `
    <div class="rank-row">
      <div class="rank-medal">${idx + 1}</div>
      ${miniAvatarHTML(p)}
      <div class="rname">${escapeHtml(p.name)}</div>
      <div class="rval">${totals[p.id]?.[type] || 0}</div>
    </div>`).join('');

  app.innerHTML = `${topbarHTML(title)} <div class="page">${rows}</div>`;
}

function renderPlayers() {
  const app = document.getElementById('app');
  const totals = computeFullTotals();

  const rows = state.players.map(p => {
    const t = totals[p.id] || {};
    return `
      <div class="player-card" onclick="openEditPlayerModal('${p.id}')">
        ${avatarHTML(p)}
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="pstats">#${p.squadNumber} · ${t.matches || 0} Maç</div>
      </div>`;
  }).join('');

  app.innerHTML = `
    ${topbarHTML('Oyuncular')}
    <div class="page">
      <div class="section-title">14 Sabit Oyuncu</div>
      <div class="players-grid">${rows}</div>
    </div>`;
}

function openEditPlayerModal(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;
  const totals = computeFullTotals()[p.id] || {};
  openSheet(`
    <div class="detail-photo-row">
      ${avatarHTML(p)}
      <div>
        <h3 style="margin:0;">${escapeHtml(p.name)}</h3>
        <span class="pill">#${p.squadNumber} · ⚽ ${totals.goals || 0} · 🎯 ${totals.assists || 0}</span>
      </div>
    </div>
    <input type="file" accept="image/*" id="photoInput_${p.id}" style="display:none;" onchange="handlePhotoUpload(event,'${p.id}')">
    <button class="btn secondary block" style="margin-bottom:8px;" onclick="triggerPhotoChange('${p.id}')">📷 Fotoğraf Değiştir</button>
    ${p.photo ? `<button class="btn block" style="background:rgba(228,72,63,0.1);color:var(--red-card);box-shadow:none;margin-bottom:14px;" onclick="requireAuth(() => removePhoto('${p.id}'))">Fotoğrafı Kaldır</button>` : ''}
    <h3 style="margin-top:6px;">Bilgileri Düzenle</h3>

<label>İsim</label>
<input
  id="editPlayerName"
  type="text"
  value="${escapeHtml(p.name)}"
  ${isUnlocked ? '' : 'disabled'}
>

<label style="margin-top:10px;display:block;">Numara</label>
<input
  id="editPlayerNumber"
  type="number"
  value="${p.squadNumber}"
  ${isUnlocked ? '' : 'disabled'}
>

${isUnlocked
  ? `<button class="btn block" style="margin-top:15px;" onclick="savePlayerEdit('${playerId}')">💾 Kaydet</button>`
  : `<div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.05);text-align:center;font-size:0.8rem;color:var(--ink-soft);">
       🔒 İsim ve forma numarası değiştirmek için düzenleme kilidini aç.
     </div>`
}
  `);
}

function savePlayerEdit(playerId) {
  if (!isUnlocked) {
    return toast('🔒 Önce düzenleme kilidini açmalısın.');
  }

  const p = getPlayer(playerId);
  if (!p) return;

  const nameInput = document.getElementById('editPlayerName');
  const numberInput = document.getElementById('editPlayerNumber');

  const name = nameInput?.value.trim();
  const squadNumber = Number(numberInput?.value);

  if (!name) {
    return toast('İsim boş olamaz');
  }

  if (!Number.isInteger(squadNumber) || squadNumber < 1 || squadNumber > 99) {
    return toast('Forma numarası 1-99 arasında olmalı');
  }

  p.name = name;
  p.squadNumber = squadNumber;

  saveState();
  closeSheet();
  renderPlayers();

  toast('Oyuncu bilgileri güncellendi ✓');
}
/* ---------------- Fotoğraf değiştirme (şifreyle korumalı) ---------------- */
function triggerPhotoChange(playerId) {
  requireAuth(() => {
    const inp = document.getElementById('photoInput_' + playerId);
    if (inp) inp.click();
  });
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
    saveState();
    toast('Fotoğraf güncellendi ✓');
    openEditPlayerModal(playerId);
  } catch (e) {
    console.error(e);
    toast('Fotoğraf işlenemedi');
  }
}

function removePhoto(playerId) {
  const p = getPlayer(playerId);
  p.photo = null;
  saveState();
  toast('Fotoğraf kaldırıldı');
  openEditPlayerModal(playerId);
}

function openTeamNameModal() {
  openSheet(`
    <h3>Takım İsimleri</h3>
    <label>Takım A</label><input id="teamANameInput" type="text" value="${escapeHtml(state.teamNames.A)}">
    <label style="margin-top:10px;display:block;">Takım B</label><input id="teamBNameInput" type="text" value="${escapeHtml(state.teamNames.B)}">
    <button class="btn block" style="margin-top:15px;" onclick="saveTeamNames()">Kaydet</button>
  `);
}

function saveTeamNames() {
  const a = document.getElementById('teamANameInput')?.value.trim();
  const b = document.getElementById('teamBNameInput')?.value.trim();
  if (!a || !b) return toast('İsimler boş olamaz');
  state.teamNames.A = a;
  state.teamNames.B = b;
  saveState();
  closeSheet();
  render();
  toast('Takım isimleri güncellendi');
}

function deleteWeek(weekId) {
  if (!window.confirm('Bu haftayı silmek istediğinize emin misiniz?')) return;
  state.weeks = state.weeks.filter(w => w.id !== weekId);
  saveState();
  go('#/home');
  toast('Hafta silindi');
}

function resetAllData() {
  if (!window.confirm('Tüm veriler sıfırlanacak?')) return;
  state = buildDefaultState();
  saveState();
  go('#/home');
  toast('Sıfırlandı');
}

function renderSettings() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${topbarHTML('Ayarlar')}
    <div class="page">
      <div class="card">
        <button class="btn block secondary" onclick="openTeamNameModal()">Takım İsimlerini Düzenle</button>
        <button class="btn block danger" style="margin-top:10px;" onclick="resetAllData()">Tüm Verileri Sıfırla</button>
      </div>
      <div class="card" style="text-align:center;">
        <div style="font-size:0.85rem;color:var(--ink-soft);margin-bottom:10px;">
          İstatistik ve fotoğraf değiştirme ${isUnlocked ? '<b style="color:var(--pitch);">şu an açık 🔓</b>' : '<b>şifreyle korunuyor 🔒</b>'}
        </div>
        ${isUnlocked ? `<button class="btn secondary block" onclick="lockEditing()">🔒 Kilitle</button>` : ''}
      </div>
    </div>`;
}

function renderTeamOfWeek(param) {
  const weeks = getSortedWeeks();
  const week = param === 'current' || !param ? latestWeek() : getWeek(param);
  const app = document.getElementById('app');

  if (!week) {
    app.innerHTML = `
      ${topbarHTML("Haftanın 6'sı")}
      <div class="page">
        <div class="empty-state">
          <div style="font-size:2rem;">⭐</div>
          <h3 style="color:var(--ink);margin-top:8px;">Maç bulunamadı</h3>
          <p>Önce bir hafta ve maç oluşturmalısın.</p>
        </div>
      </div>`;
    return;
  }

  ensureWeekData(week);
  const idx = weeks.findIndex(w => w.id === week.id);
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const nextWeek = idx < weeks.length - 1 ? weeks[idx + 1] : null;

  const slotsHTML = (week.teamOfWeek || []).map((item, index) => {
    const player = item.playerId ? getPlayer(item.playerId) : null;
    return `
      <div class="totw-slot-card" onclick="openTotwPlayerPicker('${week.id}', ${index})" style="background:var(--surface);border:1px solid var(--line);padding:10px;border-radius:12px;display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px;">
        <div style="font-weight:bold;font-size:0.8rem;color:var(--ink-soft);width:70px;">${escapeHtml(item.role)}</div>
        ${player ? miniAvatarHTML(player) : '<div class="mini-avatar" style="background:#ddd;display:flex;align-items:center;justify-content:center;font-size:12px;">+</div>'}
        <div style="flex:1;font-weight:600;font-size:0.9rem;">${player ? escapeHtml(player.name) : '<span style="color:var(--ink-soft);font-weight:normal;">Oyuncu Seç</span>'}</div>
      </div>
    `;
  }).join('');

  app.innerHTML = `
    ${topbarHTML("Haftanın 6'sı")}
    <div class="page">
      <div class="week-switch">
        <button ${prevWeek ? '' : 'disabled'} onclick="go('#/totw/${prevWeek ? prevWeek.id : ''}')">‹</button>
        <div class="week-chip">HAFTA ${week.weekNumber}</div>
        <button ${nextWeek ? '' : 'disabled'} onclick="go('#/totw/${nextWeek ? nextWeek.id : ''}')">›</button>
      </div>
      <div class="week-meta" style="text-align:center;margin-bottom:14px;">${formatDate(week.date)} · Haftanın En İyileri</div>

      <div class="card">
        <div style="font-weight:800;margin-bottom:10px;">İdeal 6'lı Kadro</div>
        ${slotsHTML}
      </div>
    </div>
  `;
}

function openTotwPlayerPicker(weekId, slotIndex) {
  const week = getWeek(weekId);
  if (!week) return;

  const eligiblePlayers = state.players.filter(p => isPlayerInWeek(week, p.id));
  const listToUse = eligiblePlayers.length > 0 ? eligiblePlayers : state.players;

  const rows = listToUse.map(p => `
    <div class="player-pick-row" onclick="assignTotwPlayer('${weekId}', ${slotIndex}, '${p.id}')" style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--line);cursor:pointer;">
      ${miniAvatarHTML(p)}
      <div class="pname" style="font-weight:600;">${escapeHtml(p.name)}</div>
    </div>
  `).join('');

  openSheet(`
    <h3>Haftanın 6'sı - Oyuncu Seç</h3>
    <p style="color:var(--ink-soft);font-size:0.82rem;margin-top:-6px;">Bu pozisyon için bir oyuncu seçin.</p>
    <div style="margin-top:10px;max-height:50vh;overflow-y:auto;">${rows}</div>
    <button class="btn secondary block" style="margin-top:10px;" onclick="assignTotwPlayer('${weekId}', ${slotIndex}, null)">Boşalt / Kaldır</button>
  `);
}

function assignTotwPlayer(weekId, slotIndex, playerId) {
  const week = getWeek(weekId);
  if (!week || !week.teamOfWeek) return;
  week.teamOfWeek[slotIndex].playerId = playerId;
  saveState();
  closeSheet();
  renderTeamOfWeek(weekId);
  toast("Haftanın 6'sı güncellendi"); // Çift tırnak ile hata giderildi
}
