// ============================================================
//  RESTLOG — main app
// ============================================================

const GOAL = 9;
const SCH = {
  1: { name: 'Monday',    bus: '08:15', leave: '08:03', alarm: '07:15', bedBy: '22:15', hair: true  },
  2: { name: 'Tuesday',   bus: '07:13', leave: '07:01', alarm: '06:31', bedBy: '21:31', hair: false },
  3: { name: 'Wednesday', bus: '07:47', leave: '07:35', alarm: '07:05', bedBy: '22:05', hair: false },
  4: { name: 'Thursday',  bus: '08:34', leave: '08:22', alarm: '07:34', bedBy: '22:34', hair: true  },
  5: { name: 'Friday',    bus: '08:34', leave: '08:22', alarm: '07:52', bedBy: '22:52', hair: false }
};

let sb, user;
let entries = [], holidays = [], backups = [];
let qv = 0, ev = 0, editQv = 0, editEv = 0;
let chart = null;

// ─── INIT ────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    user = session.user;
    await bootApp();
  } else {
    show('auth-screen');
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      user = session.user;
      await bootApp();
    } else if (event === 'SIGNED_OUT') {
      user = null;
      entries = []; holidays = []; backups = [];
      show('auth-screen');
    }
  });
});

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

async function bootApp() {
  show('app-screen');
  buildRating('qrow', 'q-val', v => { qv = v; });
  buildRating('erow', 'e-val', v => { ev = v; });
  buildRating('edit-qrow', 'edit-q-val', v => { editQv = v; });
  buildRating('edit-erow', 'edit-e-val', v => { editEv = v; });
  document.getElementById('bed').addEventListener('input', updatePreview);
  document.getElementById('wake').addEventListener('input', updatePreview);
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('hstart').value = today;
  document.getElementById('hend').value = today;
  document.getElementById('today-pill').textContent = fmtDate(today);
  await loadAll();
  renderBanner();
  renderSchedule();
  updatePreview();
  renderHistory();
  renderStats();
  renderHolidays();
  renderBackups();
}

async function loadAll() {
  const uid = user.id;
  const [eRes, hRes, bRes] = await Promise.all([
    sb.from('entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sb.from('holidays').select('*').eq('user_id', uid).order('start_date', { ascending: true }),
    sb.from('backups').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20)
  ]);
  entries  = (eRes.data  || []).map(r => dbToEntry(r));
  holidays = (hRes.data  || []).map(r => dbToHoliday(r));
  backups  = (bRes.data  || []);
}

function dbToEntry(r) {
  return {
    id: r.id, date: r.date, bed: r.bed_time, wake: r.wake_time,
    hrs: r.hours_slept, quality: r.quality, energy: r.energy,
    timingScore: r.timing_score, relaxed: r.relaxed
  };
}
function dbToHoliday(r) {
  return { id: r.id, start: r.start_date, end: r.end_date, label: r.label };
}

// ─── AUTH ─────────────────────────────────────────────────────

function showView(v) {
  document.getElementById('auth-login-view').style.display  = v === 'login'  ? '' : 'none';
  document.getElementById('auth-signup-view').style.display = v === 'signup' ? '' : 'none';
  document.getElementById('auth-error').style.display   = 'none';
  document.getElementById('signup-error').style.display = 'none';
}

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('auth-error');
  errEl.style.display = 'none';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; }
}

async function handleSignup() {
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl    = document.getElementById('signup-error');
  errEl.style.display = 'none';
  const { error } = await sb.auth.signUp({ email, password });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; }
  else { errEl.style.display = 'block'; errEl.style.background = 'rgba(74,222,128,0.1)'; errEl.style.borderColor = 'rgba(74,222,128,0.3)'; errEl.style.color = '#86efac'; errEl.textContent = 'Account created! Check your email to confirm, then sign in.'; }
}

async function handleSignout() {
  await sb.auth.signOut();
}

// ─── HELPERS ──────────────────────────────────────────────────

function t2m(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function calcH(b, w) {
  if (!b || !w) return null;
  let d = t2m(w) - t2m(b); if (d < 0) d += 1440;
  return Math.round(d / 60 * 10) / 10;
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-SE', { weekday: 'short', month: 'short', day: 'numeric' });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function isHol(dateStr) { return holidays.some(h => dateStr >= h.start && dateStr <= h.end); }
function isRelaxed(dateStr) {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return dow === 0 || dow === 6 || isHol(dateStr);
}

function tScore(bed, wake, relaxed) {
  const bm = t2m(bed), wm = t2m(wake), ba = bm < 6 * 60 ? bm + 1440 : bm;
  const wLim = relaxed ? 9 * 60 + 30 : 9 * 60;
  const bLim = relaxed ? 24 * 60 + 30 : 24 * 60;
  let s = 100;
  if (ba > bLim) s -= Math.min(relaxed ? 35 : 50, (ba - bLim) / (relaxed ? 8 : 6));
  if (ba < 21 * 60) s -= Math.min(20, (21 * 60 - ba) / 6);
  if (wm > wLim) s -= Math.min(relaxed ? 25 : 40, (wm - wLim) / (relaxed ? 8 : 6));
  if (wm < 6 * 60) s -= Math.min(20, (6 * 60 - wm) / 6);
  return Math.max(0, Math.round(s));
}

function dotCol(e) {
  const rel = e.relaxed != null ? e.relaxed : isRelaxed(e.date);
  const ts  = e.timingScore != null ? e.timingScore : tScore(e.bed, e.wake, rel);
  if (e.hrs >= GOAL && ts >= 70) return '#4ade80';
  if (e.hrs >= GOAL || e.hrs >= GOAL - 1) return '#fbbf24';
  return '#f87171';
}

function conScore(arr) {
  if (arr.length < 3) return null;
  const bs = arr.map(e => { const m = t2m(e.bed); return m < 6 * 60 ? m + 1440 : m; });
  const ws = arr.map(e => t2m(e.wake));
  const bM = bs.reduce((a, b) => a + b, 0) / bs.length;
  const wM = ws.reduce((a, b) => a + b, 0) / ws.length;
  const bSD = Math.sqrt(bs.reduce((s, v) => s + Math.pow(v - bM, 2), 0) / bs.length);
  const wSD = Math.sqrt(ws.reduce((s, v) => s + Math.pow(v - wM, 2), 0) / ws.length);
  return { score: Math.max(0, Math.round(100 - (bSD + wSD) / 2 / 3)), bSD: Math.round(bSD), wSD: Math.round(wSD) };
}

// ─── RATING BUTTONS ───────────────────────────────────────────

function buildRating(rowId, lblId, cb) {
  const el = document.getElementById(rowId); el.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const b = document.createElement('button');
    b.className = 'r-btn'; b.textContent = i; b.type = 'button';
    b.addEventListener('click', function () {
      const val = parseInt(this.textContent); cb(val);
      document.getElementById(lblId).textContent = val + '/10';
      el.querySelectorAll('.r-btn').forEach((x, idx) => x.classList.toggle('sel', idx < val));
    });
    el.appendChild(b);
  }
}

function setRating(rowId, lblId, val, cb) {
  cb(val || 0);
  const el = document.getElementById(rowId);
  el.querySelectorAll('.r-btn').forEach((x, idx) => x.classList.toggle('sel', val > 0 && idx < val));
  document.getElementById(lblId).textContent = val > 0 ? val + '/10' : '—';
}

// ─── LOG TAB ──────────────────────────────────────────────────

function updatePreview() {
  const bed = document.getElementById('bed').value;
  const wake = document.getElementById('wake').value;
  const h = calcH(bed, wake);
  document.getElementById('hours-val').textContent = h !== null ? h + 'h' : '—';
  const lbl = document.getElementById('hours-label');
  const tn  = document.getElementById('timing-note');
  if (!h) { lbl.textContent = ''; tn.textContent = ''; tn.className = 'timing-note'; return; }
  if (h >= GOAL) lbl.textContent = 'Goal met';
  else lbl.textContent = Math.round((GOAL - h) * 10) / 10 + 'h short of goal';
  if (bed && wake) {
    const rel = isRelaxed(todayStr());
    const ts  = tScore(bed, wake, rel);
    const bm  = t2m(bed), ba = bm < 6 * 60 ? bm + 1440 : bm, wm = t2m(wake);
    const notes = [];
    if (ba > 25 * 60) notes.push('very late bedtime — strong circadian disruption');
    else if (ba > 24 * 60 + (rel ? 30 : 0)) notes.push('late bedtime — try shifting earlier');
    if (wm > (rel ? 10 * 60 : 9 * 60)) notes.push('late wake — will delay melatonin onset tonight');
    const cls = ts >= 75 ? 'good' : ts >= 50 ? 'warning' : 'bad';
    const tag = rel ? ' (relaxed scoring)' : '';
    tn.textContent = 'Timing ' + ts + '/100' + (notes.length ? ' · ' + notes[0] : '') + tag;
    tn.className = 'timing-note ' + cls;
  }
}

async function saveEntry() {
  const bed = document.getElementById('bed').value;
  const wake = document.getElementById('wake').value;
  const hrs = calcH(bed, wake); if (!hrs) return;
  const today = todayStr();
  const rel = isRelaxed(today);
  const ts  = tScore(bed, wake, rel);
  const existing = entries.find(e => e.date === today);
  const payload = {
    user_id: user.id, date: today, bed_time: bed, wake_time: wake,
    hours_slept: hrs, quality: qv || null, energy: ev || null,
    timing_score: ts, relaxed: rel
  };
  let res;
  if (existing) {
    res = await sb.from('entries').update(payload).eq('id', existing.id).select().single();
  } else {
    res = await sb.from('entries').insert(payload).select().single();
  }
  if (res.data) {
    const mapped = dbToEntry(res.data);
    if (existing) { const idx = entries.findIndex(e => e.date === today); entries[idx] = mapped; }
    else entries.unshift(mapped);
    entries.sort((a, b) => b.date.localeCompare(a.date));
  }
  renderHistory(); renderStats();
  const btn = document.getElementById('save-btn');
  btn.textContent = 'Saved!'; btn.style.background = '#22c55e';
  setTimeout(() => { btn.textContent = "Save tonight's sleep"; btn.style.background = ''; }, 1600);
}

// ─── BANNER ───────────────────────────────────────────────────

function renderBanner() {
  const today = todayStr();
  const dow   = new Date(today + 'T12:00:00').getDay();
  const hol   = isHol(today);
  const el    = document.getElementById('day-banner');
  el.className = 'day-banner visible';
  if (hol) {
    const h = holidays.find(h => today >= h.start && today <= h.end);
    el.classList.add('holiday');
    el.innerHTML = `<div class="bn-title">${h ? h.label : 'Day off'} — no school</div><div class="bn-detail">Relaxed timing applies. Try not to sleep in more than ~1.5h past your usual wake time.</div>`;
    return;
  }
  const s = SCH[dow];
  if (!s) {
    el.classList.add('ok');
    el.innerHTML = `<div class="bn-title">Weekend — no school</div><div class="bn-detail">Relaxed timing applies. Up to ~1.5h sleep-in is fine (Phillips et al., 2017).</div>`;
    return;
  }
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  const bm = t2m(s.bedBy), diff = bm - nm;
  const hn = s.hair ? ' · hair wash day' : '';
  let msg = '';
  if (diff <= 0)       { el.classList.add('urgent');  msg = 'You should already be in bed to get 9h before tomorrow.'; }
  else if (diff <= 45) { el.classList.add('urgent');  msg = `Bed in ${diff} min to hit 9h.`; }
  else if (diff <= 90) { el.classList.add('warning'); msg = `Bed by ${s.bedBy} for 9h — ${diff} min from now.`; }
  else                 { el.classList.add('ok');      msg = `Aim to be in bed by ${s.bedBy} tonight for 9h.`; }
  el.innerHTML = `<div class="bn-title">${s.name} · alarm ${s.alarm} · leave ${s.leave}${hn}</div><div class="bn-detail">${msg}</div>`;
}

// ─── SCHEDULE ─────────────────────────────────────────────────

function renderSchedule() {
  document.getElementById('schedule-list').innerHTML = Object.values(SCH).map(s => {
    const badges = [];
    if (s.name === 'Tuesday') badges.push(`<span class="badge badge-red">Earliest</span>`);
    if (s.hair) badges.push(`<span class="badge badge-purple">Hair wash</span>`);
    return `<div class="sched-row">
      <span class="sched-day">${s.name} ${badges.join('')}</span>
      <span class="sched-times">Bus ${s.bus} · Leave ${s.leave} · Alarm ${s.alarm}</span>
      <span class="sched-bed">Bed by ${s.bedBy}</span>
    </div>`;
  }).join('');
}

// ─── HISTORY ──────────────────────────────────────────────────

function renderHistory() {
  const el = document.getElementById('history-list');
  if (!entries.length) { el.innerHTML = '<div class="empty-state">No entries yet. Log your first night.</div>'; return; }
  el.innerHTML = entries.slice(0, 30).map(e => {
    const rel = e.relaxed != null ? e.relaxed : isRelaxed(e.date);
    const ts  = e.timingScore != null ? e.timingScore : tScore(e.bed, e.wake, rel);
    const hbc = e.hrs >= GOAL ? 'badge-green' : e.hrs >= GOAL - 1 ? 'badge-amber' : 'badge-red';
    const tbc = ts >= 70 ? 'badge-green' : ts >= 50 ? 'badge-amber' : 'badge-red';
    const hol = isHol(e.date);
    const qe  = (e.quality || 0) > 0 ? ` Q:${e.quality}` : '';
    const ee  = (e.energy  || 0) > 0 ? ` E:${e.energy}`  : '';
    return `<div class="history-entry" onclick="openEdit('${e.date}')">
      <span class="entry-date">${fmtDate(e.date)}</span>
      <span class="entry-hrs">${e.hrs}h</span>
      <span class="entry-times">${e.bed}→${e.wake}${qe}${ee}</span>
      <span class="entry-badges">
        ${hol ? '<span class="badge badge-teal">Off</span>' : ''}
        <span class="badge ${hbc}">${e.hrs >= GOAL ? '9h ✓' : e.hrs + 'h'}</span>
        <span class="badge ${tbc}">T:${ts}</span>
      </span>
    </div>`;
  }).join('');
}

// ─── STATS ────────────────────────────────────────────────────

function renderStats() {
  if (!entries.length) return;
  const avg  = Math.round(entries.reduce((s, e) => s + e.hrs, 0) / entries.length * 10) / 10;
  const gh   = entries.filter(e => e.hrs >= GOAL).length;
  const rate = Math.round(gh / entries.length * 100);
  let streak = 0;
  for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date))) { if (e.hrs >= GOAL) streak++; else break; }
  const cs = conScore(entries);
  document.getElementById('stats-cards').innerHTML = `
    <div class="stat-card"><div class="stat-val">${avg}h</div><div class="stat-lbl">Avg hrs</div></div>
    <div class="stat-card"><div class="stat-val">${streak}</div><div class="stat-lbl">Streak</div></div>
    <div class="stat-card"><div class="stat-val">${rate}%</div><div class="stat-lbl">Goal rate</div></div>
    <div class="stat-card"><div class="stat-val">${cs ? cs.score + '/100' : '—'}</div><div class="stat-lbl">Consistency</div></div>
  `;
  const cn = document.getElementById('consistency-note');
  if (cs) {
    const bh = Math.round(cs.bSD / 60 * 10) / 10, wh = Math.round(cs.wSD / 60 * 10) / 10;
    let cls = '', msg = '';
    if (cs.score >= 80) { cls = 'good'; msg = 'Good consistency. Stable timing independently predicts better mood and cognition (Roenneberg et al.) — separate from total hours.'; }
    else if (cs.score >= 55) { cls = 'warning'; msg = `Moderate consistency — bedtime varies ~${bh}h and wake time ~${wh}h. Even small improvements here have measurable effects on how rested you feel.`; }
    else { cls = 'bad'; msg = 'Low consistency — high variability causes social jetlag (Roenneberg, 2012), linked to cognitive impairment and fatigue even when total hours look adequate.'; }
    cn.innerHTML = `<div class="consistency-note ${cls}">${msg}</div>`;
  } else {
    cn.innerHTML = '<div class="consistency-note">Log at least 3 nights to see your consistency score.</div>';
  }
  const l14 = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  if (chart) { chart.destroy(); chart = null; }
  chart = new Chart(document.getElementById('main-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: l14.map(e => { const d = new Date(e.date + 'T12:00:00'); return d.toLocaleDateString('en-SE', { month: 'short', day: 'numeric' }); }),
      datasets: [{ data: l14.map(e => e.hrs), backgroundColor: l14.map(e => dotCol(e)), borderRadius: 5, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.raw + 'h' } } },
      scales: {
        y: { min: 0, max: 12, ticks: { callback: v => v + 'h', font: { size: 11 }, color: '#55556a' }, grid: { color: 'rgba(255,255,255,0.05)' }, border: { color: 'transparent' } },
        x: { ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: false, color: '#55556a' }, grid: { display: false }, border: { color: 'transparent' } }
      }
    }
  });
  document.getElementById('dot-grid').innerHTML = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-28).map(e => {
    const rel = e.relaxed != null ? e.relaxed : isRelaxed(e.date);
    const ts  = e.timingScore != null ? e.timingScore : tScore(e.bed, e.wake, rel);
    const hol = isHol(e.date);
    const outline = hol ? `outline:2px solid #2dd4bf;outline-offset:2px;` : '';
    return `<div class="dot" style="background:${dotCol(e)};${outline}" title="${e.date} · ${e.hrs}h · timing ${ts}/100${hol ? ' · day off' : ''}"></div>`;
  }).join('');
}

// ─── HOLIDAYS ─────────────────────────────────────────────────

async function addHoliday() {
  const start = document.getElementById('hstart').value;
  const end   = document.getElementById('hend').value || start;
  const label = document.getElementById('hlabel').value.trim() || 'Day off';
  if (!start) return;
  const eff = end < start ? start : end;
  const { data, error } = await sb.from('holidays').insert({ user_id: user.id, start_date: start, end_date: eff, label }).select().single();
  if (data) { holidays.push(dbToHoliday(data)); holidays.sort((a, b) => a.start.localeCompare(b.start)); }
  document.getElementById('hlabel').value = '';
  renderHolidays(); renderBanner(); updatePreview();
}

async function removeHoliday(id) {
  await sb.from('holidays').delete().eq('id', id);
  holidays = holidays.filter(h => h.id !== id);
  renderHolidays(); renderBanner();
}

function renderHolidays() {
  const el = document.getElementById('holidays-list');
  if (!holidays.length) { el.innerHTML = '<div class="empty-state">No days off added yet.</div>'; return; }
  const today = todayStr();
  el.innerHTML = holidays.map(h => {
    const same   = h.start === h.end;
    const ds     = same ? h.start : h.start + ' → ' + h.end;
    const active = today >= h.start && today <= h.end;
    return `<div class="holiday-item">
      <span class="badge ${active ? 'badge-teal' : 'badge-purple'}" style="flex-shrink:0">${active ? 'Active' : 'Upcoming'}</span>
      <span class="holiday-name">${h.label}</span>
      <span class="holiday-dates">${ds}</span>
      <button class="remove-btn" onclick="removeHoliday('${h.id}')">×</button>
    </div>`;
  }).join('');
}

// ─── EDIT MODAL ───────────────────────────────────────────────

function openEdit(date) {
  const e = entries.find(x => x.date === date); if (!e) return;
  document.getElementById('edit-date').value = date;
  document.getElementById('edit-bed').value  = e.bed;
  document.getElementById('edit-wake').value = e.wake;
  document.getElementById('modal-title').textContent = 'Edit · ' + fmtDate(date);
  setRating('edit-qrow', 'edit-q-val', e.quality || 0, v => { editQv = v; });
  setRating('edit-erow', 'edit-e-val', e.energy  || 0, v => { editEv = v; });
  editQv = e.quality || 0; editEv = e.energy || 0;
  document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal(e) { if (e.target === document.getElementById('edit-modal')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('edit-modal').style.display = 'none'; }

async function saveEdit() {
  const date = document.getElementById('edit-date').value;
  const bed  = document.getElementById('edit-bed').value;
  const wake = document.getElementById('edit-wake').value;
  const hrs  = calcH(bed, wake); if (!hrs) return;
  const rel  = isRelaxed(date);
  const ts   = tScore(bed, wake, rel);
  const e    = entries.find(x => x.date === date); if (!e) return;
  const { data } = await sb.from('entries').update({
    bed_time: bed, wake_time: wake, hours_slept: hrs,
    quality: editQv || null, energy: editEv || null,
    timing_score: ts, relaxed: rel
  }).eq('id', e.id).select().single();
  if (data) {
    const idx = entries.findIndex(x => x.date === date);
    entries[idx] = dbToEntry(data);
  }
  closeModalDirect(); renderHistory(); renderStats();
}

async function deleteEntry() {
  const date = document.getElementById('edit-date').value;
  await autoBackup('before delete ' + date);
  const e = entries.find(x => x.date === date); if (!e) return;
  await sb.from('entries').delete().eq('id', e.id);
  entries = entries.filter(x => x.date !== date);
  closeModalDirect(); renderHistory(); renderStats();
}

// ─── BACKUP ───────────────────────────────────────────────────

async function autoBackup(label) {
  const snap = JSON.stringify({ entries, holidays });
  await sb.from('backups').insert({ user_id: user.id, label: 'auto — ' + label, snapshot: snap });
  const { data } = await sb.from('backups').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  backups = data || [];
  renderBackups();
}

async function createBackup() {
  const label = document.getElementById('bkname').value.trim() || 'Manual backup';
  const snap  = JSON.stringify({ entries, holidays });
  await sb.from('backups').insert({ user_id: user.id, label, snapshot: snap });
  const { data } = await sb.from('backups').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  backups = data || [];
  document.getElementById('bkname').value = '';
  renderBackups();
  const btn = document.getElementById('bk-btn');
  btn.textContent = 'Backup saved!'; btn.style.background = '#22c55e';
  setTimeout(() => { btn.textContent = 'Create backup now'; btn.style.background = ''; }, 1600);
}

async function restoreBackup(id) {
  const bk = backups.find(b => b.id === id); if (!bk) return;
  await autoBackup('before restore');
  const snap = JSON.parse(bk.snapshot);
  // Delete all existing entries and holidays, then reinsert
  await sb.from('entries').delete().eq('user_id', user.id);
  await sb.from('holidays').delete().eq('user_id', user.id);
  if (snap.entries.length) {
    await sb.from('entries').insert(snap.entries.map(e => ({
      user_id: user.id, date: e.date, bed_time: e.bed, wake_time: e.wake,
      hours_slept: e.hrs, quality: e.quality || null, energy: e.energy || null,
      timing_score: e.timingScore, relaxed: e.relaxed
    })));
  }
  if (snap.holidays.length) {
    await sb.from('holidays').insert(snap.holidays.map(h => ({
      user_id: user.id, start_date: h.start, end_date: h.end, label: h.label
    })));
  }
  await loadAll();
  renderHistory(); renderStats(); renderHolidays(); renderBanner(); renderBackups();
  alert('Restored: ' + bk.label);
}

function renderBackups() {
  const el = document.getElementById('backup-list');
  if (!backups.length) { el.innerHTML = '<div class="empty-state">No backups yet.</div>'; return; }
  el.innerHTML = backups.map(b => {
    const d    = new Date(b.created_at);
    const ds   = d.toLocaleDateString('en-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const auto = b.label.startsWith('auto');
    return `<div class="backup-item">
      <span class="badge ${auto ? 'badge-amber' : 'badge-purple'}" style="flex-shrink:0">${auto ? 'Auto' : 'Manual'}</span>
      <span class="backup-name">${b.label}</span>
      <span class="backup-meta">${ds}</span>
      <button class="restore-btn" onclick="restoreBackup('${b.id}')">Restore</button>
    </div>`;
  }).join('');
}

// ─── EXPORT ───────────────────────────────────────────────────

function buildExport() {
  if (!entries.length) return 'No data yet.';
  const s    = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const avg  = Math.round(s.reduce((x, e) => x + e.hrs, 0) / s.length * 10) / 10;
  const gh   = s.filter(e => e.hrs >= GOAL).length;
  const cs   = conScore(s);
  let streak = 0; for (const e of [...s].reverse()) { if (e.hrs >= GOAL) streak++; else break; }
  const lines = [
    '=== Alvar sleep data ===', 'Exported: ' + new Date().toLocaleDateString('en-SE'), 'Goal: ' + GOAL + 'h/night', '',
    '--- Summary ---', 'Nights logged: ' + s.length, 'Average: ' + avg + 'h',
    'Goal hit rate: ' + Math.round(gh / s.length * 100) + '% (' + gh + '/' + s.length + ')',
    'Streak: ' + streak + ' nights',
    'Consistency: ' + (cs ? cs.score + '/100 (bed SD: ' + Math.round(cs.bSD / 60 * 10) / 10 + 'h, wake SD: ' + Math.round(cs.wSD / 60 * 10) / 10 + 'h)' : 'insufficient data'),
    holidays.length ? '\n--- Days off ---\n' + holidays.map(h => h.label + ': ' + h.start + (h.start !== h.end ? ' to ' + h.end : '')).join('\n') : '',
    '', '--- All entries ---', 'date        day  bed    wake   hrs   timing  Q    E    status  relaxed'
  ];
  s.forEach(e => {
    const d   = new Date(e.date + 'T12:00:00');
    const day = d.toLocaleDateString('en-SE', { weekday: 'short' });
    const rel = e.relaxed != null ? e.relaxed : isRelaxed(e.date);
    const ts  = e.timingScore != null ? e.timingScore : tScore(e.bed, e.wake, rel);
    lines.push(e.date + ' ' + day + ' ' + e.bed + '  ' + e.wake + ' ' + e.hrs + 'h  ' + ts + '/100  ' + (e.quality || '—') + '/10 ' + (e.energy || '—') + '/10 ' + (e.hrs >= GOAL ? 'GOAL' : 'short ' + (Math.round((GOAL - e.hrs) * 10) / 10) + 'h') + (rel ? ' yes' : ''));
  });
  return lines.join('\n');
}

function doCopy() {
  const t = buildExport();
  navigator.clipboard.writeText(t).then(() => {
    const b = document.getElementById('copy-btn'); b.textContent = 'Copied!';
    setTimeout(() => b.textContent = 'Copy sleep summary to clipboard', 2000);
  }).catch(() => { alert('Copy failed — try long-pressing the text below.'); });
}

// ─── TAB SWITCHING ────────────────────────────────────────────

function switchTab(t) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + t).classList.add('active');
  document.querySelector(`[data-tab="${t}"]`).classList.add('active');
  if (t === 'stats') renderStats();
}
