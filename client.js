/* ---------- client.html page logic ---------- */

document.addEventListener('DOMContentLoaded', ()=>{
  bootPage('client', renderClientDashboard);
});

function renderClientDashboard(){
  const root = document.getElementById('clientRoot');
  if(!root) return;
  const total = state.guests.length;
  const rsvpCounts = {pending:0, attending:0, declined:0, maybe:0};
  let confirmedHeadcount=0, roomsNeeded=0, invitesSent=0, responded=0;
  state.guests.forEach(g=>{
    const status = (g.rsvp && g.rsvp.status) || 'pending';
    rsvpCounts[status] = (rsvpCounts[status]||0)+1;
    if(status==='attending') confirmedHeadcount += (g.rsvp.count||0);
    if(status!=='pending') responded++;
    if(g.accommodation && g.accommodation.needed) roomsNeeded += (g.accommodation.rooms||0);
    if(g.invite && g.invite.sent) invitesSent++;
  });
  const totalAllotted = state.guests.reduce((s,g)=>s+g.allotted,0);
  const totalServed = state.guests.reduce((s,g)=>s+g.served,0);
  const pct = totalAllotted ? Math.round((totalServed/totalAllotted)*100) : 0;
  const typeMap = {};
  state.guests.forEach(g=>{ const t=g.mealType||'Unspecified'; typeMap[t]=typeMap[t]||{served:0,allotted:0}; typeMap[t].served+=g.served; typeMap[t].allotted+=g.allotted; });
  const overrides = [];
  state.guests.forEach(g => g.log.filter(l=>l.type==='override').forEach(l => overrides.push({ name:g.name, ...l })));
  overrides.sort((a,b)=>b.ts-a.ts);

  root.innerHTML = `
    <h3 class="section-title">Invites &amp; RSVPs</h3>
    <div class="big-stats">
      <div class="stat-card"><div class="stat-num">${invitesSent} / ${total}</div><div class="stat-label">Invites sent</div></div>
      <div class="stat-card"><div class="stat-num">${responded} / ${total}</div><div class="stat-label">Responded</div></div>
      <div class="stat-card"><div class="stat-num">${confirmedHeadcount}</div><div class="stat-label">Confirmed headcount</div></div>
    </div>
    <div class="type-bars" style="margin-top:10px;">
      ${['attending','declined','maybe','pending'].map(s=>`
        <div class="type-bar-row">
          <div class="type-bar-label">${esc(rsvpLabel(s))}</div>
          <div class="type-bar-track"><div class="type-bar-fill" style="width:${total?(rsvpCounts[s]/total)*100:0}%; background:${s==='attending'?'var(--emerald)':s==='declined'?'var(--ruby)':'var(--gold)'}"></div></div>
          <div class="type-bar-num">${rsvpCounts[s]||0}</div>
        </div>`).join('')}
    </div>
    <h3 class="section-title">Accommodation</h3>
    <p class="muted small">${roomsNeeded} room${roomsNeeded===1?'':'s'} requested so far across confirmed &amp; pending guests.</p>

    <h3 class="section-title">Guests &amp; plates</h3>
    <div class="big-stats">
      <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Guests on the list</div></div>
      <div class="stat-card"><div class="stat-num">${totalServed} / ${totalAllotted}</div><div class="stat-label">Plates served</div></div>
      <div class="stat-card"><div class="stat-num">${pct}%</div><div class="stat-label">Of allotted served</div></div>
    </div>
    <h3 class="section-title">By meal type</h3>
    ${Object.keys(typeMap).length ? `<div class="type-bars">${Object.entries(typeMap).map(([t,v])=>`
      <div class="type-bar-row">
        <div class="type-bar-label">${esc(t)}</div>
        <div class="type-bar-track"><div class="type-bar-fill" style="width:${v.allotted?Math.min(100,(v.served/v.allotted)*100):0}%"></div></div>
        <div class="type-bar-num">${v.served}/${v.allotted}</div>
      </div>`).join('')}</div>` : `<p class="muted">No guests added yet.</p>`}
    <h3 class="section-title">Transparency log</h3>
    <p class="muted small">Every plate served beyond a guest's allotment is recorded here with who approved it and why.</p>
    ${overrides.length ? `<div class="override-list">${overrides.map(o=>`
      <div class="override-row"><strong>${esc(o.name)}</strong> — extra plate at ${formatTime(o.ts)} (${esc(o.counter)}). Reason: ${esc(o.reason||'—')}</div>
    `).join('')}</div>` : `<p class="muted">No overrides recorded.</p>`}
  `;
}
