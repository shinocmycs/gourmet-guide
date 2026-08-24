const DB_NAME='gourmetGuideDB',STORE='restaurants';let db,restaurants=[],currentFilter='all',currentLocation=null,currentEditLocation=null,editingPhotos=[],editingCloudPaths=[];const $=id=>document.getElementById(id);
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
function compressDataURL(src,maxDim=1280,quality=.72){
  return new Promise(resolve=>{
    if(!src){resolve(src);return;}
    // Cloud photos are already optimized. Re-drawing a signed URL to canvas can
    // taint the canvas on iOS Safari and leave the save promise hanging.
    if(typeof src==='string'&&/^https?:\/\//i.test(src)){resolve(src);return;}
    const img=new Image();
    let done=false;
    const finish=v=>{if(done)return;done=true;resolve(v)};
    img.onload=()=>{
      try{
        const nw=img.naturalWidth||img.width,nh=img.naturalHeight||img.height;
        const scale=Math.min(1,maxDim/Math.max(nw,nh));
        const w=Math.max(1,Math.round(nw*scale)),h=Math.max(1,Math.round(nh*scale));
        const c=document.createElement('canvas');c.width=w;c.height=h;
        const x=c.getContext('2d',{alpha:false});
        x.drawImage(img,0,0,w,h);
        finish(c.toDataURL('image/jpeg',quality));
      }catch(err){
        console.warn('image compression skipped',err);
        finish(src);
      }
    };
    img.onerror=()=>finish(src);
    setTimeout(()=>finish(src),12000);
    img.src=src;
  });
}
async function makeThumb(src){return await compressDataURL(src,320,.62)}
async function optimizeExistingPhotos(){const keys=await allKeys();let stores=0,pics=0;for(const id of keys){const r=await getOne(id);if(!r||r.photoOptimizedV17)continue;if(Array.isArray(r.photos)&&r.photos.length){const arr=[];for(const p of r.photos){arr.push(await compressDataURL(p,1280,.72));pics++;await new Promise(q=>setTimeout(q,0))}r.photos=arr;r.thumbnail=await makeThumb(arr[0]);stores++}else if(Array.isArray(r.photos)&&r.photos[0]&&!r.thumbnail){r.thumbnail=await makeThumb(r.photos[0])}r.photoOptimizedV17=true;await put(r)}return{stores,pics}}

async function refresh(){restaurants=await loadAllLight();render()}function render(){const q=$('search').value.trim().toLowerCase(),genreFilter=$('genreFilter')?.value||'';let list=restaurants.filter(r=>[r.name,r.address,r.genre,r.note].join(' ').toLowerCase().includes(q));if(genreFilter)list=list.filter(r=>r.genre===genreFilter);
  if(currentFilter==='unvisited')list=list.filter(r=>(r.visitFrequency||'未訪問')==='未訪問');if(currentFilter==='favorite')list=list.filter(r=>r.favorite);if(currentFilter==='ranked')list=list.filter(r=>r.personalRanking).sort((a,b)=>a.personalRanking-b.personalRanking);
  // default star sort
  if(currentFilter!=='ranked'&&currentFilter!=='near')list.sort((a,b)=>(Number(b.rank)||0)-(Number(a.rank)||0)||(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));if(currentFilter==='near')list=list.filter(r=>coordsOf(r)&&currentLocation&&hav(currentLocation,coordsOf(r))<=5).sort((a,b)=>hav(currentLocation,coordsOf(a))-hav(currentLocation,coordsOf(b)));if($('countLabel'))$('countLabel').textContent=(q||genreFilter||currentFilter!=='all')?`表示：${list.length}件 / 全${restaurants.length}件`:`登録店舗：${restaurants.length}件`;$('list').innerHTML=list.map(r=>`<article class="card" data-id="${r.id}">${r.thumbnail?`<img class="thumb" src="${r.thumbnail}">`:'<div class="thumb placeholder">🍴</div>'}<div><h3>${esc(r.name)}</h3><div class="stars">${stars(r.rank)}</div><div class="meta">${esc(r.genre||'ジャンル未設定')}${r.price?' ・ '+esc(r.price):''}${dist(r)?' ・ '+dist(r):''}</div><div class="meta">${esc(r.address||'住所未設定')}</div><div class="badges">${r.favorite?'<span class="badge">♥ お気に入り</span>':''}<span class="badge">${esc(r.visitFrequency||'未訪問')}</span>${r.personalRanking?`<span class="badge">🏆 ${r.personalRanking}位</span>`:''}</div></div></article>`).join('');$('empty').classList.toggle('hidden',restaurants.length!==0);document.querySelectorAll('.card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id))}
function times(){const a=[];for(let h=5;h<=29;h++)for(const m of[0,30])a.push(`${String(h%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`);return a}function fill(id,vals){$(id).innerHTML=vals.map(v=>`<option>${v}</option>`).join('')}function locLabel(){$('locationLabel').textContent=currentEditLocation?`住所から登録：緯度 ${currentEditLocation.lat.toFixed(5)} / 経度 ${currentEditLocation.lon.toFixed(5)}`:'住所位置情報：未登録'}function renderPhotos(){$('photoPreview').innerHTML=editingPhotos.map((p,i)=>`<div class="photoWrap"><img src="${p}"><button type="button" class="photoDelete" data-i="${i}">×</button></div>`).join('');document.querySelectorAll('.photoDelete').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;editingPhotos.splice(i,1);editingCloudPaths.splice(i,1);renderPhotos()})}
function reset(r=null){for(const k of['name','address','phone','closedDays','note','tabelogUrl']){const el=$(k);if(el)el.value=r?.[k]||'';}$('restaurantId').value=r?.id||'';$('rank').value=r?.rank||3;$('visitFrequency').value=r?.visitFrequency||'未訪問';$('genre').value=r?.genre||'';$('price').value=r?.price||'';$('favorite').checked=!!r?.favorite;$('personalRanking').value=r?.personalRanking||'';$('lunchEnabled').checked=r?.hours?.lunch?.enabled??true;$('lunchOpen').value=r?.hours?.lunch?.open||'11:00';$('lunchClose').value=r?.hours?.lunch?.close||'14:30';$('dinnerEnabled').checked=r?.hours?.dinner?.enabled??true;$('dinnerOpen').value=r?.hours?.dinner?.open||'17:00';$('dinnerClose').value=r?.hours?.dinner?.close||'21:00';currentEditLocation=(Number.isFinite(Number(r?.geoLat))&&Number.isFinite(Number(r?.geoLon)))
  ? {lat:Number(r.geoLat),lon:Number(r.geoLon),addressSource:r?.geoAddress||(r?.address||'').trim()}
  : ((r?.location?.addressSource&&r.location.addressSource===(r?.address||'').trim())?r.location:null);editingPhotos=[...(r?.photos||[])];editingCloudPaths=[...(r?.cloudPhotoPaths||[])];while(editingCloudPaths.length<editingPhotos.length)editingCloudPaths.push(null);locLabel();renderPhotos();$('deleteRestaurantBtn').classList.toggle('hidden',!r);$('dialogTitle').textContent=r?'店舗編集':'店舗登録'}
function getLoc(){return new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude}),rej,{enableHighAccuracy:true,timeout:12000,maximumAge:30000}))}function fileURL(f){return new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.onerror=rej;rd.readAsDataURL(f)})}
function locationMatchesAddress(loc,address){return !!loc&&String(loc.addressSource||'').trim()===String(address||'').trim()&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lon))}

async function showDetail(id){const r=await getOne(id);if(!r)return;const photos=r.photos||[];const gallery=photos.length?`<div class="galleryWrap"><div class="galleryTrack" id="galleryTrack">${photos.map((p,i)=>`<button class="gallerySlide" type="button" data-i="${i}" aria-label="写真 ${i+1}"><img src="${p}" alt="店舗写真 ${i+1}"></button>`).join('')}</div><div class="galleryCounter" id="galleryCounter">1 / ${photos.length}</div></div>`:'';const maps=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address||r.name)}`;$('detail').innerHTML=`${gallery}<div class="detailBody"><h2>${esc(r.name)}</h2><div class="stars">${stars(r.rank)}</div><div class="detailInfo">${esc(r.genre||'')}${r.price?' ・ '+esc(r.price):''}<br>${esc(r.address||'')}<br>${r.phone?esc(r.phone)+'<br>':''}定休日：${esc(r.closedDays||'未設定')}<br>訪問：${esc(r.visitFrequency||'未訪問')}${r.personalRanking?`<br>自分ランキング：${r.personalRanking}位`:''}<br>昼：${r.hours?.lunch?.enabled?`${r.hours.lunch.open}〜${r.hours.lunch.close}`:'営業なし'}<br>夜：${r.hours?.dinner?.enabled?`${r.hours.dinner.open}〜${r.hours.dinner.close}`:'営業なし'}</div><div class="detailActions fourActions"><a href="${maps}" target="_blank">地図</a>${r.phone?`<a href="tel:${esc(r.phone)}">電話</a>`:'<button disabled>電話</button>'}${r.tabelogUrl?`<a href="${esc(r.tabelogUrl)}" target="_blank" rel="noopener">食べログ</a>`:'<button disabled>食べログ</button>'}<button id="editFromDetail">編集</button></div>${r.note?`<div class="noteBox">${esc(r.note)}</div>`:''}</div>`;$('detailDialog').showModal();if(photos.length){const track=$('galleryTrack'),counter=$('galleryCounter');const update=()=>{const w=track.clientWidth||1,idx=Math.max(0,Math.min(photos.length-1,Math.round(track.scrollLeft/w)));counter.textContent=`${idx+1} / ${photos.length}`};track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});document.querySelectorAll('.gallerySlide').forEach(btn=>btn.onclick=()=>openFullscreenGallery(photos,+btn.dataset.i))}$('editFromDetail').onclick=async()=>{
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
  const full=[];
  for(const r of restaurants){
    const x=await getOne(r.id);
    if(x){
      const y={...x};
      if(Array.isArray(y.photos)&&y.photos.length){
        const arr=[];
        for(const p of y.photos){try{arr.push(await cloudDataUrl(p))}catch{arr.push(p)}}
        y.photos=arr;y.thumbnail=arr[0]?await makeThumb(arr[0]):null;
      }
      delete y.cloudPhotoPaths;
      full.push(y);
    }
  }
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


let bulkGeoRunning=false;

async function bulkGeocodeMissing(){
  if(bulkGeoRunning)return;

  const targets=restaurants.filter(r=>{
    const address=(r.address||'').trim();
    return address && !coordsOf(r);
  });

  if(!targets.length){
    alert('住所が登録されている店舗は、すべて位置情報登録済みです。');
    return;
  }

  if(!confirm(`${targets.length}店舗の住所から位置情報を順番に取得します。\n成功した店舗は1件ずつ保存されます。\n開始しますか？`))return;

  bulkGeoRunning=true;
  const btn=$('bulkGeocodeBtn');
  if(btn)btn.disabled=true;

  let ok=0,ng=0;
  const failed=[];

  try{
    for(let i=0;i<targets.length;i++){
      const light=targets[i];
      const full=await getOne(light.id);
      if(!full){ng++;continue;}

      if($('bulkGeoStatus')){
        $('bulkGeoStatus').textContent=`位置登録中 ${i+1}/${targets.length}　成功 ${ok}件　失敗 ${ng}件\n${full.name}`;
      }

      try{
        const pos=await geocodeAddress(full.address);
        full.location=pos;
        full.geoLat=Number(pos.lat);
        full.geoLon=Number(pos.lon);
        full.geoAddress=(full.address||'').trim();
        full.updatedAt=Date.now();
        await put(full);
        if(cloudGroup){try{await cloudSaveRestaurant(full)}catch(e){console.warn('cloud bulk geo sync',e)}}
        ok++;
      }catch(err){
        ng++;
        failed.push(full.name);
        console.warn('bulk geocode failed',full.name,full.address,err);
      }

      // 画面を固めず、順番に処理。
      await new Promise(r=>setTimeout(r,500));
    }
  }finally{
    bulkGeoRunning=false;
    if(btn)btn.disabled=false;
    await refresh();

    const registered=restaurants.filter(r=>coordsOf(r)).length;
    const summary=`位置登録完了：成功 ${ok}件 / 失敗 ${ng}件\n位置登録済み ${registered} / ${restaurants.length}件`;
    if($('bulkGeoStatus'))$('bulkGeoStatus').textContent=summary;

    alert(summary+(failed.length?`\n\n取得できなかった店舗例：\n${failed.slice(0,8).join('\n')}`:''));
  }
}


// ===============================
// Supabase shared-cloud layer v2.0
// ===============================
let sb=null, cloudUser=null, cloudGroup=null, cloudChannel=null, cloudSyncTimer=null;

function cloudReady(){
  return !!(window.supabase && window.SUPABASE_CONFIG?.url && window.SUPABASE_CONFIG?.publishableKey);
}
function cloudSetProgress(t=''){if($('cloudProgress'))$('cloudProgress').textContent=t}
function cloudSetButton(){
  if(!$('cloudBtn'))return;
  $('cloudBtn').classList.toggle('connected',!!cloudGroup);
  $('cloudBtn').textContent=cloudGroup?'共有中':'共有';
}
function cloudRow(r){
  return {
    id:r.id, group_id:cloudGroup.id, name:r.name||'', address:r.address||'', phone:r.phone||'',
    closed_days:r.closedDays||'', tabelog_url:r.tabelogUrl||'', rank:Number(r.rank)||3,
    visit_frequency:r.visitFrequency||'未訪問', genre:r.genre||'', price:r.price||'', note:r.note||'',
    favorite:!!r.favorite, personal_ranking:r.personalRanking||null,
    geo_lat:Number.isFinite(Number(r.geoLat))?Number(r.geoLat):null,
    geo_lon:Number.isFinite(Number(r.geoLon))?Number(r.geoLon):null,
    geo_address:r.geoAddress||'', location_data:r.location||null,
    hours:r.hours||{}, updated_at_ms:Number(r.updatedAt)||Date.now()
  };
}
function localRow(r){
  return {
    id:r.id,name:r.name||'',address:r.address||'',phone:r.phone||'',closedDays:r.closed_days||'',
    tabelogUrl:r.tabelog_url||'',rank:Number(r.rank)||3,visitFrequency:r.visit_frequency||'未訪問',
    genre:r.genre||'',price:r.price||'',note:r.note||'',favorite:!!r.favorite,
    personalRanking:r.personal_ranking||null,geoLat:r.geo_lat,geoLon:r.geo_lon,
    geoAddress:r.geo_address||'',location:r.location_data||null,hours:r.hours||{},
    updatedAt:Number(r.updated_at_ms)||Date.now(),photoOptimizedV17:true
  };
}
async function cloudDataUrl(v){
  if(!v || !/^https?:/i.test(v))return v;
  const resp=await fetch(v);
  if(!resp.ok)throw new Error('写真バックアップ取得失敗');
  return await fileURL(await resp.blob());
}
async function cloudInit(){
  if(!cloudReady())return;
  sb=window.supabase.createClient(window.SUPABASE_CONFIG.url,window.SUPABASE_CONFIG.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const {data}=await sb.auth.getSession();
  cloudUser=data?.session?.user||null;
  await cloudLoadState();
  sb.auth.onAuthStateChange((_event,session)=>{
    setTimeout(async()=>{cloudUser=session?.user||null;await cloudLoadState()},0);
  });
}
async function cloudLoadState(){
  cloudGroup=null;
  if(cloudUser){
    const {data,error}=await sb.from('gourmet_groups').select('id,name,share_code,owner_id').limit(1);
    if(!error && data?.length)cloudGroup=data[0];
  }
  cloudRenderAccount();
  cloudSetButton();
  if(cloudGroup){cloudSubscribe();}
}
function cloudRenderAccount(){
  if(!$('cloudSignedOut'))return;
  $('cloudSignedOut').classList.toggle('hidden',!!cloudUser);
  $('cloudSignedIn').classList.toggle('hidden',!cloudUser);
  if(!cloudUser)return;
  $('cloudUserEmail').textContent=cloudUser.email||'';
  $('cloudNoGroup').classList.toggle('hidden',!!cloudGroup);
  $('cloudHasGroup').classList.toggle('hidden',!cloudGroup);
  if(cloudGroup){
    $('cloudGroupName').textContent=cloudGroup.name||'My Gourmet Guide';
    $('cloudShareCode').textContent=cloudGroup.share_code||'';
  }
}
async function cloudSignUp(){
  const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;
  if(!email||password.length<6)return alert('メールアドレスと6文字以上のパスワードを入力してください。');
  cloudSetProgress('新規登録しています…');
  const {data,error}=await sb.auth.signUp({email,password});
  cloudSetProgress('');
  if(error)return alert(error.message);
  if(!data.session)alert('新規登録しました。確認メールが届いた場合は、メール内のリンクを開いてからログインしてください。');
  else alert('新規登録・ログインしました。');
}
async function cloudLogin(){
  const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;
  if(!email||!password)return alert('メールアドレスとパスワードを入力してください。');
  cloudSetProgress('ログインしています…');
  const {error}=await sb.auth.signInWithPassword({email,password});
  cloudSetProgress('');
  if(error)alert('ログインできませんでした。\n'+error.message);
}
async function cloudLogout(){
  if(cloudChannel){await sb.removeChannel(cloudChannel);cloudChannel=null}
  await sb.auth.signOut();cloudUser=null;cloudGroup=null;cloudRenderAccount();cloudSetButton();
}
async function cloudCreateGroup(){
  cloudSetProgress('共有グループを作成しています…');
  const {data,error}=await sb.rpc('create_gourmet_group',{group_name:'My Gourmet Guide'});
  if(error){cloudSetProgress('');return alert('共有グループを作成できません。\n'+error.message)}
  await cloudLoadState();cloudSetProgress('');
  alert('共有グループを作成しました。\n次に「このiPhoneのデータをクラウドへ移行」を押してください。');
}
async function cloudJoinGroup(){
  const code=$('cloudJoinCode').value.trim().toUpperCase();
  if(!code)return alert('共有コードを入力してください。');
  cloudSetProgress('共有グループに参加しています…');
  const {error}=await sb.rpc('join_gourmet_group',{join_code:code});
  if(error){cloudSetProgress('');return alert('参加できませんでした。\n'+error.message)}
  await cloudLoadState();cloudSetProgress('');
  await cloudPullAll();
  alert('共有グループに参加しました。最新データを取得しました。');
}
async function cloudSignedUrls(paths){
  if(!paths.length)return [];
  const {data,error}=await sb.storage.from('gourmet-photos').createSignedUrls(paths,60*60*24*7);
  if(error)throw error;
  return (data||[]).map(x=>x.signedUrl||'');
}
async function cloudPullAll(silent=false){
  if(!cloudGroup)return;
  cloudSetProgress('クラウドから店舗データを取得しています…');
  const {data:rows,error}=await sb.from('restaurants').select('*').eq('group_id',cloudGroup.id);
  if(error){cloudSetProgress('');if(!silent)alert(error.message);return}
  const {data:photos,error:pe}=await sb.from('restaurant_photos').select('*').eq('group_id',cloudGroup.id).order('sort_order');
  if(pe){cloudSetProgress('');if(!silent)alert(pe.message);return}
  const by={};
  for(const p of photos||[])(by[p.restaurant_id]??=[]).push(p);
  const allPaths=(photos||[]).map(p=>p.storage_path);
  let urlMap={};
  if(allPaths.length){
    try{
      const urls=await cloudSignedUrls(allPaths);
      allPaths.forEach((p,i)=>urlMap[p]=urls[i]);
    }catch(e){console.warn('signed url error',e)}
  }
  let n=0;
  for(const row of rows||[]){
    const r=localRow(row),plist=by[row.id]||[];
    r.cloudPhotoPaths=plist.map(x=>x.storage_path);
    r.photos=plist.map(x=>urlMap[x.storage_path]).filter(Boolean);
    r.thumbnail=r.photos[0]||null;
    await put(r);n++;
  }
  await refresh();
  cloudSetProgress(`クラウドから ${n}店舗を取得しました。`);
}
async function cloudUploadBlob(data,path){
  const resp=await fetch(data);
  if(!resp.ok)throw new Error('写真を読み込めませんでした。');
  const blob=await resp.blob();
  const {error}=await sb.storage.from('gourmet-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});
  if(error)throw error;
}
async function cloudSaveRestaurant(r){
  if(!cloudGroup)return r;
  const {error}=await sb.from('restaurants').upsert(cloudRow(r),{onConflict:'id'});
  if(error)throw error;

  const oldPaths=Array.isArray(r.cloudPhotoPaths)?r.cloudPhotoPaths:[];
  const photos=Array.isArray(r.photos)?r.photos:[];
  const paths=[];
  for(let i=0;i<photos.length;i++){
    let path=oldPaths[i]||null;
    if(!path){
      path=`${cloudGroup.id}/${r.id}/${crypto.randomUUID()}.jpg`;
      await cloudUploadBlob(photos[i],path);
    }
    paths.push(path);
  }
  const removed=oldPaths.filter(p=>p&&!paths.includes(p));
  if(removed.length)await sb.storage.from('gourmet-photos').remove(removed);

  const {error:de}=await sb.from('restaurant_photos').delete().eq('restaurant_id',r.id).eq('group_id',cloudGroup.id);
  if(de)throw de;
  if(paths.length){
    const records=paths.map((p,i)=>({restaurant_id:r.id,group_id:cloudGroup.id,storage_path:p,sort_order:i}));
    const {error:ie}=await sb.from('restaurant_photos').insert(records);
    if(ie)throw ie;
  }
  r.cloudPhotoPaths=paths;
  await put(r);
  return r;
}
async function cloudDeleteRestaurant(id){
  if(!cloudGroup)return;
  const {data:p}=await sb.from('restaurant_photos').select('storage_path').eq('restaurant_id',id).eq('group_id',cloudGroup.id);
  const paths=(p||[]).map(x=>x.storage_path);
  if(paths.length)await sb.storage.from('gourmet-photos').remove(paths);
  const {error}=await sb.from('restaurants').delete().eq('id',id).eq('group_id',cloudGroup.id);
  if(error)throw error;
}
async function cloudUploadAll(){
  if(!cloudGroup)return alert('先に共有グループを作成してください。');
  if(!restaurants.length)return alert('移行する店舗がありません。');
  if(!confirm(`${restaurants.length}店舗をクラウドへコピーします。\n端末内の元データは削除しません。\n写真も順番にアップロードします。開始しますか？`))return;
  let ok=0,ng=0;
  for(let i=0;i<restaurants.length;i++){
    const r=await getOne(restaurants[i].id);
    if(!r)continue;
    cloudSetProgress(`クラウド移行中 ${i+1}/${restaurants.length}\n成功 ${ok}件 / 失敗 ${ng}件\n${r.name}`);
    try{await cloudSaveRestaurant(r);ok++}catch(e){console.error('cloud migrate',r.name,e);ng++}
    await yieldUI();
  }
  cloudSetProgress(`移行完了：成功 ${ok}件 / 失敗 ${ng}件`);
  if(!ng)await cloudPullAll(true);
  alert(`クラウド移行が完了しました。\n成功 ${ok}件 / 失敗 ${ng}件`);
}
function cloudSubscribe(){
  if(!sb||!cloudGroup)return;
  if(cloudChannel)sb.removeChannel(cloudChannel);
  const schedule=()=>{clearTimeout(cloudSyncTimer);cloudSyncTimer=setTimeout(()=>cloudPullAll(true),1200)};
  cloudChannel=sb.channel('gourmet-'+cloudGroup.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'restaurants',filter:`group_id=eq.${cloudGroup.id}`},schedule)
    .on('postgres_changes',{event:'*',schema:'public',table:'restaurant_photos',filter:`group_id=eq.${cloudGroup.id}`},schedule)
    .subscribe();
}

document.addEventListener('DOMContentLoaded',async()=>{for(const id of['lunchOpen','lunchClose','dinnerOpen','dinnerClose'])fill(id,times());$('personalRanking').innerHTML='<option value="">なし</option>'+Array.from({length:50},(_,i)=>`<option value="${i+1}">${i+1}位</option>`).join('');await openDB();await migrateGeoFields();if($('status'))$('status').textContent='初回のみ：写真データを軽量化しています…';const mig=await optimizeExistingPhotos();await refresh();if($('status'))$('status').textContent='';if(mig.stores)setTimeout(()=>alert(`${mig.stores}店舗・${mig.pics}枚の写真を軽量化しました。\n店舗データはそのままです。`),300);

await cloudInit();
if($('cloudBtn'))$('cloudBtn').onclick=()=>{cloudRenderAccount();$('cloudDialog').showModal()};
if($('closeCloudBtn'))$('closeCloudBtn').onclick=()=>$('cloudDialog').close();
if($('cloudLoginBtn'))$('cloudLoginBtn').onclick=cloudLogin;
if($('cloudSignupBtn'))$('cloudSignupBtn').onclick=cloudSignUp;
if($('cloudLogoutBtn'))$('cloudLogoutBtn').onclick=cloudLogout;
if($('cloudCreateGroupBtn'))$('cloudCreateGroupBtn').onclick=cloudCreateGroup;
if($('cloudJoinBtn'))$('cloudJoinBtn').onclick=cloudJoinGroup;
if($('cloudUploadAllBtn'))$('cloudUploadAllBtn').onclick=cloudUploadAll;
if($('cloudDownloadBtn'))$('cloudDownloadBtn').onclick=()=>cloudPullAll(false);
if($('copyShareCodeBtn'))$('copyShareCodeBtn').onclick=async()=>{
  const code=cloudGroup?.share_code||'';
  if(!code)return;
  try{await navigator.clipboard.writeText(code);alert('共有コードをコピーしました。')}
  catch{prompt('共有コードをコピーしてください。',code)}
};


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
if($('bulkGeocodeBtn'))$('bulkGeocodeBtn').onclick=()=>bulkGeocodeMissing();
$('restoreFile').onchange=async e=>{const f=e.target.files?.[0];if(f)await restoreBackupFile(f);e.target.value='';};$('addBtn').onclick=()=>{reset();$('editorDialog').showModal()};$('cancelBtn').onclick=()=>$('editorDialog').close();$('closeDetailBtn').onclick=()=>$('detailDialog').close();$('search').oninput=render;if($('genreFilter'))$('genreFilter').onchange=render;document.querySelectorAll('.chip').forEach(b=>b.onclick=async()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;if(currentFilter==='near'&&!currentLocation){try{currentLocation=await getLoc();}catch{$('status').textContent='現在地を取得できませんでした。位置情報の許可を確認してください。';render();return;}}if(currentFilter==='near'){const located=restaurants.filter(r=>coordsOf(r)).length;$('status').textContent=`現在地から5km以内を表示。位置登録済み ${located} / ${restaurants.length}件`;}else $('status').textContent='';render()});
if($('useLocationBtn'))$('useLocationBtn').onclick=async()=>{
  const address=$('address')?.value.trim()||'';
  if(!address){alert('先に店舗住所を入力してください。\n現在地を登録する場合も、店舗住所を入力してください。');return;}
  try{
    photoBusy(true,'現在地を取得しています…');
    const pos=await getLoc();
    currentEditLocation={
      lat:Number(pos.lat),lon:Number(pos.lon),addressSource:address,
      geocodeProvider:'device-current-location',normalizedAddress:address,geocodedAt:Date.now()
    };
    locLabel();
    alert('現在地をこの店舗の位置として登録しました。\n通常は「住所から位置を取得」をおすすめします。');
  }catch(err){
    alert('現在地を取得できませんでした。Safariの位置情報許可を確認してください。');
  }finally{photoBusy(false)}
};

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
        if(cloudGroup){try{await cloudSaveRestaurant(fresh)}catch(e){console.warn('cloud geocode sync',e)}}
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
     editingPhotos.push(await compressDataURL(raw,1280,.72));editingCloudPaths.push(null);ok++;
   }catch(err){console.warn('cloud photo import failed',err);ng++}
   await yieldUI();
 }
 photoBusy(false);renderPhotos();
 if(ng)alert(`${ok}枚を読み込みました。\n${ng}枚はクラウドから取得できませんでした。\n取得できない写真は一度iPhoneの「写真」へ保存してから選択してください。`);
};
$('editorForm').onsubmit=async e=>{
  e.preventDefault();
  const saveBtn=$('saveBtn');
  if(saveBtn?.disabled)return;
  if(saveBtn)saveBtn.disabled=true;

  try{
    const id=$('restaurantId').value||crypto.randomUUID();
    const previous=await getOne(id);
    const address=$('address').value.trim();

    if(address&&!locationMatchesAddress(currentEditLocation,address)){
      try{
        photoBusy(true,'保存住所から位置を取得しています…');
        currentEditLocation=await geocodeAddress(address);
        locLabel();
      }catch(err){
        photoBusy(false);
        const msg=err?.message||'住所から位置情報を取得できませんでした。';
        if(!confirm(`${msg}\n\n位置情報なしで店舗を保存しますか？\n「近く」検索には表示されません。`))return;
        currentEditLocation=null;
        locLabel();
      }finally{photoBusy(false)}
    }

    const firstPhoto=editingPhotos[0]||null;
    let thumbnail=null;
    if(firstPhoto){
      // Existing cloud photo: keep/use its URL instead of drawing it to canvas.
      // New local photo (data URL): make a lightweight thumbnail.
      if(typeof firstPhoto==='string'&&/^https?:\/\//i.test(firstPhoto)){
        thumbnail=firstPhoto;
      }else{
        thumbnail=await makeThumb(firstPhoto);
      }
    }

    const obj={
      id,name:$('name').value.trim(),address,phone:$('phone').value.trim(),
      closedDays:$('closedDays').value.trim(),tabelogUrl:$('tabelogUrl').value.trim(),
      rank:+$('rank').value,visitFrequency:$('visitFrequency').value,
      genre:$('genre').value,price:$('price').value,note:$('note').value.trim(),
      favorite:$('favorite').checked,
      personalRanking:$('personalRanking').value?+$('personalRanking').value:null,
      location:locationMatchesAddress(currentEditLocation,address)?currentEditLocation:null,
      geoLat:locationMatchesAddress(currentEditLocation,address)?Number(currentEditLocation.lat):null,
      geoLon:locationMatchesAddress(currentEditLocation,address)?Number(currentEditLocation.lon):null,
      geoAddress:locationMatchesAddress(currentEditLocation,address)?address:'',
      photos:[...editingPhotos],cloudPhotoPaths:[...editingCloudPaths],
      thumbnail,
      photoOptimizedV17:true,
      hours:{
        lunch:{enabled:$('lunchEnabled').checked,open:$('lunchOpen').value,close:$('lunchClose').value},
        dinner:{enabled:$('dinnerEnabled').checked,open:$('dinnerOpen').value,close:$('dinnerClose').value}
      },
      updatedAt:Date.now()
    };

    // Save to this iPhone first. Even if cloud sync fails, the edit survives locally.
    photoBusy(true,'このiPhoneに保存しています…');
    await put(obj);

    if(cloudGroup){
      try{
        photoBusy(true,'クラウドへ保存しています…');
        await cloudSaveRestaurant(obj);
      }catch(err){
        console.error('cloud save error',err);
        alert(`このiPhoneには保存できました。\nクラウド保存だけ失敗しました。\n\n${err?.message||'通信状態を確認してください。'}`);
      }
    }

    $('editorDialog').close();
    await refresh();
  }catch(err){
    console.error('restaurant save error',err);
    alert(`保存処理でエラーが発生しました。\n${err?.message||'もう一度お試しください。'}`);
  }finally{
    photoBusy(false);
    if(saveBtn)saveBtn.disabled=false;
  }
};
$('deleteRestaurantBtn').onclick=async()=>{
  const id=$('restaurantId').value;
  if(id&&confirm('この店舗を削除しますか？写真も削除されます。')){
    if(cloudGroup){try{await cloudDeleteRestaurant(id)}catch(e){console.error(e);return alert('クラウドから削除できませんでした。通信状態を確認してください。')}}
    await del(id);$('editorDialog').close();await refresh();
  }
};if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js?v=2111').then(r=>r.update()).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!sessionStorage.getItem('gg-sw-reloaded')){sessionStorage.setItem('gg-sw-reloaded','1');location.reload();}})}});
