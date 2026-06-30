/* ============================================================
   Nimontron — shared app logic
   Loaded by every page before its page-specific script.
   Provides: Firebase/storage, state, the event-resolve + role-gate
   boot sequence, pass-card/invite builders, and small helpers.
   ============================================================ */

/* ---------- Firebase config ----------
   Fill these in from Firebase console > Project settings > General > Your apps > SDK setup and configuration.
   See README.md "Deploying" section for step-by-step instructions.
*/
const firebaseConfig = {
  apiKey: "AIzaSyCL3rWEf85sQrRKGZ04uBD35sRRfjS-rJg",
  authDomain: "nimontron-events.firebaseapp.com",
  databaseURL: "https://nimontron-events-default-rtdb.firebaseio.com",
  projectId: "nimontron-events",
};
firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();

/* ---------- Storage shim ----------
   get(key, shared)/set(key, value, shared), both async.
   shared:true  -> synced across every device via Firebase Realtime Database (event data).
   shared:false -> kept on this device only via localStorage (e.g. "this browser already unlocked organizer mode").
*/
function fbPath(key){ return 'nimontron/' + key.replace(/:/g, '/'); }
window.storage = {
  async get(key, shared){
    if(!shared){
      const v = localStorage.getItem('nimontron:'+key);
      return v!=null ? { value: v } : null;
    }
    const snap = await fbDb.ref(fbPath(key)).get();
    return snap.exists() ? { value: snap.val() } : null;
  },
  async set(key, value, shared){
    if(!shared){
      localStorage.setItem('nimontron:'+key, value);
      return;
    }
    await fbDb.ref(fbPath(key)).set(value);
  }
};

/* ---------- Global state ---------- */
let activeEventId = null;
let state = { meta:{}, guests:[] };
let inviteMedia = null;
let currentRole = null;     // 'organizer' | 'counter' | 'client' | null (guest / public page)
let pageOnReady = null;     // callback re-invoked on first ready + every sync tick

function defaultMeta(){
  return { eventName:'', brideName:'', groomName:'', funFacts:[], pin:'1234',
    eventCode:'', organizerAccessCode:'', counterAccessCode:'', clientAccessCode:'',
    foodOptions:['Veg','Non-veg','Jain'], sideOptions:["Bride's side","Groom's side","Common / both"] };
}
const ROLE_FIELD = { organizer:'organizerAccessCode', counter:'counterAccessCode', client:'clientAccessCode' };
const ROLE_LABEL = { organizer:'Organizer', counter:'Counter', client:'Client view' };

/* ---------- Helpers ---------- */
function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function formatTime(ts){ if(!ts) return '—'; return new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; } return h; }
function generateShortCode(len, existing){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do{ code=''; for(let i=0;i<len;i++) code+=chars[Math.floor(Math.random()*chars.length)]; } while(existing.includes(code));
  return code;
}
function toast(message, type){
  const el = document.getElementById('toastBox');
  if(!el) return;
  el.textContent = message;
  el.className = 'toast-box show ' + (type||'');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ el.className = 'toast-box'; }, 3200);
}
function alertInline(elId, message, type){
  const el = document.getElementById(elId);
  if(!el) return;
  const cls = type==='ok'?'result-ok':type==='warn'?'result-warn':'result-error';
  el.innerHTML = `<div class="result-card ${cls}">${esc(message).replace(/\n/g,'<br/>')}</div>`;
  setTimeout(()=>{ if(el) el.innerHTML=''; }, 7000);
}
function rsvpLabel(s){ return s==='attending'?'attending':s==='declined'?'not attending':s==='maybe'?'maybe':'awaiting response'; }
function rsvpPillClass(s){ return s==='attending'?'pill-served':s==='declined'?'pill-declined':s==='maybe'?'pill-maybe':'pill-pending'; }
function applyRsvp(guest, status, count){
  guest.rsvp = guest.rsvp || {};
  guest.rsvp.status = status;
  guest.rsvp.count = Math.max(0, parseInt(count)||0);
  guest.rsvp.respondedAt = Date.now();
  if(status==='attending') guest.allotted = Math.max(1, guest.rsvp.count||1);
  else if(status==='declined') guest.allotted = 0;
}

/* ---------- Storage / sync ---------- */
let syncOk = true;
function setSyncStatus(ok){
  syncOk = ok;
  const el = document.getElementById('syncStatus');
  if(!el) return;
  if(ok){ el.style.display='none'; el.innerHTML=''; }
  else { el.style.display='block'; el.innerHTML = `⚠ Not syncing right now — changes are only saved on this device. <button class="mini-btn" onclick="retrySync()">Retry</button>`; }
}
async function withRetry(fn){
  try{ await fn(); setSyncStatus(true); return true; }
  catch(e){
    console.error('Storage call failed, retrying once', e);
    try{ await new Promise(r=>setTimeout(r,800)); await fn(); setSyncStatus(true); return true; }
    catch(e2){ console.error('Storage call failed again', e2); setSyncStatus(false); return false; }
  }
}
async function loadState(){
  if(!activeEventId) return;
  try{ const m = await window.storage.get('event:'+activeEventId+':meta', true); if(m && m.value) state.meta = Object.assign(defaultMeta(), JSON.parse(m.value)); }catch(e){}
  try{ const g = await window.storage.get('event:'+activeEventId+':guests', true); if(g && g.value) state.guests = JSON.parse(g.value); }catch(e){}
}
async function saveGuests(){ return withRetry(()=>window.storage.set('event:'+activeEventId+':guests', JSON.stringify(state.guests), true)); }
async function saveMeta(){ return withRetry(()=>window.storage.set('event:'+activeEventId+':meta', JSON.stringify(state.meta), true)); }
async function retrySync(){ const a = await saveGuests(); const b = await saveMeta(); if(a && b) toast('Synced.', 'ok'); }
async function loadInviteMediaState(){
  try{ const r = await window.storage.get('event:'+activeEventId+':invite-media', true); inviteMedia = (r && r.value) ? JSON.parse(r.value) : null; }
  catch(e){ inviteMedia = null; }
}
async function saveInviteMedia(){ return withRetry(()=>window.storage.set('event:'+activeEventId+':invite-media', JSON.stringify(inviteMedia), true)); }
async function loadEventsIndex(){
  try{ const r = await window.storage.get('events-index', true); return (r && r.value) ? JSON.parse(r.value) : []; }
  catch(e){ return []; }
}

let fbListeners = [];
let pollStarted = false;
function attachRealtimeListeners(id, onTick){
  detachRealtimeListeners();
  ['meta','guests'].forEach(part=>{
    const ref = fbDb.ref(fbPath('event:'+id+':'+part));
    const cb = ()=>{ if(activeEventId===id) onTick(); };
    ref.on('value', cb);
    fbListeners.push([ref, cb]);
  });
}
function detachRealtimeListeners(){
  fbListeners.forEach(([ref,cb])=>ref.off('value',cb));
  fbListeners = [];
}
async function syncTick(onChange){
  await loadState();
  await loadInviteMediaState();
  const active = document.activeElement;
  const typing = active && ['INPUT','TEXTAREA'].includes(active.tagName);
  if(typing) return;
  renderHeaderCommon();
  if(onChange) onChange();
}
function startSync(id, onChange){
  attachRealtimeListeners(id, ()=>syncTick(onChange));
  if(!pollStarted){ pollStarted = true; setInterval(()=>syncTick(onChange), 15000); }
}

/* ---------- Header (shared chrome bits) ---------- */
function renderHeaderCommon(){
  const nameEl = document.getElementById('headerEventName');
  if(nameEl) nameEl.textContent = state.meta.eventName || 'Untitled event';
  const tallyEl = document.getElementById('headerTally');
  if(tallyEl){
    const totalAllotted = state.guests.reduce((s,g)=>s+g.allotted,0);
    const totalServed = state.guests.reduce((s,g)=>s+g.served,0);
    tallyEl.textContent = `${totalServed} / ${totalAllotted} plates served`;
  }
  const badgeEl = document.getElementById('roleBadge');
  if(badgeEl && currentRole) badgeEl.textContent = ROLE_LABEL[currentRole] || '';
}

/* ---------- Page boot: resolve event, then (optionally) gate by role ---------- */
function getUrlEventId(){ return new URLSearchParams(location.search).get('event'); }

function bootPage(role, onReady, opts){
  currentRole = role;
  pageOnReady = onReady;
  const id = getUrlEventId();
  if(id){ enterEvent(id); } else { renderEventGate(opts && opts.allowCreate); }
}

function renderEventGate(allowCreate){
  const el = document.getElementById('eventGate');
  if(!el) return;
  el.style.display = 'block';
  const pc = document.getElementById('pageContent'); if(pc) pc.style.display='none';
  const rg = document.getElementById('roleGate'); if(rg){ rg.style.display='none'; rg.innerHTML=''; }
  let html = `<div class="panel">
    <h2>Find your event</h2>
    <p class="hint">Enter the event code your organizer shared with you.</p>
    <div class="code-entry">
      <input id="eventCodeInput" class="text-input" placeholder="e.g. WED482" />
      <button class="btn btn-primary" onclick="submitEventCode()">Continue</button>
    </div>
    <div id="eventGateMsg"></div>
  </div>`;
  if(allowCreate && window.createEventHandler){
    html += `<div class="panel">
      <h2>Start a new event</h2>
      <p class="hint">Creates a fresh, separate guest list and its own access codes — nothing shared with other events.</p>
      <input id="newEventName" class="text-input" placeholder="e.g. Priya & Arjun's Wedding" />
      <button class="btn btn-primary" onclick="window.createEventHandler()">Create event</button>
      <div id="createEventMsg"></div>
    </div>`;
  }
  el.innerHTML = html;
}
async function submitEventCode(){
  const input = document.getElementById('eventCodeInput');
  const code = input.value.trim().toUpperCase();
  const msgEl = document.getElementById('eventGateMsg');
  if(!code){ msgEl.innerHTML = '<div class="result-card result-error">Enter an event code.</div>'; return; }
  const idx = await loadEventsIndex();
  const found = idx.find(e=>e.code.toUpperCase()===code);
  if(!found){ msgEl.innerHTML = '<div class="result-card result-error">No event found for that code. Check it and try again.</div>'; return; }
  const url = new URL(location.href); url.searchParams.set('event', found.id); history.replaceState(null,'',url);
  await enterEvent(found.id);
}
async function enterEvent(id){
  activeEventId = id;
  state = { meta: defaultMeta(), guests:[] };
  inviteMedia = null;
  await loadState();
  await loadInviteMediaState();
  const eg = document.getElementById('eventGate'); if(eg){ eg.style.display='none'; eg.innerHTML=''; }
  if(currentRole){
    const unlocked = await checkRememberedUnlock(currentRole);
    if(unlocked) showPageContent(); else renderRoleGate(currentRole);
  } else {
    showPageContent();
  }
}
function showPageContent(){
  const rg = document.getElementById('roleGate'); if(rg){ rg.style.display='none'; rg.innerHTML=''; }
  const pc = document.getElementById('pageContent'); if(pc) pc.style.display='block';
  renderHeaderCommon();
  if(pageOnReady) pageOnReady();
  startSync(activeEventId, pageOnReady);
}
async function checkRememberedUnlock(role){
  try{ const v = await window.storage.get('unlocked:'+activeEventId+':'+role, false); return !!(v && v.value==='yes'); }
  catch(e){ return false; }
}
function renderRoleGate(role){
  const el = document.getElementById('roleGate');
  if(!el) return;
  el.style.display = 'block';
  const pc = document.getElementById('pageContent'); if(pc) pc.style.display='none';
  const label = role==='organizer' ? 'Organizer access' : role==='counter' ? 'Counter / serving staff access' : 'Client access';
  el.innerHTML = `<div class="panel">
    <h2>${esc(label)}</h2>
    <p class="hint">Enter the ${esc(role)} code for this event. Ask the organizer if you don't have it.</p>
    <div class="code-entry">
      <input id="roleCodeInput" class="text-input" placeholder="Access code" style="text-transform:uppercase;" />
      <button class="btn btn-primary" onclick="submitRoleCode()">Unlock</button>
    </div>
    <div id="roleGateMsg"></div>
  </div>`;
}
async function submitRoleCode(){
  const role = currentRole;
  const input = document.getElementById('roleCodeInput');
  const code = input.value.trim().toUpperCase();
  const expected = (state.meta[ROLE_FIELD[role]] || '').toUpperCase();
  const msgEl = document.getElementById('roleGateMsg');
  if(!expected){ msgEl.innerHTML = `<p class="muted small">This event has no ${esc(role)} code set yet.</p>`; return; }
  if(code !== expected){ msgEl.innerHTML = '<div class="result-card result-error">Incorrect code.</div>'; return; }
  try{ await window.storage.set('unlocked:'+activeEventId+':'+role, 'yes', false); }catch(e){}
  toast('Unlocked.', 'ok');
  showPageContent();
}

/* ---------- Direct page links (used by organizer share panel + invite text) ---------- */
function pageBaseUrl(){ return location.origin + location.pathname.replace(/[^/]*$/, ''); }
function shareLink(page){ return pageBaseUrl() + page + '.html?event=' + encodeURIComponent(activeEventId); }

/* ---------- Shareable pass + invite text (used by guest & organizer pages) ---------- */
const POSES = [
  { svg:`<svg viewBox="0 0 90 120" width="70" height="95" aria-hidden="true"><circle cx="45" cy="22" r="14" fill="none" stroke="#3D0B1F" stroke-width="4"/><path d="M45 36 L45 75" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 45 L70 18" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="73" cy="14" rx="11" ry="4" fill="#C9A227" stroke="#3D0B1F" stroke-width="2"/><path d="M45 45 L24 60" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 75 L30 110" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 75 L62 108" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="20" cy="40" r="2.5" fill="#9C1F3D"/><circle cx="70" cy="50" r="2" fill="#9C1F3D"/><circle cx="15" cy="70" r="2" fill="#C9A227"/></svg>`, caption:'plate held high like a trophy' },
  { svg:`<svg viewBox="0 0 90 120" width="70" height="95" aria-hidden="true"><circle cx="45" cy="22" r="14" fill="none" stroke="#3D0B1F" stroke-width="4"/><path d="M45 36 L45 72" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 42 L22 16" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 42 L68 16" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 72 L20 95" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 72 L66 110" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="18" cy="98" rx="11" ry="4" fill="#C9A227" stroke="#3D0B1F" stroke-width="2"/><circle cx="75" cy="30" r="2" fill="#9C1F3D"/><circle cx="60" cy="8" r="2" fill="#9C1F3D"/><circle cx="10" cy="55" r="2" fill="#C9A227"/></svg>`, caption:'mid-dance-move, no regrets' },
  { svg:`<svg viewBox="0 0 90 120" width="70" height="95" aria-hidden="true"><circle cx="45" cy="24" r="14" fill="none" stroke="#3D0B1F" stroke-width="4"/><path d="M40 30 q5 4 10 0" stroke="#3D0B1F" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M45 38 L45 74" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 46 L62 30" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="66" cy="26" rx="10" ry="4" fill="#C9A227" stroke="#3D0B1F" stroke-width="2"/><path d="M45 46 L24 58" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 74 L30 108" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 74 L60 108" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="15" cy="40" r="2" fill="#9C1F3D"/></svg>`, caption:'definitely going back for seconds' },
  { svg:`<svg viewBox="0 0 90 120" width="70" height="95" aria-hidden="true"><circle cx="45" cy="22" r="14" fill="none" stroke="#3D0B1F" stroke-width="4"/><rect x="33" y="18" width="10" height="6" rx="2" fill="#3D0B1F"/><rect x="47" y="18" width="10" height="6" rx="2" fill="#3D0B1F"/><path d="M45 36 L45 74" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 44 L66 36" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="70" cy="33" r="5" fill="none" stroke="#3D0B1F" stroke-width="4"/><path d="M45 50 L26 62" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="22" cy="66" rx="10" ry="4" fill="#C9A227" stroke="#3D0B1F" stroke-width="2"/><path d="M45 74 L32 108" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M45 74 L58 104" stroke="#3D0B1F" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`, caption:'too cool for assigned seating' }
];
const TAGLINES = [
  "Valid for unlimited blessings and exactly {n} plate{s} of food.",
  "Entry fee: showing up. Exit fee: a food coma.",
  "This pass has been inspected for double-dipping. None found (yet).",
  "Redeemable for {n} plate{s} and zero awkward small talk with distant relatives.",
  "Certified hunger-approved by the catering committee.",
  "No outside snacks, please. We see you, samosa smugglers.",
  "One scan, one plate, infinite goodwill toward the couple."
];
function passCardHTML(guest){
  const pose = POSES[hashStr(guest.id+'pose') % POSES.length];
  const facts = (state.meta.funFacts||[]).filter(Boolean);
  const fact = facts.length ? facts[hashStr(guest.id+'fact') % facts.length] : null;
  const tagline = TAGLINES[hashStr(guest.id+'tag') % TAGLINES.length].replace('{n}', guest.allotted).replace('{s}', guest.allotted>1?'s':'');
  const couple = [state.meta.brideName, state.meta.groomName].filter(Boolean).join(' & ');
  const initials = [state.meta.brideName, state.meta.groomName].filter(Boolean).map(n=>n.trim()[0]).join('');
  const monogram = (initials || (state.meta.eventName||'N').trim()[0] || 'N').toUpperCase().slice(0,2);
  return `
    <div class="pass-card">
      <div class="pass-seal">${esc(monogram||'N')}</div>
      <span class="pass-ribbon">VIP plate pass</span>
      <div class="pass-couple">${esc(couple || state.meta.eventName || 'The event')}</div>
      <div class="pass-body">
        <div class="pass-illustration">${pose.svg}<div class="pass-caption">${esc(pose.caption)}</div></div>
        <div class="pass-info">
          <div class="pass-guest-name">${esc(guest.name)}</div>
          <div class="pass-guest-group">${esc(guest.group||'Honoured guest')}${guest.side? ' · '+esc(guest.side):''}</div>
          <div class="pass-code">${esc(guest.code)}</div>
          <div class="pass-allotted">${guest.mealType? esc(guest.mealType)+' · ':''}${guest.allotted} plate${guest.allotted>1?'s':''} reserved</div>
        </div>
      </div>
      ${fact ? `<div class="pass-fact">🎲 <strong>Fun fact:</strong> ${esc(fact)}</div>` : ''}
      <div class="pass-tagline">${esc(tagline)}</div>
      <div class="pass-footer">Show this at the food counter — no name needed.</div>
    </div>`;
}
function buildInviteText(guest){
  const facts = (state.meta.funFacts||[]).filter(Boolean);
  const fact = facts.length ? facts[hashStr(guest.id+'fact') % facts.length] : null;
  const tagline = TAGLINES[hashStr(guest.id+'tag') % TAGLINES.length].replace('{n}', guest.allotted).replace('{s}', guest.allotted>1?'s':'');
  const couple = [state.meta.brideName, state.meta.groomName].filter(Boolean).join(' & ');
  const guestLink = shareLink('guest');
  let msg = `🎉 ${state.meta.eventName || "You're invited!"} 🎉\n\n`;
  msg += `Hey ${guest.name}! ${couple ? couple+' would love to have you there.' : "We'd love to have you there."}\n\n`;
  if(fact) msg += `🎲 Fun fact about ${couple || 'the couple'}: ${fact}\n\n`;
  msg += `Tap to RSVP & see your plate pass:\n${guestLink}\n\n`;
  msg += `Your invite code: ${guest.code} (event code ${state.meta.eventCode}, in case the link doesn't open)\n\n`;
  msg += tagline;
  return msg;
}
function buildFollowUpText(guest){
  const couple = [state.meta.brideName, state.meta.groomName].filter(Boolean).join(' & ');
  const guestLink = shareLink('guest');
  return `Hi ${guest.name}! 👋 Just checking in about ${state.meta.eventName || (couple ? couple+"'s event" : 'the event')} — would love to know if you can make it. Tap here to RSVP: ${guestLink} (your code: ${guest.code}). No worries either way, just let us know when you can! 🙏`;
}
function printPass(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  document.getElementById('printArea').innerHTML = passCardHTML(guest);
  window.print();
}
