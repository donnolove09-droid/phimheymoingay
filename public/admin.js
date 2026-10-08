const API='/api';
const TOKEN_KEY='phimhay_admin_token';
let token=localStorage.getItem(TOKEN_KEY)||'';
let movies=[];
let editingId=null;
const $=id=>document.getElementById(id);

function showLogin(){$('loginGate').classList.remove('hidden');$('adminApp').classList.add('hidden')}
function showApp(){$('loginGate').classList.add('hidden');$('adminApp').classList.remove('hidden');initAdmin()}

async function login(){
const username=$('username').value.trim();
const password=$('password').value;
$('loginError').textContent='';
$('loginBtn').disabled=true;
$('loginBtn').textContent='Đang đăng nhập...';
try{
const res=await fetch(`${API}/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
const data=await res.json();
if(!res.ok)throw new Error(data.error||'Đăng nhập thất bại');
token=data.token;
localStorage.setItem(TOKEN_KEY,token);
showApp();
}catch(e){$('loginError').textContent=e.message}
finally{$('loginBtn').disabled=false;$('loginBtn').textContent='Đăng nhập'}
}

async function apiFetch(url,opts={}){
const res=await fetch(url,{...opts,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})}});
if(res.status===401){localStorage.removeItem(TOKEN_KEY);location.reload();throw new Error('Hết phiên')}
return res;
}

document.querySelectorAll('.tab').forEach(tab=>{
tab.addEventListener('click',e=>{e.preventDefault();switchView(tab.dataset.view)});
});

function switchView(view){
document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
if(view==='movies')loadMovies();
if(view==='keys')loadKeyStats();
if(view==='orders')loadOrders();
if(view==='settings')loadSettings();
}

async function loadMovies(){
try{const res=await apiFetch(`${API}/custom/admin/all`);movies=await res.json();renderTable()}
catch(e){console.error(e)}
}

function renderTable(filter=''){
const tbody=$('moviesTable');
if(!tbody)return;
const list=filter?movies.filter(m=>m.title.toLowerCase().includes(filter.toLowerCase())):movies;
if(!list.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#9a9aa3;padding:40px">Chưa có phim</td></tr>';return}
tbody.innerHTML=list.map(m=>`<tr><td><img src="${m.poster||'https://via.placeholder.com/44x64/1c1c20/666'}"></td><td>${m.title}</td><td>${m.year||'—'}</td><td>${m.isSeries?`Bộ (${m.episodes?.length||0} tập)`:'Lẻ'}</td><td>${m.views||0}</td><td><button class="btn-mini btn-edit" onclick="editMovie('${m._id}')">Sửa</button><button class="btn-mini btn-del" onclick="deleteMovie('${m._id}')">Xóa</button></td></tr>`).join('');
}

if($('adminSearch'))$('adminSearch').addEventListener('input',e=>renderTable(e.target.value));

if($('movieForm'))$('movieForm').addEventListener('submit',async e=>{
e.preventDefault();
const payload={title:$('fTitle').value.trim(),slug:$('fSlug').value.trim(),year:Number($('fYear').value)||undefined,country:$('fCountry').value.trim(),genres:$('fGenres').value.split(',').map(s=>s.trim()).filter(Boolean),quality:$('fQuality').value,language:$('fLanguage').value,isSeries:$('fIsSeries').value==='true',poster:$('fPoster').value.trim(),backdrop:$('fBackdrop').value.trim(),description:$('fDescription').value.trim(),videoType:$('fVideoType').value,videoUrl:$('fVideoUrl').value.trim(),episodes:collectEpisodes()};
try{
const url=editingId?`${API}/custom/admin/${editingId}`:`${API}/custom/admin`;
const method=editingId?'PUT':'POST';
const res=await apiFetch(url,{method,body:JSON.stringify(payload)});
if(!res.ok){const err=await res.json();throw new Error(err.error||'Lỗi lưu')}
alert(editingId?'Cập nhật thành công':'Thêm phim thành công');
resetForm();
switchView('movies');
}catch(e){alert(e.message)}
});

function collectEpisodes(){
const rows=document.querySelectorAll('.episode-row');const episodes=[];
rows.forEach(row=>{
const name=row.querySelector('.ep-name').value.trim();
const embed=row.querySelector('.ep-embed').value.trim();
const m3u8=row.querySelector('.ep-m3u8').value.trim();
if(name||embed||m3u8)episodes.push({name,embed,m3u8,slug:name.toLowerCase().replace(/\s+/g,'-')});
});
return episodes;
}

if($('addEpisode'))$('addEpisode').addEventListener('click',()=>addEpisodeRow());

function addEpisodeRow(data={}){
const editor=$('episodesEditor');
const row=document.createElement('div');
row.className='episode-row';
row.innerHTML=`<input class="ep-name" placeholder="Tên tập" value="${data.name||''}"><input class="ep-m3u8" placeholder="Link m3u8" value="${data.m3u8||''}"><input class="ep-embed" placeholder="Link embed" value="${data.embed||''}"><button type="button" class="remove-ep">&times;</button>`;
row.querySelector('.remove-ep').onclick=()=>row.remove();
editor.appendChild(row);
}

function resetForm(){
editingId=null;
if($('movieForm'))$('movieForm').reset();
if($('editId'))$('editId').value='';
if($('episodesEditor'))$('episodesEditor').innerHTML='';
if($('formTitle'))$('formTitle').textContent='Thêm phim mới';
}

if($('resetForm'))$('resetForm').addEventListener('click',resetForm);
if($('cancelEdit'))$('cancelEdit').addEventListener('click',()=>{resetForm();switchView('movies')});

function editMovie(id){
const m=movies.find(x=>x._id===id);if(!m)return;
editingId=id;$('formTitle').textContent='Chỉnh sửa phim';
$('fTitle').value=m.title||'';$('fSlug').value=m.slug||'';$('fYear').value=m.year||'';$('fCountry').value=m.country||'';$('fGenres').value=(m.genres||[]).join(', ');$('fQuality').value=m.quality||'HD';$('fLanguage').value=m.language||'Vietsub';$('fIsSeries').value=String(m.isSeries||false);$('fPoster').value=m.poster||'';$('fBackdrop').value=m.backdrop||'';$('fDescription').value=m.description||'';$('fVideoType').value=m.videoType||'iframe';$('fVideoUrl').value=m.videoUrl||'';
$('episodesEditor').innerHTML='';(m.episodes||[]).forEach(ep=>addEpisodeRow(ep));
switchView('add');
}

async function deleteMovie(id){
if(!confirm('Xóa phim này?'))return;
try{const res=await apiFetch(`${API}/custom/admin/${id}`,{method:'DELETE'});if(!res.ok)throw new Error('Lỗi xóa');loadMovies()}catch(e){alert(e.message)}
}

async function loadKeyStats(){
try{
const[stats,used]=await Promise.all([apiFetch(`${API}/admin/keys/stats`).then(r=>r.json()),apiFetch(`${API}/admin/keys/used`).then(r=>r.json())]);
const ks=$('keyStats');
if(ks)ks.innerHTML=`<div class="stat-card"><div class="label">Tổng</div><div class="value">${stats.total}</div></div><div class="stat-card"><div class="label">Chưa dùng</div><div class="value">${stats.unused}</div></div><div class="stat-card"><div class="label">Đã dùng</div><div class="value">${stats.used}</div></div><div class="stat-card"><div class="label">Đang active</div><div class="value">${stats.active}</div></div>`;
const tb=$('usedKeysTable');
if(tb){
if(!used.length){tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:#9a9aa3;padding:20px">Chưa có key dùng</td></tr>'}
else{tb.innerHTML=used.map(k=>`<tr><td style="font-family:monospace;font-size:12px">${k.key}</td><td>${k.usedAt?new Date(k.usedAt).toLocaleString('vi-VN'):'—'}</td><td>${k.expiresAt?new Date(k.expiresAt).toLocaleString('vi-VN'):'—'}</td><td style="font-size:12px;color:#9a9aa3">${k.usedBy?.ip||'—'}</td></tr>`).join('')}
}
}catch(e){console.error(e)}
}

if($('refreshKeys'))$('refreshKeys').addEventListener('click',loadKeyStats);
if($('resetKeyBtn'))$('resetKeyBtn').addEventListener('click',async()=>{
const key=$('keyManageInput').value.trim();if(!key)return;
try{const res=await apiFetch(`${API}/admin/keys/reset`,{method:'POST',body:JSON.stringify({key})});const data=await res.json();if(!res.ok)throw new Error(data.error);$('keyManageMsg').textContent=`Đã reset ${data.key}`;$('keyManageMsg').className='setting-msg ok';loadKeyStats()}catch(e){$('keyManageMsg').textContent=e.message;$('keyManageMsg').className='setting-msg err'}
});
if($('revokeKeyBtn'))$('revokeKeyBtn').addEventListener('click',async()=>{
const key=$('keyManageInput').value.trim();if(!key)return;
try{const res=await apiFetch(`${API}/admin/keys/revoke`,{method:'POST',body:JSON.stringify({key})});const data=await res.json();if(!res.ok)throw new Error(data.error);$('keyManageMsg').textContent=`Đã thu hồi ${data.key}`;$('keyManageMsg').className='setting-msg ok';loadKeyStats()}catch(e){$('keyManageMsg').textContent=e.message;$('keyManageMsg').className='setting-msg err'}
});

async function loadOrders(){
try{const res=await apiFetch(`${API}/admin/orders`);const orders=await res.json();const tb=$('ordersTable');if(!tb)return;
if(!orders.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:#9a9aa3;padding:20px">Không có đơn</td></tr>';return}
tb.innerHTML=orders.map(o=>`<tr><td style="font-family:monospace;font-size:12px">${o.orderCode}</td><td>${o.telegramUsername?'@'+o.telegramUsername:o.chatId||'—'}</td><td>${o.plan}</td><td>${o.price.toLocaleString('vi-VN')}đ</td><td>${o.paymentMethod}</td><td><span class="badge badge-${o.status}">${o.status}</span></td><td style="font-size:12px">${new Date(o.createdAt).toLocaleString('vi-VN')}</td><td>${o.status==='pending'?`<button class="btn-mini btn-edit" onclick="confirmOrder('${o.orderCode}')">Xác nhận</button>`:''}${o.status==='delivered'?`<span style="font-family:monospace;font-size:11px">${o.keyValue}</span>`:''}</td></tr>`).join('');
}catch(e){console.error(e)}
}

if($('refreshOrders'))$('refreshOrders').addEventListener('click',loadOrders);

async function confirmOrder(code){
if(!confirm(`Xác nhận đơn ${code}?`))return;
try{const res=await apiFetch(`${API}/admin/orders/${code}/confirm`,{method:'POST'});if(res.ok)loadOrders();else alert('Lỗi')}catch(e){alert(e.message)}
}
window.confirmOrder=confirmOrder;
window.editMovie=editMovie;
window.deleteMovie=deleteMovie;

if($('importKeysBtn'))$('importKeysBtn').addEventListener('click',async()=>{
const text=$('keysInput').value;
const keys=[...new Set(text.split('\n').map(k=>k.trim().toUpperCase()).filter(Boolean))];
if(!keys.length){$('importMsg').textContent='Chưa có key';return}
$('importKeysBtn').disabled=true;$('importMsg').textContent=`Đang import ${keys.length} key...`;
const batches=[];for(let i=0;i<keys.length;i+=100)batches.push(keys.slice(i,i+100));
let total=0;
try{
for(const batch of batches){
const res=await apiFetch(`${API}/admin/keys/import`,{method:'POST
