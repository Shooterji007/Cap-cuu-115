const $ = (id) => document.getElementById(id);
let userPosition = null;
let map, userMarker, resultLayer;
$('year').textContent = new Date().getFullYear();

function initMap(){
  map = L.map('map').setView([16.2,107.8],5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  resultLayer = L.layerGroup().addTo(map);
}
initMap();

function setStatus(message, error=false){$('status').textContent=message;$('status').classList.toggle('error',error)}
function distanceKm(a,b){const R=6371,rad=x=>x*Math.PI/180;const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function safeText(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function getName(tags){return tags.name||tags['name:vi']||tags['official_name']||'Cơ sở y tế chưa có tên'}
function getPhone(tags){return tags.phone||tags['contact:phone']||tags['mobile']||tags['contact:mobile']||''}
function getAddress(t){const parts=[t['addr:housenumber'],t['addr:street'],t['addr:suburb'],t['addr:district'],t['addr:city']||t['addr:province']].filter(Boolean);return parts.join(', ')||'Chưa có địa chỉ chi tiết trên bản đồ'}
function classify(t){if(t.amenity==='hospital'||t.healthcare==='hospital')return 'Bệnh viện';if(t.amenity==='clinic'||t.healthcare==='clinic')return 'Phòng khám';if(t.amenity==='doctors'||t.healthcare==='doctor')return 'Phòng khám/bác sĩ';if(t.amenity==='health_centre'||t.healthcare==='centre')return 'Trung tâm y tế';return 'Cơ sở y tế'}
function queryFor(lat,lon,r){return `[out:json][timeout:25];(node(around:${r},${lat},${lon})[amenity~"^(hospital|clinic|doctors|health_centre)$"];way(around:${r},${lat},${lon})[amenity~"^(hospital|clinic|doctors|health_centre)$"];relation(around:${r},${lat},${lon})[amenity~"^(hospital|clinic|doctors|health_centre)$"];node(around:${r},${lat},${lon})[healthcare~"^(hospital|clinic|doctor|centre)$"];way(around:${r},${lat},${lon})[healthcare~"^(hospital|clinic|doctor|centre)$"];);out center tags;`}
async function fetchPlaces(lat,lon,radius){
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  let lastError;
  for(const endpoint of endpoints){try{const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(queryFor(lat,lon,radius*1000))});if(!res.ok)throw new Error('Máy chủ bản đồ đang bận ('+res.status+').');const data=await res.json();return (data.elements||[]).map(el=>{const tags=el.tags||{};const p=el.lat?{lat:el.lat,lon:el.lon}:el.center?{lat:el.center.lat,lon:el.center.lon}:null;if(!p)return null;return {...p,tags,id:el.type+'/'+el.id}}).filter(Boolean)}catch(e){lastError=e}}
  throw lastError||new Error('Không truy cập được dữ liệu bản đồ.');
}
function dedupeAndSort(items,origin){const seen=new Set();return items.map(p=>({...p,distance:distanceKm(origin,{lat:p.lat,lon:p.lon})})).filter(p=>{const key=(p.tags.name||'')+'|'+p.lat.toFixed(5)+'|'+p.lon.toFixed(5);if(seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>a.distance-b.distance)}
function renderPlaces(places,expandedRadius){
  $('results').innerHTML='';resultLayer.clearLayers();
  if(userMarker)userMarker.addTo(resultLayer);
  $('resultCount').textContent=places.length+' kết quả';
  if(!places.length){setStatus('Không tìm thấy cơ sở y tế có dữ liệu bản đồ trong phạm vi đã thử. Hãy gọi 115 nếu cần trợ giúp khẩn cấp.');return}
  setStatus(expandedRadius>5?`Không có kết quả trong 5 km; đã tự mở rộng tìm kiếm đến ${expandedRadius} km. Kết quả được xếp từ gần đến xa.`:'Đã tìm thấy cơ sở trong phạm vi 5 km. Kết quả xếp từ gần đến xa.');
  const bounds=[];if(userPosition)bounds.push([userPosition.lat,userPosition.lon]);
  places.forEach((p,i)=>{
    const t=p.tags,name=getName(t),phone=getPhone(t),address=getAddress(t),type=classify(t),dist=p.distance<1?Math.round(p.distance*1000)+' m':p.distance.toFixed(2)+' km';
    const phoneHref=phone?'tel:'+phone.replace(/[^+\d]/g,''):'';
    const gmaps=`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
    const card=document.createElement('article');card.className='place';
    card.innerHTML=`<div class="place-top"><span class="number">${i+1}</span><div style="min-width:0;flex:1"><h3>${safeText(name)}</h3><div class="meta">${safeText(type)} · ${safeText(address)}</div></div><span class="distance">${dist}</span></div><div class="actions">${phone?`<a class="action phone" href="${safeText(phoneHref)}">☎ Gọi ${safeText(phone)}</a>`:'<span class="action">Chưa có số điện thoại</span>'}<a class="action" target="_blank" rel="noopener" href="${gmaps}">↗ Chỉ đường</a></div>${!phone?'<div class="missing">Hãy kiểm tra số điện thoại trước khi di chuyển.</div>':''}`;
    $('results').appendChild(card);
    const marker=L.marker([p.lat,p.lon]).bindPopup(`<b>${safeText(name)}</b><br>${safeText(type)}<br>${safeText(dist)}`);marker.addTo(resultLayer);bounds.push([p.lat,p.lon]);
  });
  if(bounds.length)map.fitBounds(bounds,{padding:[25,25],maxZoom:14});
}
async function search(){
  if(!userPosition){setStatus('Bạn cần bật GPS hoặc cho phép trình duyệt truy cập vị trí trước.',true);return}
  const requested=Number($('radiusSelect').value);$('searchBtn').disabled=true;$('locateBtn').disabled=true;$('results').innerHTML='';$('resultCount').textContent='Đang tìm…';resultLayer.clearLayers();if(userMarker)userMarker.addTo(resultLayer);
  try{
    let places=[],usedRadius=requested;
    const radii=requested===5?[5,10,20,50]:[requested];
    for(const r of radii){setStatus(`Đang tìm cơ sở y tế trong phạm vi ${r} km…`);const raw=await fetchPlaces(userPosition.lat,userPosition.lon,r);places=dedupeAndSort(raw,userPosition).filter(p=>p.distance<r);usedRadius=r;if(places.length)break;}
    renderPlaces(places,usedRadius);
  }catch(e){setStatus((e.message||'Có lỗi khi tìm kiếm.')+' Vui lòng thử lại sau hoặc mở Google Maps.',true);$('resultCount').textContent='Chưa tải được dữ liệu'}
  finally{$('searchBtn').disabled=false;$('locateBtn').disabled=false}
}
function locate(){if(!navigator.geolocation){setStatus('Thiết bị hoặc trình duyệt không hỗ trợ GPS.',true);return} $('locateBtn').disabled=true;setStatus('Đang xin quyền truy cập vị trí…');navigator.geolocation.getCurrentPosition(pos=>{userPosition={lat:pos.coords.latitude,lon:pos.coords.longitude};$('locationText').textContent=`${userPosition.lat.toFixed(5)}, ${userPosition.lon.toFixed(5)} · Độ chính xác khoảng ${Math.round(pos.coords.accuracy)} m`;map.setView([userPosition.lat,userPosition.lon],14);if(userMarker)resultLayer.removeLayer(userMarker);userMarker=L.circleMarker([userPosition.lat,userPosition.lon],{radius:9,color:'#1d4ed8',fillColor:'#60a5fa',fillOpacity:1,weight:3}).bindPopup('Vị trí của bạn');userMarker.addTo(resultLayer);$('locateBtn').disabled=false;search()},err=>{$('locateBtn').disabled=false;const msg=err.code===1?'Bạn chưa cấp quyền vị trí. Hãy bật Location cho Safari/trình duyệt.':err.code===2?'Không xác định được vị trí GPS.':'Yêu cầu GPS quá thời gian.';setStatus(msg,true)},{enableHighAccuracy:true,timeout:15000,maximumAge:30000})}
$('locateBtn').addEventListener('click',locate);$('searchBtn').addEventListener('click',search);$('radiusSelect').addEventListener('change',()=>{if(userPosition)search()});
if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
