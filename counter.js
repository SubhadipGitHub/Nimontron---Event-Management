/* ---------- counter.html page logic ---------- */
let currentOverrideGuest = null;

document.addEventListener('DOMContentLoaded', ()=>{
  bootPage('counter', renderCounterPage);
});

function renderCounterPage(){
  renderRecentActivity();
}

function getCounterName(){ const v = document.getElementById('counterNameSelect').value.trim(); return v || 'Counter'; }
function showResult(status, message, guest, allowOverride){
  currentOverrideGuest = allowOverride ? guest : null;
  const el = document.getElementById('counterResult');
  const cls = status==='ok'?'result-ok':status==='warn'?'result-warn':'result-error';
  let extra = '';
  if(allowOverride){
    extra = `<div class="override-box">
      <p class="small muted">Only the manager PIN can approve an extra plate.</p>
      <input id="overridePin" type="password" inputmode="numeric" placeholder="Manager PIN" class="text-input"/>
      <input id="overrideReason" type="text" placeholder="Reason" class="text-input"/>
      <button class="btn btn-warn" onclick="overrideServe()">Confirm override</button>
    </div>`;
  }
  el.innerHTML = `<div class="result-card ${cls}">${message}${extra}</div>`;
}
async function markServed(){
  const codeInput = document.getElementById('serveCode');
  const code = codeInput.value.trim().toUpperCase();
  if(!code){ showResult('error','Enter a guest code to continue.'); return; }
  await loadState();
  const guest = state.guests.find(g=>g.code===code);
  if(!guest){ showResult('error', `No guest found for code <strong>${esc(code)}</strong>.`); return; }
  if(guest.served < guest.allotted){
    guest.served += 1;
    guest.log.push({ ts: Date.now(), counter: getCounterName(), type:'serve' });
    await saveGuests();
    showResult('ok', `Served — <strong>${esc(guest.name)}</strong> (plate ${guest.served} of ${guest.allotted}).`);
    codeInput.value=''; codeInput.focus();
    renderRecentActivity();
  } else {
    const last = guest.log[guest.log.length-1];
    showResult('warn', `<strong>${esc(guest.name)}</strong> has already received all ${guest.allotted} allotted plate${guest.allotted>1?'s':''}. Last served ${formatTime(last&&last.ts)}.`, guest, true);
  }
}
async function overrideServe(){
  const pinEl = document.getElementById('overridePin'); const reasonEl = document.getElementById('overrideReason');
  const pin = pinEl ? pinEl.value.trim() : ''; const reason = reasonEl ? reasonEl.value.trim() : '';
  if(!currentOverrideGuest) return;
  if(pin !== state.meta.pin){ showResult('error', 'Incorrect manager PIN — override cancelled.', currentOverrideGuest, true); return; }
  if(!reason){ showResult('warn', `Add a reason before overriding ${esc(currentOverrideGuest.name)}'s extra plate.`, currentOverrideGuest, true); return; }
  await loadState();
  const guest = state.guests.find(g=>g.id===currentOverrideGuest.id);
  if(!guest) return;
  guest.served += 1;
  guest.log.push({ ts: Date.now(), counter: getCounterName(), type:'override', reason });
  await saveGuests();
  showResult('ok', `Override recorded — <strong>${esc(guest.name)}</strong> served an extra plate.`);
  renderRecentActivity();
}
function searchGuestsCounter(){
  const q = document.getElementById('counterSearch').value.trim().toLowerCase();
  const list = document.getElementById('counterSearchResults');
  if(!q){ list.innerHTML=''; return; }
  const matches = state.guests.filter(g=>g.name.toLowerCase().includes(q)).slice(0,6);
  list.innerHTML = matches.length ? matches.map(g=>`
    <div class="lookup-row">
      <div><strong>${esc(g.name)}</strong><span class="muted"> · ${esc(g.group||'No group')}</span></div>
      <div class="lookup-row-right">
        <span class="code-chip">${esc(g.code)}</span>
        <span class="status-pill ${g.served>=g.allotted?'pill-served':'pill-pending'}">${g.served}/${g.allotted}</span>
        <button class="mini-btn" ${g.served>=g.allotted?'disabled':''} onclick="serveById('${g.id}')">Serve</button>
      </div>
    </div>`).join('') : '<p class="muted small">No matches.</p>';
}
async function serveById(id){
  await loadState();
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  document.getElementById('serveCode').value = guest.code;
  await markServed();
  searchGuestsCounter();
}
function renderRecentActivity(){
  const el = document.getElementById('recentActivity');
  if(!el) return;
  const events=[];
  state.guests.forEach(g=> g.log.forEach(l=> events.push({ name:g.name, code:g.code, ...l })));
  events.sort((a,b)=>b.ts-a.ts);
  const top = events.slice(0,8);
  el.innerHTML = top.length ? top.map(e=>`
    <div class="activity-row ${e.type==='override'?'activity-override':''}">
      <span class="code-chip small">${esc(e.code)}</span> ${esc(e.name)} — ${e.type==='override'?'extra plate (override)':'served'} · ${formatTime(e.ts)} · ${esc(e.counter)}
    </div>`).join('') : '<p class="muted">No plates served yet.</p>';
}
