const DB_NAME='gourmetGuideDB',STORE='restaurants';let db,restaurants=[],currentFilter='all',currentLocation=null,currentEditLocation=null,editingPhotos=[];const $=id=>document.getElementById(id);
function photoBusy(show,text='写真を処理しています…'){
 let el=$('photoBusy');
 if(!el){el=document.createElement('div');el.id='photoBusy';el.className='photoBusy hidden';el.innerHTML='<div class="photoBusyBox"><div class="photoBusySpinner"></div><div id="photoBusyText"></div></div>';document.body.appendChild(el)}
 $('photoBusyText').textContent=text;el.classList.toggle('hidden',!show);
}
const yieldUI=()=>new Promise(r=>setTimeout(r,40));
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}function os(mode='readonly'){return db.transaction(STORE,mode).objectStore(STORE)}function getOne(id){return new Promise((res,rej)=>{const r=os().get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}function loadAllLight(){return new Promise((res,rej)=>{const list=[],r=os().openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return res(list);const v=c.value,{photos,...light}=v;list.push(light);c.continue()};r.onerror=()=>rej(r.error)})}function allKeys(){return new Promise((res,rej)=>{const r=os().getAllKeys();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}function put(o){return new Promise((res,rej)=>{const r=os('readwrite').put(o);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}function del(id){return new Promise((res,rej)=>{const r=os('readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function stars(n){return'★'.repeat(Number(n)||0)+'☆'.repeat(5-(Number(n)||0))}function hav(a,b){if(!a||!b)return null;const R=6371,d=x=>x*Math.PI/180,da=d(b.lat-a.lat),dl=d(b.lon-a.lon),x=Math.sin(da/2)**2+Math.cos(d(a.lat))*Math.cos(d(b.lat))*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function coordsOf(r){
  const lat=Number(r?.geoLat ?? r?.location?.lat);
  const lon=Number(r?.geoLon ?? r?.location?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  return {lat,lon};
}function dist(r){const d=hav(currentLocation,coordsOf(r));return d==null?'':d<1?`${Math.round(d*1000)}m`:`${d.toFixed(1)}km`}
function compressDataURL(src,maxDim=1280,quality=.72){return new Promise(resolve=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,maxDim/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{alpha:false});x.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality))};img.onerror=()=>resolve(src);img.src=src})}
async function makeThumb(src){return await compressDataURL(src,320,.62)}
async function optimizeExistingPhotos(){const keys=await allKeys();let stores=0,pics=0;for(const id of keys){const r=await getOne(id);if(!r||r.photoOptimizedV17)continue;if(Array.isArray(r.photos)&&r.photos.length){const arr=[];for(const p of r.photos){arr.push(await compressDataURL(p,1280,.72));pics++;await new Promise(q=>setTimeout(q,0))}r.photos=arr;r.thumbnail=await makeThumb(arr[0]);stores++}else if(Array.isArray(r.photos)&&r.photos[0]&&!r.thumbnail){r.thumbnail=await makeThumb(r.photos[0])}r.photoOptimizedV17=true;await put(r)}return{stores,pics}}

async function refresh(){restaurants=await loadAllLight();render()}function render(){const q=$('search').value.trim().toLowerCase(),genreFilter=$('genreFilter')?.value||'';let list=restaurants.filter(r=>[r.name,r.address,r.genre,r.note].join(' ').toLowerCase().includes(q));if(genreFilter)list=list.filter(r=>r.genre===genreFilter);
  if(currentFilter==='unvisited')list=list.filter(r=>(r.visitFrequency||'未訪問')==='未訪問');if(currentFilter==='favorite')list=list.filter(r=>r.favorite);if(currentFilter==='ranked')list=list.filter(r=>r.personalRanking).sort((a,b)=>a.personalRanking-b.personalRanking);
  // default star sort
  if(currentFilter!=='ranked'&&currentFilter!=='near')list.sort((a,b)=>(Number(b.rank)||0)-(Number(a.rank)||0)||(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));if(currentFilter==='near')list=list.filter(r=>coordsOf(r)&&currentLocation&&hav(currentLocation,coordsOf(r))<=5).sort((a,b)=>hav(currentLocation,coordsOf(a))-hav(currentLocation,coordsOf(b)));if($('countLabel'))$('countLabel').textContent=(q||genreFilter||currentFilter!=='all')?`表示：${list.length}件 / 全${restaurants.length}件`:`登録店舗：${restaurants.length}件`;$('list').innerHTML=list.map(r=>`<article class="card" data-id="${r.id}">${r.thumbnail?`<img class="thumb" src="${r.thumbnail}">`:'<div class="thumb placeholder">🍴</div>'}<div><h3>${esc(r.name)}</h3><div class="stars">${stars(r.rank)}</div><div class="meta">${esc(r.genre||'ジャンル未設定')}${r.price?' ・ '+esc(r.price):''}${dist(r)?' ・ '+dist(r):''}</div><div class="meta">${esc(r.address||'住所未設定')}</div><div class="badges">${r.favorite?'<span class="badge">♥ お気に入り</span>':''}<span class="badge">${esc(r.visitFrequency||'未訪問')}</span>${r.personalRanking?`<span class="badge">🏆 ${r.personalRanking}位</span>`:''}</div></div></article>`).join('');$('empty').classList.toggle('hidden',restaurants.length!==0);document.querySelectorAll('.card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id))}
function times(){const a=[];for(let h=5;h<=29;h++)for(const m of[0,30])a.push(`${String(h%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`);return a}function fill(id,vals){$(id).innerHTML=vals.map(v=>`<option>${v}</option>`).join('')}function locLabel(){$('locationLabel').textContent=currentEditLocation?`住所から登録：緯度 ${currentEditLocation.lat.toFixed(5)} / 経度 ${currentEditLocation.lon.toFixed(5)}`:'住所位置情報：未登録'}function renderPhotos(){$('photoPreview').innerHTML=editingPhotos.map((p,i)=>`<div class="photoWrap"><img src="${p}"><button type="button" class="photoDelete" data-i="${i}">×</button></div>`).join('');document.querySelectorAll('.photoDelete').forEach(b=>b.onclick=()=>{editingPhotos.splice(+b.dataset.i,1);renderPhotos()})}
function reset(r=null){for(const k of['name','address','phone','closedDays','note','tabelogUrl']){const el=$(k);if(el)el.value=r?.[k]||'';}$('restaurantId').value=r?.id||'';$('rank').value=r?.rank||3;$('visitFrequency').value=r?.visitFrequency||'未訪問';$('genre').value=r?.genre||'';$('price').value=r?.price||'';$('favorite').checked=!!r?.favorite;$('personalRanking').value=r?.personalRanking||'';$('lunchEnabled').checked=r?.hours?.lunch?.enabled??true;$('lunchOpen').value=r?.hours?.lunch?.open||'11:00';$('lunchClose').value=r?.hours?.lunch?.close||'14:30';$('dinnerEnabled').checked=r?.hours?.dinner?.enabled??true;$('dinnerOpen').value=r?.hours?.dinner?.open||'17:00';$('dinnerClose').value=r?.hours?.dinner?.close||'21:00';currentEditLocation=(Number.isFinite(Number(r?.geoLat))&&Number.isFinite(Number(r?.geoLon)))
  ? {lat:Number(r.geoLat),lon:Number(r.geoLon),addressSource:r?.geoAddress||(r?.address||'').trim()}
  : ((r?.location?.addressSource&&r.location.addressSource===(r?.address||'').trim())?r.location:null);editingPhotos=[...(r?.photos||[])];locLabel();renderPhotos();$('deleteRestaurantBtn').classList.toggle('hidden',!r);$('dialogTitle').textContent=r?'店舗編集':'店舗登録'}
function getLoc(){return new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude}),rej,{enableHighAccuracy:true,timeout:12000,maximumAge:30000}))}function fileURL(f){return new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.onerror=rej;rd.readAsDataURL(f)})}
async function showDetail(id){const r=await getOne(id);if(!r)return;const photos=r.photos||[];const gallery=photos.length?`<div class="galleryWrap"><div class="galleryTrack" id="galleryTrack">${photos.map((p,i)=>`<button class="gallerySlide" type="button" data-i="${i}" aria-label="写真 ${i+1}"><img src="${p}" alt="店舗写真 ${i+1}"></button>`).join('')}</div><div class="galleryCounter" id="galleryCounter">1 / ${photos.length}</div></div>`:'';const maps=`https://maps.apple.com/?q=${encodeURIComponent(r.address||r.name)}`;$('detail').innerHTML=`${gallery}<div class="detailBody"><h2>${esc(r.name)}</h2><div class="stars">${stars(r.rank)}</div><div class="detailInfo">${esc(r.genre||'')}${r.price?' ・ '+esc(r.price):''}<br>${esc(r.address||'')}<br>${r.phone?esc(r.phone)+'<br>':''}定休日：${esc(r.closedDays||'未設定')}<br>訪問：${esc(r.visitFrequency||'未訪問')}${r.personalRanking?`<br>自分ランキング：${r.personalRanking}位`:''}<br>昼：${r.hours?.lunch?.enabled?`${r.hours.lunch.open}〜${r.hours.lunch.close}`:'営業なし'}<br>夜：${r.hours?.dinner?.enabled?`${r.hours.dinner.open}〜${r.hours.dinner.close}`:'営業なし'}</div><div class="detailActions fourActions"><a href="${maps}" target="_blank">地図</a>${r.phone?`<a href="tel:${esc(r.phone)}">電話</a>`:'<button disabled>電話</button>'}${r.tabelogUrl?`<a href="${esc(r.tabelogUrl)}" target="_blank" rel="noopener">食べログ</a>`:'<button disabled>食べログ</button>'}<button id="editFromDetail">編集</button></div>${r.note?`<div class="noteBox">${esc(r.note)}</div>`:''}</div>`;$('detailDialog').showModal();if(photos.length){const track=$('galleryTrack'),counter=$('galleryCounter');const update=()=>{const w=track.clientWidth||1,idx=Math.max(0,Math.min(photos.length-1,Math.round(track.scrollLeft/w)));counter.textContent=`${idx+1} / ${photos.length}`};track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});document.querySelectorAll('.gallerySlide').forEach(btn=>btn.onclick=()=>openFullscreenGallery(photos,+btn.dataset.i))}$('editFromDetail').onclick=async()=>{
  try{
    const fresh=await getOne(r.id);
    $('detailDialog').close();
    reset(fresh||r);
    const dlg=$('editorDialog');
    if(!dlg)return alert('編集画面を読み込めませんでした。アプリを完全終了して再起動してください。');
    dlg.showModal();
  }catch(err){
    console.error('edit open error',err);
    alert('編集画面を開けませんでした。アプリを完全終了して再起動してください。');
  }
}}
function openFullscreenGallery(photos,startIndex=0){let overlay=document.getElementById('fullscreenGallery');if(overlay)overlay.remove();overlay=document.createElement('div');overlay.id='fullscreenGallery';overlay.className='fullscreenGallery';overlay.innerHTML=`<button class="fullClose" type="button" aria-label="閉じる">×</button><div class="fullTrack" id="fullTrack">${photos.map((p,i)=>`<div class="fullSlide"><img src="${p}" alt="写真 ${i+1}"></div>`).join('')}</div><div class="fullCounter" id="fullCounter">${startIndex+1} / ${photos.length}</div>`;document.body.appendChild(overlay);const track=document.getElementById('fullTrack'),counter=document.getElementById('fullCounter');requestAnimationFrame(()=>{track.scrollLeft=track.clientWidth*startIndex});const update=()=>{const w=track.clientWidth||1,idx=Math.max(0,Math.min(photos.length-1,Math.round(track.scrollLeft/w)));counter.textContent=`${idx+1} / ${photos.length}`};track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});overlay.querySelector('.fullClose').onclick=()=>overlay.remove()}

function makeBackupPayload(){
  return {
    app:"My Gourmet Guide",
    formatVersion:1,
    exportedAt:new Date().toISOString(),
    restaurantCount:restaurants.length,
    restaurants:restaurants
  };
}
function safeFileNameDate(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
async function downloadBackup(){
  const full=[];for(const r of restaurants){const x=await getOne(r.id);if(x)full.push(x)}
  const payload={app:'My Gourmet Guide',formatVersion:17,exportedAt:new Date().toISOString(),restaurantCount:full.length,restaurants:full};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`gourmet-guide-backup_${safeFileNameDate()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function restoreBackupFile(file){
  let parsed;
  try{
    parsed=JSON.parse(await file.text());
  }catch{
    alert('バックアップファイルを読み込めませんでした。');
    return;
  }
  const list=Array.isArray(parsed)?parsed:parsed?.restaurants;
  if(!Array.isArray(list)){
    alert('このファイルはグルメガイドのバックアップではありません。');
    return;
  }
  if(!confirm(`${list.length}店舗を復元します。\n現在の登録データに同じIDの店舗がある場合は上書きされます。よろしいですか？`))return;
  try{
    for(const r of list){
      if(!r || !r.id || !r.name) continue;
      await put(r);
    }
    await refresh();
    alert(`復元が完了しました。\n${list.length}店舗を読み込みました。`);
  }catch(e){
    console.error(e);
    alert('復元中にエラーが発生しました。');
  }
}

async function geocodeAddress(address){
  const raw=(address||'').trim();
  if(!raw)throw new Error('住所が入力されていません。');

  if(typeof window.getLatLng!=='function'){
    throw new Error('住所検索機能を読み込めませんでした。通信状態を確認してアプリを再起動してください。');
  }

  return await new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{
      if(settled)return;
      settled=true;
      reject(new Error('住所検索がタイムアウトしました。もう一度お試しください。'));
    },15000);

    try{
      window.getLatLng(
        raw,
        result=>{
          if(settled)return;
          settled=true;
          clearTimeout(timer);
          const lat=Number(result?.lat);
          const lon=Number(result?.lng);
          if(!Number.isFinite(lat)||!Number.isFinite(lon)){
            reject(new Error('住所から位置を取得できませんでした。'));
            return;
          }
          resolve({
            lat,
            lon,
            addressSource:raw,
            geocodeProvider:'geolonia-community-geocoder',
            geocodeLevel:Number(result?.level)||0,
            normalizedAddress:[result?.pref,result?.city,result?.town,result?.addr].filter(Boolean).join(''),
            geocodedAt:Date.now()
          });
        },
        error=>{
          if(settled)return;
          settled=true;
          clearTimeout(timer);
          reject(new Error('住所から位置を取得できませんでした。住所表記を確認してください。'));
        }
      );
    }catch(e){
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      reject(e);
    }
  });
}
async function migrateGeoFields(){
  const keys=await allKeys();
  let changed=0;
  for(const id of keys){
    const r=await getOne(id);
    if(!r)continue;
    if((r.geoLat==null||r.geoLon==null)&&r.location&&Number.isFinite(Number(r.location.lat))&&Number.isFinite(Number(r.location.lon))){
      r.geoLat=Number(r.location.lat);
      r.geoLon=Number(r.location.lon);
      r.geoAddress=r.location.addressSource||r.address||'';
      await put(r);
      changed++;
    }
  }
  return changed;
}

document.addEventListener('DOMContentLoaded',async()=>{for(const id of['lunchOpen','lunchClose','dinnerOpen','dinnerClose'])fill(id,times());$('personalRanking').innerHTML='<option value="">なし</option>'+Array.from({length:50},(_,i)=>`<option value="${i+1}">${i+1}位</option>`).join('');await openDB();await migrateGeoFields();if($('status'))$('status').textContent='初回のみ：写真データを軽量化しています…';const mig=await optimizeExistingPhotos();await refresh();if($('status'))$('status').textContent='';if(mig.stores)setTimeout(()=>alert(`${mig.stores}店舗・${mig.pics}枚の写真を軽量化しました。\n店舗データはそのままです。`),300);

if($('searchTabelogBtn'))$('searchTabelogBtn').onclick=()=>{
  const name=$('name')?.value.trim()||'';
  const address=$('address')?.value.trim()||'';
  if(!name){alert('先に店舗名を入力してください。');return;}
  const q=`site:tabelog.com ${name} ${address}`.trim();
  const url=`https://www.google.com/search?q=${encodeURIComponent(q)}`;
  // Standalone PWAから外部Safariで開くため、ユーザー操作内で一時リンクをtarget=_blankで開く。
  const a=document.createElement('a');
  a.href=url;
  a.target='_blank';
  a.rel='noopener external';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
if($('pasteTabelogBtn'))$('pasteTabelogBtn').onclick=async()=>{
  try{
    const text=(await navigator.clipboard.readText()).trim();
    if(!text){alert('クリップボードにURLがありません。');return;}
    if(!/^https?:\/\//i.test(text)){alert('URLをコピーしてから貼り付けてください。');return;}
    if($('tabelogUrl'))$('tabelogUrl').value=text;
  }catch{
    const text=prompt('食べログURLを貼り付けてください。',$('tabelogUrl')?.value||'');
    if(text!==null&&$('tabelogUrl'))$('tabelogUrl').value=text.trim();
  }
};

$('backupBtn').onclick=async()=>{if(!restaurants.length){alert('バックアップする店舗がありません。');return;}await downloadBackup();};
$('restoreBtn').onclick=()=>$('restoreFile').click();
$('restoreFile').onchange=async e=>{const f=e.target.files?.[0];if(f)await restoreBackupFile(f);e.target.value='';};$('addBtn').onclick=()=>{reset();$('editorDialog').showModal()};$('cancelBtn').onclick=()=>$('editorDialog').close();$('closeDetailBtn').onclick=()=>$('detailDialog').close();$('search').oninput=render;if($('genreFilter'))$('genreFilter').onchange=render;document.querySelectorAll('.chip').forEach(b=>b.onclick=async()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;if(currentFilter==='near'&&!currentLocation){try{currentLocation=await getLoc();}catch{$('status').textContent='現在地を取得できませんでした。位置情報の許可を確認してください。';render();return;}}if(currentFilter==='near'){const located=restaurants.filter(r=>coordsOf(r)).length;$('status').textContent=`現在地から5km以内を表示。位置登録済み ${located} / ${restaurants.length}件`;}else $('status').textContent='';render()});
if($('geocodeAddressBtn'))$('geocodeAddressBtn').onclick=async()=>{
  const address=$('address')?.value.trim()||'';
  const id=$('restaurantId')?.value||'';
  if(!address){alert('先に店舗住所を入力してください。');return;}

  currentEditLocation=null;
  locLabel();

  try{
    if(typeof photoBusy==='function')photoBusy(true,'登録住所を検索しています…');
    const pos=await geocodeAddress(address);
    currentEditLocation=pos;
    locLabel();

    if(id){
      const fresh=await getOne(id);
      if(fresh){
        fresh.location=pos;
        fresh.geoLat=Number(pos.lat);
        fresh.geoLon=Number(pos.lon);
        fresh.geoAddress=address;
        fresh.address=address;
        fresh.updatedAt=Date.now();
        await put(fresh);
        await refresh();
      }
    }

    const normalized=pos.normalizedAddress?`
検索結果：${pos.normalizedAddress}`:'';
    alert(`位置情報を登録しました。
${address}${normalized}

緯度 ${pos.lat.toFixed(6)}
経度 ${pos.lon.toFixed(6)}`);
  }catch(err){
    currentEditLocation=null;
    locLabel();
    alert(err?.message||'住所から位置情報を取得できませんでした。');
  }finally{
    if(typeof photoBusy==='function')photoBusy(false);
  }
};$('clearLocationBtn').onclick=()=>{currentEditLocation=null;locLabel()};$('photos').onchange=async e=>{
 const files=[...e.target.files].slice(0,20-editingPhotos.length);e.target.value='';
 if(!files.length)return;
 let ok=0,ng=0;photoBusy(true,`写真を読み込んでいます… 0 / ${files.length}`);
 for(let i=0;i<files.length;i++){
   photoBusy(true,`写真を読み込んでいます… ${i+1} / ${files.length}`);
   try{
     // Dropbox/iCloud等のクラウドファイルを1枚ずつ完全に取得してから圧縮。
     const buf=await files[i].arrayBuffer();
     const localFile=new Blob([buf],{type:files[i].type||'image/jpeg'});
     const raw=await fileURL(localFile);
     editingPhotos.push(await compressDataURL(raw,1280,.72));ok++;
   }catch(err){console.warn('cloud photo import failed',err);ng++}
   await yieldUI();
 }
 photoBusy(false);renderPhotos();
 if(ng)alert(`${ok}枚を読み込みました。\n${ng}枚はクラウドから取得できませんでした。\n取得できない写真は一度iPhoneの「写真」へ保存してから選択してください。`);
};$('editorForm').onsubmit=async e=>{e.preventDefault();const id=$('restaurantId').value||crypto.randomUUID();await put({id,name:$('name').value.trim(),address:$('address').value.trim(),phone:$('phone').value.trim(),closedDays:$('closedDays').value.trim(),tabelogUrl:$('tabelogUrl').value.trim(),rank:+$('rank').value,visitFrequency:$('visitFrequency').value,genre:$('genre').value,price:$('price').value,note:$('note').value.trim(),favorite:$('favorite').checked,personalRanking:$('personalRanking').value?+$('personalRanking').value:null,location:(currentEditLocation?.addressSource===$('address').value.trim()?currentEditLocation:null),
geoLat:(currentEditLocation?.addressSource===$('address').value.trim()?Number(currentEditLocation.lat):null),
geoLon:(currentEditLocation?.addressSource===$('address').value.trim()?Number(currentEditLocation.lon):null),
geoAddress:(currentEditLocation?.addressSource===$('address').value.trim()?$('address').value.trim():''),
photos:editingPhotos,thumbnail:editingPhotos[0]?await makeThumb(editingPhotos[0]):null,photoOptimizedV17:true,hours:{lunch:{enabled:$('lunchEnabled').checked,open:$('lunchOpen').value,close:$('lunchClose').value},dinner:{enabled:$('dinnerEnabled').checked,open:$('dinnerOpen').value,close:$('dinnerClose').value}},updatedAt:Date.now()});$('editorDialog').close();await refresh()};$('deleteRestaurantBtn').onclick=async()=>{const id=$('restaurantId').value;if(id&&confirm('この店舗を削除しますか？写真も削除されます。')){await del(id);$('editorDialog').close();await refresh()}};if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js?v=1126').then(r=>r.update()).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!sessionStorage.getItem('gg-sw-reloaded')){sessionStorage.setItem('gg-sw-reloaded','1');location.reload();}})}});
