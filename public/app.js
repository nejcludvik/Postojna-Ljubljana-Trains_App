const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const names={postojna:'Postojna',ljubljana:'Ljubljana'};
const PREF_KEY='pl-trains-prefs-v2';
let state={from:'postojna',day:0,data:null,timer:null,prefs:loadPrefs()};

function loadPrefs(){
  try{return {...{travel:{postojna:10,ljubljana:10},favorites:[]},...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch{return {travel:{postojna:10,ljubljana:10},favorites:[]}}
}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(state.prefs))}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function isoForDay(offset){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function formatDate(iso){return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(`${iso}T12:00:00`))}
function minsNow(){const d=new Date();return d.getHours()*60+d.getMinutes()}
function tmin(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function clock(total){total=(total+1440)%1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function delayClass(m,cancelled=false){return cancelled?'bad':m>15?'bad':m>0?'warn':''}
function delayLabel(t){if(t.cancelled)return 'CANCELLED';if(t.delayMinutes>0)return `+${t.delayMinutes} min`;return 'ON TIME'}
function expectedDeparture(t){return clock(tmin(t.departure)+(t.delayMinutes||0))}
function expectedArrival(t){return clock(tmin(t.arrival)+(t.delayMinutes||0))}
function primaryService(t){return t.trains?.filter(x=>!x.startsWith('BUS ')).at(-1)||t.trains?.[0]||t.service||'Train'}
function favoriteId(t,from=state.from){return `${from}|${t.departure}|${primaryService(t)}`}
function isFavorite(t){return state.prefs.favorites.includes(favoriteId(t))}
function nextTrain(data){const now=minsNow();if(state.day>0)return data.trains.find(t=>!t.cancelled)||data.trains[0];return data.trains.find(t=>!t.cancelled&&tmin(t.departure)+(t.delayMinutes||0)>=now-2)}
function leaveInfo(t){
  const travel=Math.max(0,Number(state.prefs.travel?.[state.from]??10));
  const leaveAt=tmin(t.departure)+(t.delayMinutes||0)-travel;
  if(state.day===0){const diff=leaveAt-minsNow();if(diff>0)return {main:`Leave in ${diff} min`,sub:`Leave at ${clock(leaveAt)} · ${travel} min to station`};if(diff>=-travel)return {main:'Leave for the station now',sub:`Train expected ${expectedDeparture(t)} · ${travel} min to station`};return {main:'Departure window has passed',sub:`Train expected ${expectedDeparture(t)}`}}
  return {main:`Leave at ${clock(leaveAt)}`,sub:`Allow ${travel} min to reach ${names[state.from]} station`};
}
function trainCard(t,next){
  const fav=isFavorite(t), cls=delayClass(t.delayMinutes,t.cancelled), eta=t.delayMinutes&&!t.cancelled?`<small>ETA ${expectedArrival(t)}</small>`:'';
  return `<article class="train ${t===next?'next':''} ${t.cancelled?'cancelled':''}" data-id="${esc(favoriteId(t))}">
    <button class="fav-btn ${fav?'active':''}" data-fav="${esc(favoriteId(t))}" aria-label="${fav?'Remove from':'Save as'} usual train" title="Usual train">${fav?'★':'☆'}</button>
    <div class="time">${esc(t.departure)}<small>→ ${esc(t.arrival)}</small></div>
    <div class="service">${esc(primaryService(t))}${t.replacementBus?'<span class="bus">BUS</span>':''}<small>${t.transfers?`${t.transfers} transfer${t.transfers>1?'s':''}`:'Direct'} · ${esc(t.duration||'')}</small></div>
    <div class="status ${cls}">${delayLabel(t)}${eta}</div>
  </article>`
}
function renderUsual(data){
  const usual=data.trains.filter(isFavorite), wrap=$('#usualWrap');
  wrap.classList.toggle('hidden',!usual.length);$('#usualCount').textContent=usual.length?`${usual.length} saved`:'';
  $('#usualList').innerHTML=usual.map(t=>{const leave=leaveInfo(t);return `<div class="usual-card"><div><strong>${esc(t.departure)} · ${esc(primaryService(t))}</strong><small>${esc(names[state.from])} → ${esc(data.to)}</small></div><div class="usual-right"><span class="usual-status ${delayClass(t.delayMinutes,t.cancelled)}">${delayLabel(t)}</span>${!t.cancelled?`<small>${esc(leave.main)}</small>`:''}</div></div>`}).join('');
}
function render(data){
  state.data=data;const to=state.from==='postojna'?'ljubljana':'postojna';$('#fromName').textContent=names[state.from];$('#toName').textContent=names[to];$('#dateHeading').textContent=formatDate(data.date);$('#updated').textContent=`Updated ${new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(data.updatedAt))} · refreshes every 6 min`;
  const next=nextTrain(data);$('#nextCard').classList.remove('skeleton');
  if(next){const leave=leaveInfo(next);$('#nextCard').innerHTML=`<div class="next-label"><span class="eyebrow">NEXT TRAIN</span><span class="pill ${delayClass(next.delayMinutes,next.cancelled)}">${delayLabel(next)}</span></div><div class="big-time">${esc(next.departure)}<span class="arrow">→</span>${esc(next.delayMinutes?expectedArrival(next):next.arrival)}</div><div class="next-meta"><span>${esc(primaryService(next))}${next.replacementBus?' · includes bus':''}</span><span>${esc(next.duration||'')}</span></div><div class="leave"><strong>${esc(leave.main)}</strong><small>${esc(leave.sub)}</small></div>`}
  else $('#nextCard').innerHTML='<div class="empty">No more departures found today.</div>';
  $('#trainList').innerHTML=data.trains.length?data.trains.map(t=>trainCard(t,next)).join(''):'<div class="empty">No timetable entries found.</div>';
  renderUsual(data);
  const alerts=(data.alerts||[]);$('#alertsWrap').classList.toggle('hidden',!alerts.length);$('#alerts').innerHTML=alerts.map(a=>`<div class="alert">${esc(a)}</div>`).join('');
  bindFavoriteButtons();
}
function bindFavoriteButtons(){
  $$('.fav-btn').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.fav;const has=state.prefs.favorites.includes(id);state.prefs.favorites=has?state.prefs.favorites.filter(x=>x!==id):[...state.prefs.favorites,id];savePrefs();render(state.data)}));
}
async function load(silent=false){
  if(!silent){$('#nextCard').classList.add('skeleton');$('#nextCard').innerHTML='<p>Loading official SŽ data…</p>'}
  try{const r=await fetch(`/api/trains?from=${state.from}&date=${isoForDay(state.day)}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error);render(d)}catch(e){$('#nextCard').classList.remove('skeleton');$('#nextCard').innerHTML=`<div class="error"><strong>Could not load SŽ data.</strong><br><small>${esc(e.message)}</small></div>`;if(!silent)$('#trainList').innerHTML=''}
  clearTimeout(state.timer);state.timer=setTimeout(()=>load(true),360000)
}
function openSettings(){
  $('#postojnaTravel').value=state.prefs.travel?.postojna??10;$('#ljubljanaTravel').value=state.prefs.travel?.ljubljana??10;$('#settingsSheet').classList.remove('hidden');document.body.classList.add('sheet-open')
}
function closeSettings(){
  $('#settingsSheet').classList.add('hidden');document.body.classList.remove('sheet-open')
}

$('#swapBtn').addEventListener('click',()=>{state.from=state.from==='postojna'?'ljubljana':'postojna';load()});
$('#refreshBtn').addEventListener('click',()=>load());
$('#settingsBtn').addEventListener('click',openSettings);$('#closeSettings').addEventListener('click',closeSettings);$('#sheetBackdrop').addEventListener('click',closeSettings);
$('#saveSettings').addEventListener('click',()=>{state.prefs.travel={postojna:Math.max(0,Math.min(120,Number($('#postojnaTravel').value)||0)),ljubljana:Math.max(0,Math.min(120,Number($('#ljubljanaTravel').value)||0))};savePrefs();closeSettings();if(state.data)render(state.data)});
$$('.day-tabs button').forEach(b=>b.addEventListener('click',()=>{$$('.day-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.day=Number(b.dataset.day);load()}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load(true)});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
load();
