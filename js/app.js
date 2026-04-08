// ─────────────────────────────────────────────────────────────
//  RESTLOG — complete app logic
//  Date model: an "entry" is keyed on the NIGHT it starts.
//  entry.date = "2025-04-07" means sleep starting evening of Apr 7
//  waking morning of Apr 8. Displayed as "7–8 Apr".
//  The alarm that matters = tomorrow (date+1) schedule.
// ─────────────────────────────────────────────────────────────

const GOAL = 9;

// Schedule: keyed by day-of-week of the MORNING (wake day)
// e.g. key 1 = Monday morning alarm, meaning Sunday night bed target
const SCH = {
  1: { name:'Monday',    bus:'08:15', leave:'08:03', alarm:'07:15', bedBy:'22:15', hair:true  },
  2: { name:'Tuesday',   bus:'07:13', leave:'07:01', alarm:'06:31', bedBy:'21:31', hair:false },
  3: { name:'Wednesday', bus:'07:47', leave:'07:35', alarm:'07:05', bedBy:'22:05', hair:false },
  4: { name:'Thursday',  bus:'08:34', leave:'08:22', alarm:'07:34', bedBy:'22:34', hair:true  },
  5: { name:'Friday',    bus:'08:34', leave:'08:22', alarm:'07:52', bedBy:'22:52', hair:false }
};

let sb, user;
let entries=[], holidays=[], backups=[];
let qv=0, ev=0, editQv=0, editEv=0;
let chart=null;

// ─── INIT ────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data:{ session } } = await sb.auth.getSession();
  if (session) { user=session.user; await bootApp(); }
  else show('auth-screen');
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event==='SIGNED_IN' && session) { user=session.user; await bootApp(); }
    else if (event==='SIGNED_OUT') { user=null; entries=[]; holidays=[]; backups=[]; show('auth-screen'); }
  });
});

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function bootApp() {
  show('app-screen');
  buildRating('qrow','q-val', v=>{ qv=v; });
  buildRating('erow','e-val', v=>{ ev=v; });
  buildRating('edit-qrow','edit-q-val', v=>{ editQv=v; });
  buildRating('edit-erow','edit-e-val', v=>{ editEv=v; });
  document.getElementById('bed').addEventListener('input', updatePreview);
  document.getElementById('wake').addEventListener('input', updatePreview);
  const t = todayStr();
  document.getElementById('hstart').value = t;
  document.getElementById('hend').value   = t;
  document.getElementById('today-pill').textContent = fmtShort(t);
  // Default log date to yesterday (the night that just ended)
  document.getElementById('log-date').value = addDays(t, -1);
  document.getElementById('log-date').addEventListener('change', () => { updatePreview(); updateLogNight(); });
  // Keep modal title in sync when date is changed
  document.getElementById('edit-date').addEventListener('change', function() {
    document.getElementById('modal-title').textContent = fmtNight(this.value);
  });
  await loadAll();
  renderBanner();
  renderSchedule();
  updatePreview();
  renderHistory();
  renderStats();
  renderHolidays();
  renderBackups();
  updateLogNight();
}

async function loadAll() {
  const uid = user.id;
  const [eR, hR, bR] = await Promise.all([
    sb.from('entries').select('*').eq('user_id',uid).order('date',{ascending:false}),
    sb.from('holidays').select('*').eq('user_id',uid).order('start_date',{ascending:true}),
    sb.from('backups').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(20)
  ]);
  entries  = (eR.data||[]).map(dbToEntry);
  holidays = (hR.data||[]).map(dbToHoliday);
  backups  = (bR.data||[]);
}

function dbToEntry(r) {
  return { id:r.id, date:r.date, bed:r.bed_time, wake:r.wake_time,
           hrs:r.hours_slept, quality:r.quality, energy:r.energy,
           timingScore:r.timing_score, relaxed:r.relaxed };
}
function dbToHoliday(r) {
  return { id:r.id, start:r.start_date, end:r.end_date, label:r.label };
}

// ─── HELPERS ──────────────────────────────────────────────────

function t2m(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }

function calcH(b,w) {
  if (!b||!w) return null;
  let d = t2m(w)-t2m(b); if(d<0) d+=1440;
  return Math.round(d/60*10)/10;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function addDays(dateStr, n) {
  const d = new Date(dateStr+'T12:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}

// Format entry date as "6–7 Apr" (night of 6th, wakes 7th)
function fmtNight(dateStr) {
  const d1 = new Date(dateStr+'T12:00:00');
  const d2 = new Date(dateStr+'T12:00:00'); d2.setDate(d2.getDate()+1);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m1 = months[d1.getMonth()], m2 = months[d2.getMonth()];
  if (m1===m2) return `${d1.getDate()}–${d2.getDate()} ${m1}`;
  return `${d1.getDate()} ${m1}–${d2.getDate()} ${m2}`;
}

// Short format for header pill
function fmtShort(dateStr) {
  const d = new Date(dateStr+'T12:00:00');
  return d.toLocaleDateString('en-SE',{weekday:'short',month:'short',day:'numeric'});
}

// Day-of-week name for a date string
function dowName(dateStr) {
  return new Date(dateStr+'T12:00:00').toLocaleDateString('en-SE',{weekday:'short'});
}

// Is a given date a holiday?
function isHol(dateStr) { return holidays.some(h=>dateStr>=h.start&&dateStr<=h.end); }

// Is a given date a "relaxed" morning (weekend or holiday)?
function isRelaxedMorning(dateStr) {
  const dow = new Date(dateStr+'T12:00:00').getDay();
  return dow===0||dow===6||isHol(dateStr);
}

// For an entry with date=nightStart, the morning is nightStart+1
function entryMorning(entry) { return addDays(entry.date, 1); }

// Get school schedule for a morning date (null if weekend/holiday/no school)
function morningSchedule(morningDateStr) {
  if (isHol(morningDateStr)) return null;
  const dow = new Date(morningDateStr+'T12:00:00').getDay();
  return SCH[dow]||null;
}

// Timing score — relaxed if the morning (wake day) is a weekend or holiday
function tScore(bed, wake, relaxedMorning) {
  const bm=t2m(bed), wm=t2m(wake), ba=bm<6*60?bm+1440:bm;
  const wLim = relaxedMorning ? 9*60+30 : 9*60;
  const bLim = relaxedMorning ? 24*60+30 : 24*60;
  let s=100;
  if(ba>bLim)  s-=Math.min(relaxedMorning?35:50, (ba-bLim)/(relaxedMorning?8:6));
  if(ba<21*60) s-=Math.min(20,(21*60-ba)/6);
  if(wm>wLim)  s-=Math.min(relaxedMorning?25:40, (wm-wLim)/(relaxedMorning?8:6));
  if(wm<6*60)  s-=Math.min(20,(6*60-wm)/6);
  return Math.max(0,Math.round(s));
}

function dotCol(e) {
  const morning = entryMorning(e);
  const rel = e.relaxed!=null ? e.relaxed : isRelaxedMorning(morning);
  const ts  = e.timingScore!=null ? e.timingScore : tScore(e.bed,e.wake,rel);
  if(e.hrs>=GOAL&&ts>=70) return '#4ade80';
  if(e.hrs>=GOAL||e.hrs>=GOAL-1) return '#fbbf24';
  return '#f87171';
}

function conScore(arr) {
  if(arr.length<3) return null;
  const bs=arr.map(e=>{const m=t2m(e.bed);return m<6*60?m+1440:m;});
  const ws=arr.map(e=>t2m(e.wake));
  const bM=bs.reduce((a,b)=>a+b,0)/bs.length, wM=ws.reduce((a,b)=>a+b,0)/ws.length;
  const bSD=Math.sqrt(bs.reduce((s,v)=>s+Math.pow(v-bM,2),0)/bs.length);
  const wSD=Math.sqrt(ws.reduce((s,v)=>s+Math.pow(v-wM,2),0)/ws.length);
  return{score:Math.max(0,Math.round(100-(bSD+wSD)/2/3)),bSD:Math.round(bSD),wSD:Math.round(wSD)};
}

// ─── AUTH ─────────────────────────────────────────────────────

function showView(v) {
  document.getElementById('auth-login-view').style.display  = v==='login'  ? '':'none';
  document.getElementById('auth-signup-view').style.display = v==='signup' ? '':'none';
  document.getElementById('auth-error').style.display   = 'none';
  document.getElementById('signup-error').style.display = 'none';
}

async function handleLogin() {
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  const errEl=document.getElementById('auth-error'); errEl.style.display='none';
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){errEl.textContent=error.message;errEl.style.display='block';}
}

async function handleSignup() {
  const email=document.getElementById('signup-email').value.trim();
  const password=document.getElementById('signup-password').value;
  const errEl=document.getElementById('signup-error'); errEl.style.display='none';
  const {error}=await sb.auth.signUp({email,password});
  if(error){errEl.textContent=error.message;errEl.style.display='block';}
  else{
    errEl.style.cssText='display:block;background:rgba(61,214,140,0.1);border-color:rgba(61,214,140,0.3);color:#86efac';
    errEl.textContent='Account created! Check your email to confirm, then sign in.';
  }
}

async function handleSignout() { await sb.auth.signOut(); }

// ─── RATING BUTTONS ───────────────────────────────────────────

function buildRating(rowId, lblId, cb) {
  const el=document.getElementById(rowId); el.innerHTML='';
  for(let i=1;i<=10;i++){
    const b=document.createElement('button');
    b.className='r-btn'; b.textContent=i; b.type='button';
    b.addEventListener('click',function(){
      const val=parseInt(this.textContent); cb(val);
      document.getElementById(lblId).textContent=val+'/10';
      el.querySelectorAll('.r-btn').forEach((x,idx)=>x.classList.toggle('sel',idx<val));
    });
    el.appendChild(b);
  }
}

function setRating(rowId, lblId, val, cb) {
  cb(val||0);
  const el=document.getElementById(rowId);
  el.querySelectorAll('.r-btn').forEach((x,idx)=>x.classList.toggle('sel',val>0&&idx<val));
  document.getElementById(lblId).textContent=val>0?val+'/10':'—';
}

// ─── LOG NIGHT DISPLAY ────────────────────────────────────────

function updateLogNight() {
  const d = document.getElementById('log-date').value;
  const span = document.getElementById('log-night-fmt');
  if(span) span.textContent = d ? fmtNight(d) : '';
  const btn = document.getElementById('save-btn');
  if(!btn) return;
  btn.textContent = d ? 'Save entry for '+fmtNight(d) : 'Save entry';
}

// ─── LOG PREVIEW ──────────────────────────────────────────────

function updatePreview() {
  const bed=document.getElementById('bed').value;
  const wake=document.getElementById('wake').value;
  const h=calcH(bed,wake);
  document.getElementById('hours-val').textContent=h!==null?h+'h':'—';
  const lbl=document.getElementById('hours-label');
  const tn=document.getElementById('timing-note');
  if(!h){lbl.textContent='';tn.textContent='';tn.className='timing-note';return;}

  // Use the selected log date; morning = log date + 1
  const nightDate=document.getElementById('log-date').value||addDays(todayStr(),-1);
  const morning=addDays(nightDate,1);
  const relaxed=isRelaxedMorning(morning);
  const sch=morningSchedule(morning);

  if(h>=GOAL) lbl.textContent='Goal met ✓';
  else lbl.textContent=Math.round((GOAL-h)*10)/10+'h short of goal';

  if(bed&&wake){
    const ts=tScore(bed,wake,relaxed);
    const bm=t2m(bed), ba=bm<6*60?bm+1440:bm, wm=t2m(wake);
    const notes=[];
    if(ba>25*60) notes.push('very late — strong circadian disruption');
    else if(ba>24*60+(relaxed?30:0)) notes.push('late bedtime — try shifting earlier');
    if(wm>(relaxed?10*60:9*60)) notes.push('late wake — delays melatonin onset tomorrow night');
    const cls=ts>=75?'good':ts>=50?'warning':'bad';
    const tag=relaxed?' · relaxed scoring':'';
    tn.textContent='Timing '+ts+'/100'+(notes.length?' · '+notes[0]:'')+tag;
    tn.className='timing-note '+cls;
  }
}

// ─── BANNER ───────────────────────────────────────────────────

function renderBanner() {
  const tonight=todayStr();
  const tomorrow=addDays(tonight,1);
  const tomorrowSch=morningSchedule(tomorrow); // what matters for bedtime
  const tomorrowRelaxed=isRelaxedMorning(tomorrow);

  const el=document.getElementById('day-banner');
  el.className='day-banner visible';

  const now=new Date(), nm=now.getHours()*60+now.getMinutes();

  // Determine tonight's required bedtime
  let bedBy, targetLine, urgency='ok';
  if(tomorrowSch && !isHol(tomorrow)){
    bedBy=tomorrowSch.bedBy;
    const hn=tomorrowSch.hair?' · hair wash':'';
    targetLine=`${tomorrowSch.name} alarm ${tomorrowSch.alarm}${hn}`;
  } else {
    bedBy='23:30';
    targetLine='no school tomorrow — relaxed night';
  }

  const diff=t2m(bedBy)-nm;
  let msg='';
  if(diff<=0)       {urgency='urgent'; msg='You should already be in bed to hit 9h.';}
  else if(diff<=45) {urgency='urgent'; msg=`Bed in ${diff} min to hit 9h.`;}
  else if(diff<=90) {urgency='warning';msg=`Bed by ${bedBy} for 9h — ${diff} min from now.`;}
  else              {msg=`Aim to be in bed by ${bedBy} tonight for 9h.`;}

  el.classList.add(urgency);

  // Title line: always show TOMORROW's schedule (that's what tonight is about)
  let titleLine='';
  if(!tomorrowSch || isHol(tomorrow) || isRelaxedMorning(tomorrow)){
    const isWeekend = new Date(tomorrow+'T12:00:00').getDay()===0 || new Date(tomorrow+'T12:00:00').getDay()===6;
    const holEntry = holidays.find(h=>tomorrow>=h.start&&tomorrow<=h.end);
    if(holEntry) titleLine=holEntry.label+' tomorrow — relaxed night';
    else if(isWeekend) titleLine='Weekend tomorrow — relaxed night';
    else titleLine='No school tomorrow';
  } else {
    const hn=tomorrowSch.hair?' · hair wash':'';
    titleLine=`${tomorrowSch.name} · alarm ${tomorrowSch.alarm} · leave ${tomorrowSch.leave}${hn}`;
  }

  el.innerHTML=`
    <div class="bn-row">
      <div class="bn-left">
        <div class="bn-title">${titleLine}</div>
        <div class="bn-detail">${msg} <span class="bn-target">${targetLine}</span></div>
      </div>
      <div class="bn-bedtime">${bedBy}</div>
    </div>`;
}

// ─── SCHEDULE ─────────────────────────────────────────────────

function renderSchedule() {
  // Each row: "X night" → "Y morning alarm"
  const nightNames={1:'Sunday',2:'Monday',3:'Tuesday',4:'Wednesday',5:'Thursday'};
  document.getElementById('schedule-list').innerHTML = Object.entries(SCH).map(([dow,s])=>{
    const badges=[];
    if(s.name==='Tuesday') badges.push('<span class="badge badge-red">Earliest</span>');
    if(s.hair) badges.push('<span class="badge badge-purple">Hair wash</span>');
    return `<div class="sched-row">
      <div class="sched-left">
        <div class="sched-night">${nightNames[dow]} night ${badges.join('')}</div>
        <div class="sched-day-info">→ ${s.name} · alarm ${s.alarm} · bus ${s.bus} · leave ${s.leave}</div>
      </div>
      <div class="sched-bed">Bed by<br><span class="sched-time">${s.bedBy}</span></div>
    </div>`;
  }).join('');
}

// ─── SAVE ENTRY ───────────────────────────────────────────────

async function saveEntry() {
  const bed=document.getElementById('bed').value;
  const wake=document.getElementById('wake').value;
  const hrs=calcH(bed,wake); if(!hrs)return;
  const nightDate=document.getElementById('log-date').value||addDays(todayStr(),-1);
  const morning=addDays(nightDate,1);
  const relaxed=isRelaxedMorning(morning);
  const ts=tScore(bed,wake,relaxed);
  const existing=entries.find(e=>e.date===nightDate);
  const payload={user_id:user.id,date:nightDate,bed_time:bed,wake_time:wake,
    hours_slept:hrs,quality:qv||null,energy:ev||null,timing_score:ts,relaxed};
  let res;
  if(existing) res=await sb.from('entries').update(payload).eq('id',existing.id).select().single();
  else         res=await sb.from('entries').insert(payload).select().single();
  if(res.data){
    const mapped=dbToEntry(res.data);
    if(existing){const idx=entries.findIndex(e=>e.date===tonight);entries[idx]=mapped;}
    else entries.unshift(mapped);
    entries.sort((a,b)=>b.date.localeCompare(a.date));
  }
  renderHistory(); renderStats();
  const btn=document.getElementById('save-btn');
  btn.textContent='Saved!'; btn.style.background='#22c55e';
  setTimeout(()=>{btn.style.background=''; updateLogNight();},1600);
}

// ─── HISTORY ──────────────────────────────────────────────────

function renderHistory() {
  const el=document.getElementById('history-list');
  if(!entries.length){el.innerHTML='<div class="empty-state">No entries yet. Log your first night.</div>';return;}
  el.innerHTML=entries.slice(0,40).map(e=>{
    const morning=entryMorning(e);
    const rel=e.relaxed!=null?e.relaxed:isRelaxedMorning(morning);
    const ts=e.timingScore!=null?e.timingScore:tScore(e.bed,e.wake,rel);
    const hpc=e.hrs>=GOAL?'badge-green':e.hrs>=GOAL-1?'badge-amber':'badge-red';
    const tpc=ts>=70?'badge-green':ts>=50?'badge-amber':'badge-red';
    const hol=isHol(e.date)||isHol(morning);
    const qe=(e.quality||0)>0?` Q${e.quality}`:'';
    const ee=(e.energy||0)>0?` E${e.energy}`:'';
    const nightLabel=fmtNight(e.date);
    const morningDow=new Date(morning+'T12:00:00').toLocaleDateString('en-SE',{weekday:'short'});
    return `<div class="history-entry" onclick="openEdit('${e.date}')">
      <div class="entry-left">
        <div class="entry-night">${nightLabel}</div>
        <div class="entry-meta">${morningDow} · ${e.bed}–${e.wake}${qe}${ee}</div>
      </div>
      <div class="entry-right">
        <div class="entry-hrs">${e.hrs}h</div>
        <div class="entry-badges">
          ${hol?'<span class="badge badge-teal">off</span>':''}
          <span class="badge ${hpc}">${e.hrs>=GOAL?'✓ 9h':e.hrs+'h'}</span>
          <span class="badge ${tpc}">T${ts}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── STATS ────────────────────────────────────────────────────

function renderStats() {
  if(!entries.length) return;
  const avg=Math.round(entries.reduce((s,e)=>s+e.hrs,0)/entries.length*10)/10;
  const gh=entries.filter(e=>e.hrs>=GOAL).length;
  const rate=Math.round(gh/entries.length*100);
  let streak=0;
  for(const e of [...entries].sort((a,b)=>b.date.localeCompare(a.date))){if(e.hrs>=GOAL)streak++;else break;}
  const cs=conScore(entries);

  document.getElementById('stats-cards').innerHTML=`
    <div class="stat-card"><div class="stat-val">${avg}h</div><div class="stat-lbl">Avg / night</div></div>
    <div class="stat-card"><div class="stat-val">${streak}</div><div class="stat-lbl">Goal streak</div></div>
    <div class="stat-card"><div class="stat-val">${rate}%</div><div class="stat-lbl">Goal hit rate</div></div>
    <div class="stat-card ${cs&&cs.score>=70?'stat-good':cs&&cs.score>=50?'stat-ok':'stat-bad'}">
      <div class="stat-val">${cs?cs.score:'—'}</div><div class="stat-lbl">Consistency</div>
    </div>`;

  const cn=document.getElementById('consistency-note');
  if(cs){
    const bh=Math.round(cs.bSD/60*10)/10, wh=Math.round(cs.wSD/60*10)/10;
    let cls='',msg='';
    if(cs.score>=80){cls='good';msg='Consistent timing. Research links stable sleep schedules to better mood, cognition, and metabolic health (Roenneberg et al.).';}
    else if(cs.score>=55){cls='warning';msg=`Moderate consistency — your bedtime varies ~${bh}h and wake time ~${wh}h. Tightening this has measurable effects even without sleeping more hours.`;}
    else{cls='bad';msg='High variability in sleep timing causes social jetlag (Roenneberg, 2012) — linked to cognitive impairment and fatigue independent of total hours.';}
    cn.innerHTML=`<div class="consistency-note ${cls}">${msg}</div>`;
  } else {
    cn.innerHTML='<div class="consistency-note">Log at least 3 nights to see your consistency score.</div>';
  }

  // Chart
  const l14=[...entries].sort((a,b)=>a.date.localeCompare(b.date)).slice(-14);
  if(chart){chart.destroy();chart=null;}
  chart=new Chart(document.getElementById('main-chart').getContext('2d'),{
    type:'bar',
    data:{
      labels:l14.map(e=>fmtNight(e.date)),
      datasets:[{
        data:l14.map(e=>e.hrs),
        backgroundColor:l14.map(e=>dotCol(e)+'33'),
        borderColor:l14.map(e=>dotCol(e)+'88'),
        borderWidth:1,
        borderRadius:8,
        borderSkipped:false
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(0,0,0,0.85)',
          borderColor:'rgba(255,255,255,0.1)',
          borderWidth:1,
          titleColor:'#fff',
          bodyColor:'rgba(255,255,255,0.55)',
          padding:12,
          cornerRadius:10,
          titleFont:{family:'Inter',weight:'500'},
          bodyFont:{family:'Inter'},
          callbacks:{
            title:items=>l14[items[0].dataIndex]?fmtNight(l14[items[0].dataIndex].date):'',
            label:c=>{
              const e=l14[c.dataIndex];
              const morning=entryMorning(e);
              const rel=e.relaxed!=null?e.relaxed:isRelaxedMorning(morning);
              const ts=e.timingScore!=null?e.timingScore:tScore(e.bed,e.wake,rel);
              return [`${c.raw}h slept`,`Timing: ${ts}/100`,e.quality?`Quality: ${e.quality}/10`:''].filter(Boolean);
            }
          }
        }
      },
      scales:{
        y:{
          min:0,max:12,
          ticks:{callback:v=>v+'h',font:{size:11,family:'Inter'},color:'rgba(255,255,255,0.18)'},
          grid:{color:'rgba(255,255,255,0.04)'},
          border:{color:'transparent'}
        },
        x:{
          ticks:{font:{size:9,family:'Inter'},maxRotation:45,autoSkip:false,color:'rgba(255,255,255,0.18)'},
          grid:{display:false},
          border:{color:'transparent'}
        }
      }
    }
  });

  // Dots
  document.getElementById('dot-grid').innerHTML=[...entries].sort((a,b)=>a.date.localeCompare(b.date)).slice(-35).map(e=>{
    const morning=entryMorning(e);
    const rel=e.relaxed!=null?e.relaxed:isRelaxedMorning(morning);
    const ts=e.timingScore!=null?e.timingScore:tScore(e.bed,e.wake,rel);
    const hol=isHol(e.date)||isHol(morning);
    const outline=hol?'box-shadow:0 0 0 2px #2dd4bf;':'';
    return `<div class="dot" style="background:${dotCol(e)};${outline}" title="${fmtNight(e.date)} · ${e.hrs}h · timing ${ts}/100${hol?' · day off':''}"></div>`;
  }).join('');
}

// ─── HOLIDAYS ─────────────────────────────────────────────────

async function addHoliday() {
  const start=document.getElementById('hstart').value;
  const end=document.getElementById('hend').value||start;
  const label=document.getElementById('hlabel').value.trim()||'Day off';
  if(!start)return;
  const eff=end<start?start:end;
  const{data}=await sb.from('holidays').insert({user_id:user.id,start_date:start,end_date:eff,label}).select().single();
  if(data){holidays.push(dbToHoliday(data));holidays.sort((a,b)=>a.start.localeCompare(b.start));}
  document.getElementById('hlabel').value='';
  renderHolidays(); renderBanner(); updatePreview();
}

async function removeHoliday(id) {
  await sb.from('holidays').delete().eq('id',id);
  holidays=holidays.filter(h=>h.id!==id);
  renderHolidays(); renderBanner();
}

function renderHolidays() {
  const el=document.getElementById('holidays-list');
  if(!holidays.length){el.innerHTML='<div class="empty-state">No days off added yet.</div>';return;}
  const today=todayStr();
  el.innerHTML=holidays.map(h=>{
    const same=h.start===h.end, ds=same?h.start:`${h.start} → ${h.end}`;
    const active=today>=h.start&&today<=h.end;
    const upcoming=today<h.start;
    const past=today>h.end;
    const badge=active?'badge-teal':upcoming?'badge-purple':'badge-dim';
    const label=active?'Active':upcoming?'Upcoming':'Past';
    return `<div class="holiday-item">
      <span class="badge ${badge}">${label}</span>
      <span class="holiday-name">${h.label}</span>
      <span class="holiday-dates">${ds}</span>
      <button class="remove-btn" onclick="removeHoliday('${h.id}')">×</button>
    </div>`;
  }).join('');
}

// ─── EDIT MODAL ───────────────────────────────────────────────

function openEdit(date) {
  const e=entries.find(x=>x.date===date); if(!e)return;
  document.getElementById('edit-entry-id').value=e.id;
  document.getElementById('edit-date').value=date;
  document.getElementById('edit-bed').value=e.bed;
  document.getElementById('edit-wake').value=e.wake;
  document.getElementById('modal-title').textContent=fmtNight(date);
  setRating('edit-qrow','edit-q-val',e.quality||0,v=>{editQv=v;});
  setRating('edit-erow','edit-e-val',e.energy||0,v=>{editEv=v;});
  editQv=e.quality||0; editEv=e.energy||0;
  document.getElementById('edit-modal').style.display='flex';
}

function closeModal(ev) { if(ev.target===document.getElementById('edit-modal'))closeModalDirect(); }
function closeModalDirect() { document.getElementById('edit-modal').style.display='none'; }

async function saveEdit() {
  const entryId=document.getElementById('edit-entry-id').value;
  const newDate=document.getElementById('edit-date').value;
  const bed=document.getElementById('edit-bed').value;
  const wake=document.getElementById('edit-wake').value;
  const hrs=calcH(bed,wake); if(!hrs)return;
  const e=entries.find(x=>x.id===entryId); if(!e)return;
  // Check for date conflict if date was changed
  if(newDate!==e.date){
    const conflict=entries.find(x=>x.date===newDate&&x.id!==entryId);
    if(conflict){
      alert(`There's already an entry for ${fmtNight(newDate)}. Delete it first if you want to move this entry there.`);
      return;
    }
  }
  const morning=addDays(newDate,1);
  const relaxed=isRelaxedMorning(morning);
  const ts=tScore(bed,wake,relaxed);
  const{data}=await sb.from('entries').update({date:newDate,bed_time:bed,wake_time:wake,hours_slept:hrs,
    quality:editQv||null,energy:editEv||null,timing_score:ts,relaxed}).eq('id',entryId).select().single();
  if(data){
    const idx=entries.findIndex(x=>x.id===entryId);
    entries[idx]=dbToEntry(data);
    entries.sort((a,b)=>b.date.localeCompare(a.date));
  }
  closeModalDirect(); renderHistory(); renderStats();
}

async function deleteEntry() {
  const entryId=document.getElementById('edit-entry-id').value;
  const e=entries.find(x=>x.id===entryId); if(!e)return;
  await autoBackup('before delete '+fmtNight(e.date));
  await sb.from('entries').delete().eq('id',e.id);
  entries=entries.filter(x=>x.id!==entryId);
  closeModalDirect(); renderHistory(); renderStats();
}

// ─── BACKUP ───────────────────────────────────────────────────

async function autoBackup(label) {
  const snap=JSON.stringify({entries,holidays});
  await sb.from('backups').insert({user_id:user.id,label:'auto — '+label,snapshot:snap});
  const{data}=await sb.from('backups').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20);
  backups=data||[]; renderBackups();
}

async function createBackup() {
  const label=document.getElementById('bkname').value.trim()||'Manual backup';
  const snap=JSON.stringify({entries,holidays});
  await sb.from('backups').insert({user_id:user.id,label,snapshot:snap});
  const{data}=await sb.from('backups').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20);
  backups=data||[]; document.getElementById('bkname').value='';
  renderBackups();
  const btn=document.getElementById('bk-btn');
  btn.textContent='Backed up!'; btn.style.background='#22c55e';
  setTimeout(()=>{btn.textContent='Create backup now';btn.style.background='';},1600);
}

async function restoreBackup(id) {
  const bk=backups.find(b=>b.id===id); if(!bk)return;
  if(!confirm(`Restore "${bk.label}"? Your current data will be saved as a backup first.`))return;
  await autoBackup('before restore');
  const snap=JSON.parse(bk.snapshot);
  await sb.from('entries').delete().eq('user_id',user.id);
  await sb.from('holidays').delete().eq('user_id',user.id);
  if(snap.entries.length) await sb.from('entries').insert(snap.entries.map(e=>({
    user_id:user.id,date:e.date,bed_time:e.bed,wake_time:e.wake,hours_slept:e.hrs,
    quality:e.quality||null,energy:e.energy||null,timing_score:e.timingScore,relaxed:e.relaxed
  })));
  if(snap.holidays.length) await sb.from('holidays').insert(snap.holidays.map(h=>({
    user_id:user.id,start_date:h.start,end_date:h.end,label:h.label
  })));
  await loadAll();
  renderHistory();renderStats();renderHolidays();renderBanner();renderBackups();
}

function renderBackups() {
  const el=document.getElementById('backup-list');
  if(!backups.length){el.innerHTML='<div class="empty-state">No backups yet.</div>';return;}
  el.innerHTML=backups.map(b=>{
    const d=new Date(b.created_at);
    const ds=d.toLocaleDateString('en-SE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const auto=b.label.startsWith('auto');
    return `<div class="backup-item">
      <span class="badge ${auto?'badge-amber':'badge-purple'}">${auto?'Auto':'Manual'}</span>
      <span class="backup-name">${b.label}</span>
      <span class="backup-meta">${ds}</span>
      <button class="restore-btn" onclick="restoreBackup('${b.id}')">Restore</button>
    </div>`;
  }).join('');
}

// ─── EXPORT ───────────────────────────────────────────────────

function buildExport() {
  if(!entries.length)return'No data yet.';
  const s=[...entries].sort((a,b)=>a.date.localeCompare(b.date));
  const avg=Math.round(s.reduce((x,e)=>x+e.hrs,0)/s.length*10)/10;
  const gh=s.filter(e=>e.hrs>=GOAL).length;
  const cs=conScore(s);
  let streak=0; for(const e of [...s].reverse()){if(e.hrs>=GOAL)streak++;else break;}
  const lines=[
    '=== Alvar — Restlog sleep data ===',
    'Exported: '+new Date().toLocaleDateString('en-SE'),
    'Sleep goal: '+GOAL+'h per night',
    'Note: dates show NIGHT START → MORNING WAKE',
    '',
    '--- Summary ---',
    'Nights logged: '+s.length,
    'Average sleep: '+avg+'h',
    'Goal hit rate: '+Math.round(gh/s.length*100)+'% ('+gh+'/'+s.length+')',
    'Current streak: '+streak+' nights',
    'Consistency score: '+(cs?cs.score+'/100 (bed SD: '+Math.round(cs.bSD/60*10)/10+'h, wake SD: '+Math.round(cs.wSD/60*10)/10+'h)':'insufficient data'),
    holidays.length?'\n--- Days off / holidays ---\n'+holidays.map(h=>h.label+': '+h.start+(h.start!==h.end?' to '+h.end:'')).join('\n'):'',
    '','--- All entries (oldest first) ---',
    'night           bed    wake   hrs   timing  Q    E    status  relaxed'
  ];
  s.forEach(e=>{
    const morning=entryMorning(e);
    const rel=e.relaxed!=null?e.relaxed:isRelaxedMorning(morning);
    const ts=e.timingScore!=null?e.timingScore:tScore(e.bed,e.wake,rel);
    const night=fmtNight(e.date).padEnd(15);
    lines.push(`${night} ${e.bed}  ${e.wake}  ${e.hrs}h  ${ts}/100  ${e.quality||'—'}/10  ${e.energy||'—'}/10  ${e.hrs>=GOAL?'GOAL':'short '+(Math.round((GOAL-e.hrs)*10)/10)+'h'}${rel?' (relaxed)':''}`);
  });
  return lines.join('\n');
}

function doCopy() {
  const t=buildExport();
  document.getElementById('eprev').textContent=t;
  navigator.clipboard.writeText(t).then(()=>{
    const b=document.getElementById('copy-btn'); b.textContent='Copied!';
    setTimeout(()=>b.textContent='Copy sleep summary',2000);
  }).catch(()=>{document.getElementById('copy-btn').textContent='Select text below to copy';});
}

// ─── TAB SWITCHING ────────────────────────────────────────────

function switchTab(t) {
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+t).classList.add('active');
  document.querySelector(`[data-tab="${t}"]`).classList.add('active');
  if(t==='stats') renderStats();
  if(t==='export') document.getElementById('eprev').textContent=buildExport();
}
