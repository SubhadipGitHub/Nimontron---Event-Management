/* ---------- guest.html page logic ---------- */

document.addEventListener('DOMContentLoaded', ()=>{
  bootPage(null, renderGuestPage);
});

function renderGuestPage(){
  /* nothing to refresh proactively — guest looks themself up on demand */
}

/* ---------- Self RSVP ---------- */
function selfRsvpFormHTML(g){
  return `
    <label for="selfRsvpCount">How many in your party (including you)?</label>
    <input id="selfRsvpCount" class="text-input" type="number" min="0" value="${g.rsvp && g.rsvp.count!=null ? g.rsvp.count : g.allotted}" />
    <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-weight:400; text-transform:none;">
      <input id="selfAccomNeeded" type="checkbox" ${g.accommodation && g.accommodation.needed ? 'checked':''}/> I'll need accommodation
    </label>
    <input id="selfAccomRooms" class="text-input" type="number" min="0" placeholder="Rooms needed" value="${g.accommodation? g.accommodation.rooms:0}" style="margin-top:6px;" />
    <div class="row" style="margin-top:12px;">
      <button class="btn btn-primary" onclick="submitSelfRsvp('${g.id}','attending')">I'll be there 🎉</button>
      <button class="btn" onclick="submitSelfRsvp('${g.id}','maybe')">Maybe</button>
      <button class="btn btn-warn" onclick="submitSelfRsvp('${g.id}','declined')">Can't make it</button>
    </div>`;
}
function selfRsvpHTML(g){
  const mediaBlock = inviteMedia ? ((inviteMedia.mime||'').startsWith('video')
    ? `<video src="${inviteMedia.dataUrl}" controls style="max-width:100%;border-radius:10px;margin-bottom:12px;"></video>`
    : `<img src="${inviteMedia.dataUrl}" style="max-width:100%;border-radius:10px;margin-bottom:12px;" alt="Invite card"/>`) : '';
  const rsvp = g.rsvp || {status:'pending'};
  const responded = rsvp.status !== 'pending';
  return `
    ${mediaBlock}
    ${passCardHTML(g)}
    <div class="panel" style="margin-top:14px;">
      ${responded ? `
        <p>You're marked as <strong>${esc(rsvpLabel(rsvp.status))}</strong>${rsvp.status==='attending' ? ' for '+rsvp.count+' guest'+(rsvp.count>1?'s':'') : ''}.</p>
        <button class="mini-btn" onclick="showSelfRsvpForm('${g.id}')">Change my response</button>
      ` : selfRsvpFormHTML(g)}
      <div style="margin-top:10px;"><button class="mini-btn ghost" onclick="printPass('${g.id}')">Print my pass</button></div>
    </div>`;
}
function showSelfRsvpForm(id){
  const g = state.guests.find(x=>x.id===id);
  if(!g) return;
  document.getElementById('selfResult').innerHTML = `${passCardHTML(g)}<div class="panel" style="margin-top:14px;">${selfRsvpFormHTML(g)}</div>`;
}
async function submitSelfRsvp(id, status){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  const countEl = document.getElementById('selfRsvpCount');
  applyRsvp(guest, status, countEl ? countEl.value : guest.allotted);
  const neededEl = document.getElementById('selfAccomNeeded'); const roomsEl = document.getElementById('selfAccomRooms');
  const needed = neededEl ? neededEl.checked : false;
  guest.accommodation = { needed, rooms: needed ? Math.max(0, parseInt(roomsEl?roomsEl.value:0)||0) : 0 };
  await saveGuests();
  toast('Thanks for letting us know!', 'ok');
  document.getElementById('selfResult').innerHTML = selfRsvpHTML(guest);
}
function guestLookup(){
  const name = document.getElementById('selfName').value.trim().toLowerCase();
  const phone = document.getElementById('selfPhone').value.trim();
  const out = document.getElementById('selfResult');
  if(!name){ out.innerHTML = '<p class="muted">Enter your name to find your pass.</p>'; return; }
  let matches = state.guests.filter(g => g.name.toLowerCase().includes(name));
  if(matches.length > 1 && phone) matches = matches.filter(g => (g.phone||'').endsWith(phone));
  if(!matches.length){ out.innerHTML = '<p class="muted">No pass found under that name — check the spelling, or ask the organizer.</p>'; return; }
  if(matches.length > 1){ out.innerHTML = '<p class="muted">A few guests share that name — add the last 4 digits of your phone to narrow it down.</p>'; return; }
  out.innerHTML = selfRsvpHTML(matches[0]);
}
