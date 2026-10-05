const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const names={postojna:'Postojna',ljubljana:'Ljubljana'};
const PREF_KEY='pl-trains-prefs-v3';
const CACHE_KEY='pl-trains-cache-v1';
const defaults={travel:{postojna:10,ljubljana:10},favorites:[],showPast:false,autoDirection:true,lastDirection:'postojna'};
let state={from:'postojna',day:0,data:null,timer:null,prefs:loadPrefs(),offline:false};

function loadPrefs(){
  try{
    const stored=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');
    return {...defaults,...stored,travel:{...defaults.travel,...(stored.travel||{})},favorites:Array.isArray(stored.favorites)?stored.favorites:[]};
  }catch{return structuredClone(defaults)}
}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(state.prefs))}
function cacheId(from,date){return `${from}|${date}`}
function saveCachedData(data){
  try{const all=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');all[cacheId(state.from,data.date)]={savedAt:new Date().toISOString(),data};localStorage.setItem(CACHE_KEY,JSON.stringify(all))}catch{}
}
function loadCachedData(from,date){
  try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')[cacheId(from,date)]||null}catch{return null}
}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function isoForDay(offset){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function formatDate(iso){return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(`${iso}T12:00:00`))}
function minsNow(){const d=new Date();return d.getHours()*60+d.getMinutes()}
function tmin(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function clock(total){total=(total+1440)%1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function delayClass(m,cancelled=false){return cancelled?'bad':m>15?'bad':m>0?'warn':''}
function delayLabel(t){if(t.cancelled)return 'CANCELLED';if(t.delayMinutes>0)return `+${t.delayMinutes} min`;if(t.liveAvailable)return 'ON TIME';return 'SCHEDULED'}
function expectedDeparture(t){return clock(tmin(t.departure)+(t.delayMinutes||0))}
function expectedArrival(t){return clock(tmin(t.arrival)+(t.delayMinutes||0))}
function primaryService(t){return t.trains?.filter(x=>!x.startsWith('BUS ')).at(-1)||t.trains?.[0]||t.service||'Train'}
function favoriteId(t,from=state.from){return `${from}|${t.departure}`}
function isFavorite(t){const stable=favoriteId(t);return state.prefs.favorites.some(id=>id===stable||id.startsWith(`${stable}|`))}
function isPastTrain(t){return state.day===0 && !t.cancelled && tmin(t.departure)+(t.delayMinutes||0)<minsNow()-2}
function visibleTrains(data){return state.day===0&&!state.prefs.showPast?data.trains.filter(t=>!isPastTrain(t)):data.trains}
function nextTrain(data){const now=minsNow();if(state.day>0)return data.trains.find(t=>!t.cancelled)||data.trains[0];return data.trains.find(t=>!t.cancelled&&tmin(t.departure)+(t.delayMinutes||0)>=now-2)}
function leaveInfo(t){
  const travel=Math.max(0,Number(state.prefs.travel?.[state.from]??10));
  const leaveAt=tmin(t.departure)+(t.delayMinutes||0)-travel;
  if(state.day===0){const diff=leaveAt-minsNow();if(diff>0)return {main:`Leave in ${diff} min`,sub:`Leave at ${clock(leaveAt)} · ${travel} min to station`};if(diff>=-travel)return {main:'Leave for the station now',sub:`Train expected ${expectedDeparture(t)} · ${travel} min to station`};return {main:'Departure window has passed',sub:`Train expected ${expectedDeparture(t)}`}}
  return {main:`Leave at ${clock(leaveAt)}`,sub:`Allow ${travel} min to reach ${names[state.from]} station`};
}
function freshnessText(iso){
  if(!iso)return 'not available';
  const diff=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/60000));
  if(diff<1)return 'just now';if(diff===1)return '1 min ago';if(diff<60)return `${diff} min ago`;
  const h=Math.floor(diff/60);return `${h} h ago`;
}
function timeDisplay(t){
  if(t.cancelled||!t.delayMinutes)return `<div class="time">${esc(t.departure)}<small>→ ${esc(t.arrival)}</small></div>`;
  return `<div class="time delayed-time"><span>${esc(t.departure)}</span><strong>${esc(expectedDeparture(t))}</strong><small>scheduled · expected</small></div>`;
}
function trainCard(t,next){
  const fav=isFavorite(t), cls=delayClass(t.delayMinutes,t.cancelled);
  const arrival=t.delayMinutes&&!t.cancelled?`<small>Arrival ${esc(t.arrival)} → ${esc(expectedArrival(t))}</small>`:'';
  return `<article class="train ${t===next?'next':''} ${t.cancelled?'cancelled':''}" data-id="${esc(favoriteId(t))}">
    <button class="fav-btn ${fav?'active':''}" data-fav="${esc(favoriteId(t))}" aria-label="${fav?'Remove from':'Save as'} usual train" title="Usual train">${fav?'★':'☆'}</button>
    ${timeDisplay(t)}
    <div class="service">${esc(primaryService(t))}${t.replacementBus?'<span class="bus">BUS</span>':''}<small>${t.transfers?`${t.transfers} transfer${t.transfers>1?'s':''}`:'Direct'} · ${esc(t.duration||'')}${t.platform?` · Platform ${esc(t.platform)}`:''}</small></div>
    <div class="status ${cls}">${delayLabel(t)}${arrival}</div>
  </article>`
}
function renderUsual(data){
  const usual=data.trains.filter(isFavorite), wrap=$('#usualWrap');
  wrap.classList.toggle('hidden',!usual.length);$('#usualCount').textContent=usual.length?`${usual.length} saved`:'';
  $('#usualList').innerHTML=usual.map(t=>{const leave=leaveInfo(t);return `<div class="usual-card"><div><strong>${esc(t.departure)}${t.delayMinutes?` → ${esc(expectedDeparture(t))}`:''} · ${esc(primaryService(t))}</strong><small>${esc(names[state.from])} → ${esc(data.to)}${t.platform?` · Platform ${esc(t.platform)}`:''}</small></div><div class="usual-right"><span class="usual-status ${delayClass(t.delayMinutes,t.cancelled)}">${delayLabel(t)}</span>${!t.cancelled?`<small>${esc(leave.main)}</small>`:''}</div></div>`}).join('');
}
function renderFreshness(data){
  const live=data.realtimeUpdatedAt?`Realtime ${freshnessText(data.realtimeUpdatedAt)}`:(state.day===0?'Realtime unavailable':'Future schedule');
  const tt=data.timetableUpdatedAt?`Timetable indexed ${freshnessText(data.timetableUpdatedAt)}`:'Timetable loaded';
  $('#freshness').innerHTML=`<span>${esc(live)}</span><span>${esc(tt)}</span>${state.offline?'<strong>OFFLINE CACHE</strong>':''}`;
  $('#offlineBanner').classList.toggle('hidden',!state.offline);
}
function render(data){
  state.data=data;const to=state.from==='postojna'?'ljubljana':'postojna';$('#fromName').textContent=names[state.from];$('#toName').textContent=names[to];$('#dateHeading').textContent=formatDate(data.date);
  $('#updated').textContent=state.offline?`Offline · cached ${freshnessText(data.cachedAt||data.updatedAt)}`:`Updated ${freshnessText(data.updatedAt)} · refreshes every ${Math.max(1,Math.round((data.refreshAfterSeconds||120)/60))} min`;
  renderFreshness(data);
  const next=nextTrain(data);$('#nextCard').classList.remove('skeleton');
  if(next){
    const leave=leaveInfo(next), delayed=next.delayMinutes&&!next.cancelled;
    $('#nextCard').innerHTML=`<div class="next-label"><span class="eyebrow">NEXT TRAIN</span><span class="pill ${delayClass(next.delayMinutes,next.cancelled)}">${delayLabel(next)}</span></div>
      <div class="big-time">${delayed?`<span class="scheduled-big">${esc(next.departure)}</span><span class="arrow">→</span><span>${esc(expectedDeparture(next))}</span>`:`${esc(next.departure)}<span class="arrow">→</span>${esc(next.arrival)}`}</div>
      ${delayed?`<div class="expected-row"><span>Scheduled ${esc(next.departure)}</span><strong>Expected ${esc(expectedDeparture(next))}</strong><span>Arrive ${esc(expectedArrival(next))}</span></div>`:''}
      <div class="next-meta"><span>${esc(primaryService(next))}${next.platform?` · Platform ${esc(next.platform)}`:''}${next.replacementBus?' · includes bus':''}</span><span>${esc(next.duration||'')}</span></div>
      <div class="leave"><strong>${esc(leave.main)}</strong><small>${esc(leave.sub)}</small></div>`;
  } else $('#nextCard').innerHTML='<div class="empty">No more departures found today.</div>';
  const shown=visibleTrains(data), hiddenCount=data.trains.length-shown.length;
  $('#pastToggle').classList.toggle('hidden',state.day!==0||(!hiddenCount&& !state.prefs.showPast));
  $('#pastToggle').textContent=state.prefs.showPast?'Hide past':`Show past${hiddenCount?` (${hiddenCount})`:''}`;
  $('#trainList').innerHTML=shown.length?shown.map(t=>trainCard(t,next)).join(''):'<div class="empty">No upcoming departures found.</div>';
  renderUsual(data);
  const alerts=(data.alerts||[]);$('#alertsWrap').classList.toggle('hidden',!alerts.length);$('#alerts').innerHTML=alerts.map(a=>`<div class="alert">${esc(a)}</div>`).join('');
  bindFavoriteButtons();
}
function bindFavoriteButtons(){
  $$('.fav-btn').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.fav;const matches=x=>x===id||x.startsWith(`${id}|`);const has=state.prefs.favorites.some(matches);state.prefs.favorites=has?state.prefs.favorites.filter(x=>!matches(x)):[...state.prefs.favorites,id];savePrefs();render(state.data)}));
}
async function load(silent=false){
  const date=isoForDay(state.day);
  if(!silent){$('#nextCard').classList.add('skeleton');$('#nextCard').innerHTML='<p>Loading DUJPP train data…</p>'}
  try{
    const r=await fetch(`/api/trains?from=${state.from}&date=${date}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error);
    state.offline=false;saveCachedData(d);render(d);
  }catch(e){
    const cached=loadCachedData(state.from,date);
    if(cached?.data){state.offline=true;render({...cached.data,cachedAt:cached.savedAt})}
    else{$('#nextCard').classList.remove('skeleton');$('#nextCard').innerHTML=`<div class="error"><strong>Could not load train data.</strong><br><small>${esc(e.message)}</small></div>`;if(!silent)$('#trainList').innerHTML=''}
  }
  clearTimeout(state.timer);state.timer=setTimeout(()=>load(true),(state.data?.refreshAfterSeconds||120)*1000);
}
function openSettings(){
  $('#postojnaTravel').value=state.prefs.travel?.postojna??10;$('#ljubljanaTravel').value=state.prefs.travel?.ljubljana??10;$('#autoDirection').checked=state.prefs.autoDirection!==false;$('#settingsSheet').classList.remove('hidden');document.body.classList.add('sheet-open')
}
function closeSettings(){$('#settingsSheet').classList.add('hidden');document.body.classList.remove('sheet-open')}
function chooseInitialDirection(){
  if(state.prefs.autoDirection!==false){state.from=new Date().getHours()<12?'postojna':'ljubljana'}else state.from=state.prefs.lastDirection||'postojna';
}

$('#swapBtn').addEventListener('click',()=>{state.from=state.from==='postojna'?'ljubljana':'postojna';state.prefs.lastDirection=state.from;savePrefs();load()});
$('#refreshBtn').addEventListener('click',()=>load());
$('#pastToggle').addEventListener('click',()=>{state.prefs.showPast=!state.prefs.showPast;savePrefs();if(state.data)render(state.data)});
$('#settingsBtn').addEventListener('click',openSettings);$('#closeSettings').addEventListener('click',closeSettings);$('#sheetBackdrop').addEventListener('click',closeSettings);
$('#saveSettings').addEventListener('click',()=>{state.prefs.travel={postojna:Math.max(0,Math.min(120,Number($('#postojnaTravel').value)||0)),ljubljana:Math.max(0,Math.min(120,Number($('#ljubljanaTravel').value)||0))};state.prefs.autoDirection=$('#autoDirection').checked;state.prefs.lastDirection=state.from;savePrefs();closeSettings();if(state.data)render(state.data)});
$$('.day-tabs button').forEach(b=>b.addEventListener('click',()=>{$$('.day-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.day=Number(b.dataset.day);load()}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load(true)});
window.addEventListener('online',()=>load(true));
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
chooseInitialDirection();
load();
