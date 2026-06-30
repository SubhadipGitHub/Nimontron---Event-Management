/* ---------- organizer.html page logic ---------- */

window.createEventHandler = createNewEvent;

document.addEventListener('DOMContentLoaded', ()=>{
  bootPage('organizer', renderOrganizerPage, { allowCreate:true });
});

function renderOrganizerPage(){
  renderFormOptions();
  renderGuestList();
  renderSettingsFields();
  renderInvitePreview();
  renderShareLinks();
}

/* ---------- Create event ---------- */
async function createNewEvent(){
  const nameInput = document.getElementById('newEventName');
  const name = nameInput ? nameInput.value.trim() : '';
  const msgEl = document.getElementById('createEventMsg');
  if(!name){ if(msgEl) msgEl.innerHTML = '<div class="result-card result-error">Give the event a name first.</div>'; return; }
  const idx = await loadEventsIndex();
  const id = uid();
  const eventCode = generateShortCode(6, idx.map(e=>e.code));
  const organizerAccessCode = generateShortCode(6, []);
  const counterAccessCode = generateShortCode(6, []);
  const clientAccessCode = generateShortCode(6, []);
  idx.push({ id, name, code: eventCode });
  const okIndex = await withRetry(()=>window.storage.set('events-index', JSON.stringify(idx), true));
  if(!okIndex){ if(msgEl) msgEl.innerHTML = '<div class="result-card result-error">Could not create the event — check your connection and try again.</div>'; return; }
  const meta = Object.assign(defaultMeta(), { eventName:name, eventCode, organizerAccessCode, counterAccessCode, clientAccessCode });
  activeEventId = id;
  state = { meta, guests: [] };
  await saveMeta();
  try{ await window.storage.set('unlocked:'+id+':organizer','yes', false); }catch(e){}
  const url = new URL(location.href); url.searchParams.set('event', id); history.replaceState(null,'',url);
  await enterEvent(id);
  showNewEventCodesBanner(meta);
}
function showNewEventCodesBanner(meta){
  const el = document.getElementById('newEventBanner');
  if(!el) return;
  el.innerHTML = `<div class="panel" style="border-color:var(--gold);">
    <h2>Event created 🎉</h2>
    <p class="hint">Save these codes somewhere safe — each one unlocks a different page for the right people.</p>
    <div class="row">
      <div><label>Event code</label><div class="code-chip">${esc(meta.eventCode)}</div></div>
      <div><label>Organizer code</label><div class="code-chip">${esc(meta.organizerAccessCode)}</div></div>
      <div><label>Counter code</label><div class="code-chip">${esc(meta.counterAccessCode)}</div></div>
      <div><label>Client code</label><div class="code-chip">${esc(meta.clientAccessCode)}</div></div>
    </div>
    <button class="mini-btn" style="margin-top:12px;" onclick="copyAccessInfo()">Copy all codes</button>
    <button class="mini-btn gold" style="margin-top:12px;" onclick="emailEventSummary()">📧 Email me these details</button>
    <button class="mini-btn ghost" style="margin-top:12px;" onclick="document.getElementById('newEventBanner').innerHTML=''">Dismiss</button>
  </div>`;
}

/* ---------- Guests ---------- */
function renderFormOptions(){
  const foodSel = document.getElementById('gMealType');
  if(foodSel) foodSel.innerHTML = '<option value="">Select…</option>' + (state.meta.foodOptions||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');
  const sideSel = document.getElementById('gSide');
  if(sideSel) sideSel.innerHTML = '<option value="">Select…</option>' + (state.meta.sideOptions||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');
}
function blankInviteAndRsvp(allotted){
  return {
    rsvp:{ status:'pending', count:allotted, respondedAt:null },
    invite:{ sent:false, sentAt:null, method:null, followUps:[] },
    accommodation:{ needed:false, rooms:0 }
  };
}
async function addGuest(){
  const name = document.getElementById('gName').value.trim();
  if(!name){ alertInline('organizerMsg','Add a name before saving.','error'); return; }
  const phone = document.getElementById('gPhone').value.trim();
  const group = document.getElementById('gGroup').value.trim();
  const side = document.getElementById('gSide').value;
  const mealType = document.getElementById('gMealType').value;
  const allotted = Math.max(1, parseInt(document.getElementById('gAllotted').value)||1);
  await loadState();
  const code = generateShortCode(4, state.guests.map(g=>g.code));
  state.guests.push(Object.assign({ id:uid(), code, name, phone, group, side, mealType, allotted, served:0, log:[] }, blankInviteAndRsvp(allotted)));
  await saveGuests();
  ['gName','gPhone','gGroup'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('gSide').value=''; document.getElementById('gMealType').value=''; document.getElementById('gAllotted').value=1;
  renderGuestList();
  alertInline('organizerMsg', `Added ${name} — code ${code}`, 'ok');
}
async function bulkImport(){
  const raw = document.getElementById('bulkText').value;
  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  if(!lines.length){ alertInline('organizerMsg','Paste at least one line first.','error'); return; }
  await loadState();
  const existingCodes = state.guests.map(g=>g.code);
  let added=0;
  for(const line of lines){
    const parts = line.split(',').map(p=>p.trim());
    const name = parts[0];
    if(!name) continue;
    const code = generateShortCode(4, existingCodes); existingCodes.push(code);
    const allotted = Math.max(1, parseInt(parts[5])||1);
    state.guests.push(Object.assign({
      id:uid(), code, name, phone:parts[1]||'', group:parts[2]||'', side:parts[3]||'', mealType:parts[4]||'',
      allotted, served:0, log:[]
    }, blankInviteAndRsvp(allotted)));
    added++;
  }
  await saveGuests();
  document.getElementById('bulkText').value='';
  renderGuestList();
  alertInline('organizerMsg', `Added ${added} guest${added===1?'':'s'} from the list.`, 'ok');
}
function filterGuestList(){ renderGuestList(); }
function renderGuestList(){
  const filterEl = document.getElementById('guestFilter');
  const q = (filterEl ? filterEl.value : '').toLowerCase();
  const rows = state.guests
    .filter(g => !q || g.name.toLowerCase().includes(q) || (g.group||'').toLowerCase().includes(q) || g.code.toLowerCase().includes(q))
    .sort((a,b)=>a.name.localeCompare(b.name));
  const container = document.getElementById('guestListBody');
  if(!container) return;
  if(!rows.length){ container.innerHTML = `<p class="empty-note">No guests match yet. Add one above or paste a list to get started.</p>`; return; }
  container.innerHTML = rows.map(rowTicketHTML).join('');
}
function rowTicketHTML(g){
  const full = g.served >= g.allotted;
  const overrides = g.log.filter(l=>l.type==='override').length;
  const rsvp = g.rsvp || {status:'pending'};
  const inv = g.invite || {sent:false};
  return `
  <div class="ticket-row">
    <div class="ticket-main">
      <div class="ticket-name">${esc(g.name)}</div>
      <div class="ticket-sub">${esc(g.group||'No group')}${g.side? ' · '+esc(g.side):''}${g.mealType? ' · '+esc(g.mealType):''}</div>
      <div class="ticket-sub" style="margin-top:3px;">
        <span class="status-pill ${rsvpPillClass(rsvp.status)}">${esc(rsvpLabel(rsvp.status))}</span>
        <span class="status-pill ${inv.sent?'pill-served':'pill-pending'}" style="margin-left:4px;">${inv.sent?'invite sent':'not sent'}</span>
      </div>
    </div>
    <div class="ticket-perf"></div>
    <div class="ticket-stub">
      <span class="code-chip">${esc(g.code)}</span>
      <span class="status-pill ${full?'pill-served':'pill-pending'}">${g.served}/${g.allotted}${overrides? ' +'+overrides+' ovr':''}</span>
      <div class="ticket-actions">
        <button class="mini-btn" onclick="manualServe('${g.id}')" ${full?'disabled':''}>Serve</button>
        <button class="mini-btn" onclick="openPassModal('${g.id}')">Details</button>
        <button class="mini-btn ghost" onclick="resetGuest('${g.id}')">Reset</button>
        <button class="mini-btn danger" onclick="deleteGuest('${g.id}')">Remove</button>
      </div>
    </div>
  </div>`;
}
async function manualServe(id){
  await loadState();
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  if(guest.served >= guest.allotted){ alertInline('organizerMsg', `${guest.name} already has all plates marked.`, 'warn'); return; }
  guest.served += 1;
  guest.log.push({ ts: Date.now(), counter:'Organizer', type:'serve' });
  await saveGuests();
  renderGuestList();
}
async function resetGuest(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  if(!confirm(`Reset ${guest.name}'s served count back to 0?`)) return;
  await loadState();
  const g2 = state.guests.find(g=>g.id===id);
  if(!g2) return;
  g2.served=0; g2.log=[];
  await saveGuests();
  renderGuestList();
}
async function deleteGuest(id){
  if(!confirm('Remove this guest from the list?')) return;
  await loadState();
  state.guests = state.guests.filter(g=>g.id!==id);
  await saveGuests();
  renderGuestList();
}

/* ---------- Settings ---------- */
function renderSettingsFields(){
  const fieldMap = {
    eventNameInput: state.meta.eventName || '',
    brideNameInput: state.meta.brideName || '',
    groomNameInput: state.meta.groomName || '',
    funFactsInput: (state.meta.funFacts||[]).join('\n'),
    foodOptionsInput: (state.meta.foodOptions||[]).join('\n'),
    sideOptionsInput: (state.meta.sideOptions||[]).join('\n'),
    eventCodeDisplay: state.meta.eventCode || '',
    organizerCodeInput: state.meta.organizerAccessCode || '',
    counterCodeInput: state.meta.counterAccessCode || '',
    clientCodeInput: state.meta.clientAccessCode || '',
    pinInput: state.meta.pin || ''
  };
  Object.entries(fieldMap).forEach(([id,val])=>{
    const el = document.getElementById(id);
    if(el && document.activeElement !== el) el.value = val;
  });
}
async function saveSettings(){
  state.meta.eventName = document.getElementById('eventNameInput').value.trim() || 'Untitled event';
  state.meta.brideName = document.getElementById('brideNameInput').value.trim();
  state.meta.groomName = document.getElementById('groomNameInput').value.trim();
  state.meta.funFacts = document.getElementById('funFactsInput').value.split('\n').map(s=>s.trim()).filter(Boolean);
  state.meta.foodOptions = document.getElementById('foodOptionsInput').value.split('\n').map(s=>s.trim()).filter(Boolean);
  state.meta.sideOptions = document.getElementById('sideOptionsInput').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const pin = document.getElementById('pinInput').value.trim();
  if(pin) state.meta.pin = pin;
  await saveMeta();
  renderHeaderCommon(); renderFormOptions();
  alertInline('organizerMsg', 'Event settings saved.', 'ok');
}
async function saveAccessCodes(){
  state.meta.organizerAccessCode = document.getElementById('organizerCodeInput').value.trim().toUpperCase();
  state.meta.counterAccessCode = document.getElementById('counterCodeInput').value.trim().toUpperCase();
  state.meta.clientAccessCode = document.getElementById('clientCodeInput').value.trim().toUpperCase();
  await saveMeta();
  renderShareLinks();
  toast('Access codes updated.', 'ok');
}
function buildEventSummaryText(){
  return `Event: ${state.meta.eventName}\nEvent code: ${state.meta.eventCode}\nOrganizer code: ${state.meta.organizerAccessCode}\nCounter code: ${state.meta.counterAccessCode}\nClient code: ${state.meta.clientAccessCode}\n\nGuest link: ${shareLink('guest')}\nCounter link: ${shareLink('counter')}\nOrganizer link: ${shareLink('organizer')}\nClient link: ${shareLink('client')}`;
}
function copyAccessInfo(){
  navigator.clipboard.writeText(buildEventSummaryText()).then(()=>toast('Copied.', 'ok')).catch(()=>toast('Could not copy — copy manually.', 'error'));
}
function emailEventSummary(){
  const subject = `Nimontron — ${state.meta.eventName || 'Event'} access codes & links`;
  const body = `Saved for your records — keep this somewhere safe.\n\n${buildEventSummaryText()}\n\nEach link only works with its matching code (the guest link doesn't need one).`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
async function resetEvent(){
  if(!confirm('This clears the entire guest list and serving history for everyone using this event. Continue?')) return;
  state.guests = [];
  await saveGuests();
  renderGuestList();
}

/* ---------- Share links (pageBaseUrl/shareLink live in app.js, shared with invite text) ---------- */
let shareLinkRows = [];
function renderShareLinks(){
  const el = document.getElementById('shareLinks');
  if(!el) return;
  shareLinkRows = [
    { label:'Guest link', url:shareLink('guest'), code:null },
    { label:'Counter link', url:shareLink('counter'), code:state.meta.counterAccessCode },
    { label:'Organizer link', url:shareLink('organizer'), code:state.meta.organizerAccessCode },
    { label:'Client link', url:shareLink('client'), code:state.meta.clientAccessCode }
  ];
  el.innerHTML = shareLinkRows.map((r,i)=>`
    <div class="share-link-row">
      <div style="min-width:120px;"><strong>${esc(r.label)}</strong>${r.code? `<div class="muted small">code: <span class="code-chip small">${esc(r.code)}</span></div>` : ''}</div>
      <code>${esc(r.url)}</code>
      <button class="mini-btn gold" onclick="copyShareLink(${i})">Copy link</button>
    </div>`).join('');
}
function copyShareLink(i){
  const row = shareLinkRows[i];
  if(!row) return;
  navigator.clipboard.writeText(row.url).then(()=>toast('Link copied.', 'ok')).catch(()=>toast('Could not copy — copy manually.', 'error'));
}

/* ---------- Invite media ---------- */
function dataUrlToFile(dataUrl, filename){
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bin = atob(parts[1]);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename || 'invite', { type:mime });
}
function handleInviteFileChange(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const MAX = 3.5*1024*1024;
  if(file.size > MAX){ toast('That file is too big to save reliably (keep it under ~3.5MB).', 'error'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    inviteMedia = { dataUrl: reader.result, mime:file.type, name:file.name };
    await saveInviteMedia();
    renderInvitePreview();
    toast('Invite card saved.', 'ok');
  };
  reader.onerror = ()=> toast('Could not read that file.', 'error');
  reader.readAsDataURL(file);
}
async function removeInviteMedia(){
  inviteMedia = null;
  await saveInviteMedia();
  renderInvitePreview();
  toast('Invite card removed.', 'ok');
}
function renderInvitePreview(){
  const el = document.getElementById('invitePreview');
  if(!el) return;
  if(!inviteMedia){ el.innerHTML = '<p class="muted small">No invite card uploaded yet.</p>'; return; }
  const tag = (inviteMedia.mime||'').startsWith('video')
    ? `<video src="${inviteMedia.dataUrl}" controls style="max-width:220px;border-radius:8px;"></video>`
    : `<img src="${inviteMedia.dataUrl}" style="max-width:220px;border-radius:8px;" alt="Invite card preview"/>`;
  el.innerHTML = `${tag}<div style="margin-top:6px;"><button class="mini-btn danger" onclick="removeInviteMedia()">Remove card</button></div>`;
}
function downloadInviteCard(){
  if(!inviteMedia){ toast('No invite card uploaded.', 'error'); return; }
  const a = document.createElement('a');
  a.href = inviteMedia.dataUrl; a.download = inviteMedia.name || 'invite-card';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Print all / copy text ---------- */
async function copyPassText(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  try{ await navigator.clipboard.writeText(buildInviteText(guest)); toast('Copied — paste it anywhere.', 'ok'); }
  catch(e){ toast('Could not copy — select the text manually.', 'error'); }
}
function printAllPasses(){
  if(!state.guests.length){ toast('Add guests first.', 'error'); return; }
  document.getElementById('printArea').innerHTML = `<div class="print-grid">${state.guests.map(passCardHTML).join('')}</div>`;
  window.print();
}

/* ---------- Invite sending ---------- */
async function markInviteSent(id, method){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  guest.invite = guest.invite || {followUps:[]};
  guest.invite.sent = true; guest.invite.sentAt = Date.now(); guest.invite.method = method;
  await saveGuests();
  renderGuestList();
  openPassModal(id);
  toast('Marked as sent.', 'ok');
}
async function toggleSentManual(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  guest.invite = guest.invite || {followUps:[]};
  guest.invite.sent = !guest.invite.sent;
  guest.invite.sentAt = guest.invite.sent ? Date.now() : null;
  if(guest.invite.sent && !guest.invite.method) guest.invite.method = 'manual';
  await saveGuests();
  renderGuestList();
  openPassModal(id);
}
async function sendInvite(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  const text = buildInviteText(guest);
  if(navigator.share){
    try{
      if(inviteMedia){
        const file = dataUrlToFile(inviteMedia.dataUrl, inviteMedia.name);
        if(navigator.canShare && navigator.canShare({ files:[file] })){
          await navigator.share({ files:[file], text, title: state.meta.eventName || 'You are invited' });
          await markInviteSent(id, 'share-with-card');
          return;
        }
      }
      await navigator.share({ text, title: state.meta.eventName || 'You are invited' });
      await markInviteSent(id, 'share-text');
      return;
    }catch(e){
      if(e && e.name === 'AbortError'){ toast('Share cancelled — nothing marked as sent.', 'error'); return; }
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  if(inviteMedia) toast('Opened WhatsApp with the message — attach the card manually, this browser can\'t pre-attach it.', 'ok');
  await markInviteSent(id, 'whatsapp-text');
}
async function sendFollowUp(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  const text = buildFollowUpText(guest);
  let opened = false;
  if(navigator.share){
    try{ await navigator.share({ text, title:'Following up' }); opened = true; }
    catch(e){ if(e && e.name==='AbortError'){ toast('Follow-up cancelled.', 'error'); return; } }
  }
  if(!opened) window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  guest.invite = guest.invite || {followUps:[]};
  guest.invite.followUps = guest.invite.followUps || [];
  guest.invite.followUps.push({ ts: Date.now() });
  await saveGuests();
  toast('Follow-up logged.', 'ok');
  openPassModal(id);
}

/* ---------- Guest details modal ---------- */
function guestDetailsHTML(g){
  const rsvp = g.rsvp || {status:'pending', count:g.allotted};
  const inv = g.invite || {sent:false, sentAt:null, method:null, followUps:[]};
  const accom = g.accommodation || {needed:false, rooms:0};
  return `
    ${passCardHTML(g)}
    <div class="modal-section">
      <h4>RSVP</h4>
      <p class="small muted">Current: <strong>${esc(rsvpLabel(rsvp.status))}</strong>${rsvp.status==='attending'? ' · '+rsvp.count+' guest'+(rsvp.count>1?'s':''):''}${rsvp.respondedAt? ' · '+formatTime(rsvp.respondedAt):''}</p>
      <div class="row">
        <select id="rsvpStatusSelect" class="text-input">
          ${['pending','attending','declined','maybe'].map(s=>`<option value="${s}" ${rsvp.status===s?'selected':''}>${esc(rsvpLabel(s))}</option>`).join('')}
        </select>
        <input id="rsvpCountInput" class="text-input" type="number" min="0" value="${rsvp.count!=null?rsvp.count:g.allotted}" placeholder="Party size" />
      </div>
      <button class="mini-btn" onclick="saveRsvpFromModal('${g.id}')">Save response</button>
    </div>
    <div class="modal-section">
      <h4>Accommodation</h4>
      <label style="display:flex; align-items:center; gap:8px; font-weight:400; text-transform:none;">
        <input id="accomNeeded" type="checkbox" ${accom.needed?'checked':''}/> Needs a room
      </label>
      <input id="accomRooms" class="text-input" type="number" min="0" value="${accom.rooms||0}" style="margin-top:6px;" placeholder="Rooms" />
      <button class="mini-btn" onclick="saveAccommodationFromModal('${g.id}')">Save</button>
    </div>
    <div class="modal-section">
      <h4>Invite</h4>
      <p class="small muted">${inv.sent ? 'Sent '+formatTime(inv.sentAt)+(inv.method? ' via '+esc(inv.method):'') : 'Not sent yet.'}${inv.followUps && inv.followUps.length ? ' · '+inv.followUps.length+' follow-up'+(inv.followUps.length>1?'s':'') : ''}</p>
      <div class="pass-actions" style="justify-content:flex-start;">
        <button class="btn btn-primary" onclick="sendInvite('${g.id}')">${inv.sent?'Resend invite':'Send invite'}</button>
        ${inv.sent ? `<button class="mini-btn" onclick="sendFollowUp('${g.id}')">Send follow-up</button>` : ''}
        <button class="mini-btn ghost" onclick="toggleSentManual('${g.id}')">${inv.sent?'Mark as not sent':'Mark as sent manually'}</button>
      </div>
      <div class="pass-actions" style="justify-content:flex-start; margin-top:6px;">
        <button class="mini-btn" onclick="copyPassText('${g.id}')">Copy text</button>
        <button class="mini-btn" onclick="downloadInviteCard()">Download card</button>
        <button class="mini-btn" onclick="printPass('${g.id}')">Print pass</button>
      </div>
    </div>`;
}
function openPassModal(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  document.getElementById('modalPassBody').innerHTML = guestDetailsHTML(guest);
  document.getElementById('passModalOverlay').classList.add('visible');
}
function closePassModal(){ document.getElementById('passModalOverlay').classList.remove('visible'); }
async function saveRsvpFromModal(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  applyRsvp(guest, document.getElementById('rsvpStatusSelect').value, document.getElementById('rsvpCountInput').value);
  await saveGuests();
  renderGuestList();
  openPassModal(id); toast('Response saved.', 'ok');
}
async function saveAccommodationFromModal(id){
  const guest = state.guests.find(g=>g.id===id);
  if(!guest) return;
  const needed = document.getElementById('accomNeeded').checked;
  const rooms = Math.max(0, parseInt(document.getElementById('accomRooms').value)||0);
  guest.accommodation = { needed, rooms: needed ? rooms : 0 };
  await saveGuests(); toast('Accommodation info saved.', 'ok');
}
