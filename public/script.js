const IMG_BASE='https://image.tmdb.org/t/p';
const API_COMMENTS='/api';
const KEY_STORAGE='phimhay_access_token';
const KEY_EXPIRE_STORAGE='phimhay_access_expire';
const KEY_VALUE_STORAGE='phimhay_access_key';

let accessToken=localStorage.getItem(KEY_STORAGE)||'';
let accessExpire=Number(localStorage.getItem(KEY_EXPIRE_STORAGE))||0;
let countdownTimer=null;
let currentMovie=null;
let currentMovieSource=null;
let favorites=[];

const state={tab:'aggregate',page:1,totalPages:1,query:'',movies:[]};
const $=id=>document.getElementById(id);

/* ============ AUTH ============ */
async function verifyKey(key){
const res=await fetch('/api/access/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
const data=await res.json();
if(!res.ok)throw new Error(data.error||'Key không hợp lệ');
return data;
}

async function checkTokenStatus(){
if(!accessToken)return{valid:false};
try{const res=await fetch('/api/access/status',{headers:{'Authorization':`Bearer ${accessToken}`}});return await res.json()}
catch{return{valid:false}}
}

function startCountdown(){
if(countdownTimer)clearInterval(countdownTimer);
const el=$('countdown');if(!el)return;
const tick=()=>{
const left=Math.floor((accessExpire-Date.now())/1000);
if(left<=0){el.textContent='Hết hạn';clearInterval(countdownTimer);handleExpire();return}
const h=Math.floor(left/3600),m=Math.floor((left%3600)/60),s=left%60;
el.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};
tick();countdownTimer=setInterval(tick,1000);
}

function handleExpire(){
localStorage.removeItem(KEY_STORAGE);
localStorage.removeItem(KEY_EXPIRE_STORAGE);
alert('Phiên xem phim đã hết hạn. Vui lòng nhập key mới.');
location.reload();
}

function initAuth(){
const savedKey=localStorage.getItem(KEY_VALUE_STORAGE);
if(savedKey)$('keyInput').value=savedKey;
$('keySubmit').onclick=async()=>{
const key=$('keyInput').value.trim();
if(!key)return showKeyError('Nhập key trước');
$('keySubmit').disabled=true;$('keySubmit').textContent='Đang kiểm tra...';$('keyError').textContent='';
try{
const data=await verifyKey(key);
accessToken=data.token;
accessExpire=new Date(data.expiresAt).getTime();
localStorage.setItem(KEY_STORAGE,accessToken);
localStorage.setItem(KEY_EXPIRE_STORAGE,String(accessExpire));
localStorage.setItem(KEY_VALUE_STORAGE,key.toUpperCase());
enterApp();
}catch(e){showKeyError(e.message)}
finally{$('keySubmit').disabled=false;$('keySubmit').textContent='Xác nhận'}
};
$('keyInput').addEventListener('keypress',e=>{if(e.key==='Enter')$('keySubmit').click()});
$('logoutBtn').onclick=()=>{
if(!confirm('Đăng xuất?'))return;
localStorage.removeItem(KEY_STORAGE);
localStorage.removeItem(KEY_EXPIRE_STORAGE);
location.reload();
};
if(accessToken){
checkTokenStatus().then(status=>{
if(status.valid){accessExpire=new Date(status.expiresAt).getTime();enterApp()}
else{localStorage.removeItem(KEY_STORAGE);localStorage.removeItem(KEY_EXPIRE_STORAGE);showKeyGate()}
});
}else{showKeyGate()}
}

function showKeyGate(){$('keyGate').classList.remove('hidden');$('app').classList.add('hidden');if(countdownTimer)clearInterval(countdownTimer)}
function enterApp(){$('keyGate').classList.add('hidden');$('app').classList.remove('hidden');startCountdown();init()}
function showKeyError(msg){$('keyError').textContent=msg}

async function apiFetch(url,opts={}){
const res=await fetch(url,{...opts,headers:{'Authorization':`Bearer ${accessToken}`,...(opts.headers||{})}});
if(res.status===401){
const data=await res.json().catch(()=>({}));
localStorage.removeItem(KEY_STORAGE);
localStorage.removeItem(KEY_EXPIRE_STORAGE);
alert(data.error||'Phiên đã hết hạn');
location.reload();
throw new Error('Unauthorized');
}
if(!res.ok){
let errMsg='Request failed';
try{const d=await res.json();errMsg=d.error||errMsg}catch{}
throw new Error(errMsg);
}
return res.json();
}

function imgUrl(path,size='w500'){
if(!path)return'https://via.placeholder.com/500x750/1c1c20/666?text=No+Image';
if(path.startsWith('http'))return path;
return`${IMG_BASE}/${size}${path}`;
}

/* ============ NAV ============ */
document.querySelectorAll('.nav-link').forEach(el=>{
el.addEventListener('click',e=>{e.preventDefault();switchTab(el.dataset.tab)});
});

function switchTab(tab){
state.tab=tab;state.page=1;state.query='';
if($('searchInput'))$('searchInput').value='';
document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
const titles={tmdb_popular:'Trailer phim',phimapi:'Phim bộ',aggregate:'Phim tổng hợp',custom:'Kho phim',favorites:'Phim yêu thích'};
$('sectionTitle').textContent=titles[tab]||'';
loadMovies();
}

/* ============ LOAD MOVIES ============ */
async function loadMovies(append=false){
const grid=$('movieGrid');
if(!append){grid.innerHTML='<p style="grid-column:1/-1;color:#9a9aa3">Đang tải...</p>';state.movies=[]}
try{
let data;
if(state.tab==='favorites'){
data=await apiFetch('/api/movies/favorites');
state.movies=data.map(m=>({id:m.tmdbId,title:m.title,poster_path:m.posterPath,backdrop_path:m.backdropPath,release_date:m.releaseDate,vote_average:m.voteAverage,overview:m.overview,source:'tmdb'}));
$('sourceBadge').textContent='Local';
}else if(state.tab==='custom'){
data=await apiFetch(`/api/custom?page=${state.page}`);
state.movies=append?[...state.movies,...data.results]:data.results;
state.totalPages=data.total_pages;$('sourceBadge').textContent='Custom';
}else if(state.tab==='phimapi'){
data=await apiFetch(`/api/phimapi/new?page=${state.page}`);
state.movies=append?[...state.movies,...data.results]:data.results;
state.totalPages=data.total_pages;$('sourceBadge').textContent='PhimAPI';
}else if(state.tab==='aggregate'){
data=await apiFetch(`/api/multi/aggregate?page=${state.page}`);
state.movies=append?[...state.movies,...data.results]:data.results;
state.totalPages=data.total_pages;$('sourceBadge').textContent='Tổng hợp';
}else{
data=await apiFetch(`/api/tmdb/popular?page=${state.page}`);
state.movies=append?[...state.movies,...data.results]:data.results;
state.totalPages=data.total_pages;$('sourceBadge').textContent='TMDB';
}
renderMovies();renderHero();
$('loadMoreBtn').style.display=(state.tab!=='favorites'&&state.page<state.totalPages)?'inline-block':'none';
}catch(e){
console.error(e);
grid.innerHTML=`<p style="grid-column:1/-1;color:#e50914">${e.message}</p>`;
}
}

function renderMovies(){
const grid=$('movieGrid');
if(!state.movies.length){grid.innerHTML='<p style="grid-column:1/-1;color:#9a9aa3">Không có phim</p>';return}
grid.innerHTML=state.movies.map(m=>`
<div class="movie-card" data-id="${m.id}" data-source="${m.source||'tmdb'}">
<div class="movie-poster">
<img src="${imgUrl(m.poster_path||m.poster)}" alt="${m.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/500x750/1c1c20/666?text=No+Image'">
${m.vote_average?`<span class="movie-rating">${Number(m.vote_average).toFixed(1)}</span>`:''}
${m.quality?`<span class="movie-quality">${m.quality}</span>`:''}
</div>
<h3 class="movie-title">${m.title}</h3>
<div class="movie-year">${(m.release_date||'').slice(0,4)||'—'}${m.episode_current?` · ${m.episode_current}`:''}</div>
</div>`).join('');
grid.querySelectorAll('.movie-card').forEach(card=>{
card.addEventListener('click',()=>openModal(card.dataset.id,card.dataset.source));
});
}

function renderHero(){
const movie=state.movies[0];if(!movie)return;
const hero=$('hero');
const oldBg=hero.querySelector('.hero-bg');
if(oldBg)oldBg.remove();
const bg=document.createElement('div');
bg.className='hero-bg';
bg.style.backgroundImage=`url(${imgUrl(movie.backdrop_path||movie.poster_path,'original')})`;
hero.insertBefore(bg,hero.firstChild);
$('heroTitle').textContent=movie.title;
$('heroDesc').textContent=movie.overview||'';
$('heroPlay').onclick=()=>openModal(movie.id,movie.source||'tmdb');
}

/* ============ MODAL ============ */
async function openModal(id,source='tmdb'){
try{
let movie,trailerKey=null;
currentMovieSource=source;

if(source==='custom'){
const data=await apiFetch(`/api/custom/${id}`);
movie=data.movie;
$('modalTitle').textContent=movie.title;
$('modalBackdrop').style.backgroundImage=`url(${imgUrl(movie.backdrop||movie.poster,'original')})`;
$('modalPoster').src=imgUrl(movie.poster,'w342');
$('modalMeta').innerHTML=`<span>${movie.year||'—'}</span><span>${(movie.genres||[]).join(', ')}</span><span>${movie.quality||'HD'}</span>`;
$('modalOverview').textContent=movie.description||'Chưa có mô tả';
const epList=$('episodesList');epList.innerHTML='';
if(movie.episodes?.length){
movie.episodes.forEach((ep,idx)=>{
const btn=document.createElement('button');
btn.className='ep-btn'+(idx===0?' active':'');
btn.textContent=ep.name||`Tập ${idx+1}`;
btn.onclick=()=>{document.querySelectorAll('.ep-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');playVideo(ep.embed||ep.m3u8||movie.videoUrl)};
epList.appendChild(btn);
});
}
$('modalPlay').disabled=false;$('modalPlay').style.opacity=1;
$('modalPlay').onclick=()=>playVideo(movie.episodes?.[0]?.embed||movie.episodes?.[0]?.m3u8||movie.videoUrl);
$('modalFavorite').style.display='none';

}else if(source==='nguonc'||source==='kkphim'||source==='ophim'){
const data=await apiFetch(`/api/multi/${source}/movie/${id}`);
const info=data.movie;
movie=info;
$('modalTitle').textContent=info.name||info.title;
$('modalBackdrop').style.backgroundImage=`url(${info.thumb_url||info.poster_url})`;
$('modalPoster').src=info.poster_url||info.thumb_url;
$('modalMeta').innerHTML=`<span>${info.year||'—'}</span><span>${info.quality||'HD'}</span><span>${info.lang||'Vietsub'}</span>`;
$('modalOverview').textContent=(info.content||'').replace(/<[^>]*>/g,'').slice(0,500);

const epList=$('episodesList');
epList.innerHTML='';
const serverData=data.episodes?.[0]?.server_data||[];

if(serverData.length){
serverData.forEach((ep,idx)=>{
const btn=document.createElement('button');
btn.className='ep-btn'+(idx===0?' active':'');
btn.textContent=ep.name||`Tập ${idx+1}`;
btn.onclick=()=>{
document.querySelectorAll('.ep-btn').forEach(b=>b.classList.remove('active'));
btn.classList.add('active');
playVideo(ep.link_embed||ep.link_m3u8);
};
epList.appendChild(btn);
});
}

$('modalPlay').disabled=false;
$('modalPlay').style.opacity=1;
$('modalPlay').onclick=()=>{
if(serverData.length){
const f=serverData[0];
playVideo(f.link_embed||f.link_m3u8);
}else{
alert('Phim này chưa có tập phát.');
}
};
$('modalFavorite').style.display='none';

}else if(source==='phimapi'){
const data=await apiFetch(`/api/phimapi/movie/${id}`);
const info=data.movie;
movie=info;
$('modalTitle').textContent=info.name||info.title;
$('modalBackdrop').style.backgroundImage=`url(${info.thumb_url||info.poster_url})`;
$('modalPoster').src=info.poster_url||info.thumb_url;
$('modalMeta').innerHTML=`<span>${info.year||'—'}</span><span>${info.quality||'HD'}</span><span>${info.lang||'Vietsub'}</span>`;
$('modalOverview').textContent=(info.content||'').replace(/<[^>]*>/g,'').slice(0,500);

const epList=$('episodesList');
epList.innerHTML='';
const serverData=data.episodes?.[0]?.server_data||[];

if(serverData.length){
serverData.forEach((ep,idx)=>{
const btn=document.createElement('button');
btn.className='ep-btn'+(idx===0?' active':'');
btn.textContent=ep.name||`Tập ${idx+1}`;
btn.onclick=()=>{
document.querySelectorAll('.ep-btn').forEach(b=>b.classList.remove('active'));
btn.classList.add('active');
playVideo(ep.link_embed||ep.link_m3u8);
};
epList.appendChild(btn);
});
}

$('modalPlay').disabled=false;
$('modalPlay').style.opacity=1;
$('modalPlay').onclick=()=>{
if(serverData.length){
const f=serverData[0];
playVideo(f.link_embed||f.link_m3u8);
}else{
alert('Phim này chưa có tập phát.');
}
};
$('modalFavorite').style.display='none';

}else{
const data=await apiFetch(`/api/tmdb/movie/${id}`);
movie=data;
const trailer=(data.videos?.results||[]).find(v=>v.type==='Trailer'&&v.site==='YouTube');
trailerKey=trailer?.key;
$('modalTitle').textContent=data.title;
$('modalBackdrop').style.backgroundImage=`url(${imgUrl(data.backdrop_path||data.poster_path,'original')})`;
$('modalPoster').src=imgUrl(data.poster_path,'w342');
$('modalMeta').innerHTML=`<span class="rating">${(data.vote_average||0).toFixed(1)}</span><span>${(data.release_date||'').slice(0,4)||'—'}</span><span>${(data.genres||[]).map(g=>g.name).join(', ')}</span>`;
$('modalOverview').textContent=data.overview||'Chưa có mô tả';
$('modalPlay').disabled=false;
$('modalPlay').style.opacity=1;
$('modalPlay').onclick=()=>{
if(trailerKey){playVideo(`https://www.youtube.com/embed/${trailerKey}`)}
else{alert('Phim này chỉ có thông tin, không có trailer.')}
};
$('modalFavorite').style.display='inline-block';
$('modalFavorite').textContent=favorites.some(f=>f.tmdbId===data.id)?'Đã yêu thích':'Yêu thích';
$('modalFavorite').style.background=favorites.some(f=>f.tmdbId===data.id)?'#e50914':'rgba(255,255,255,0.1)';
$('modalFavorite').onclick=()=>toggleFavorite(data);
$('episodesList').innerHTML='';
}
currentMovie=movie;
$('movieModal').classList.add('active');
document.body.style.overflow='hidden';

loadComments(id,source);
}catch(e){console.error(e);alert('Không thể mở phim: '+e.message)}
}

async function toggleFavorite(movie){
const tmdbId=movie.id;
const isFav=favorites.some(f=>f.tmdbId===tmdbId);
try{
if(isFav){
await apiFetch(`/api/movies/favorites/${tmdbId}`,{method:'DELETE'});
favorites=favorites.filter(f=>f.tmdbId!==tmdbId);
$('modalFavorite').textContent='Yêu thích';
$('modalFavorite').style.background='rgba(255,255,255,0.1)';
}else{
await apiFetch('/api/movies/favorites',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
tmdbId:movie.id,title:movie.title,overview:movie.overview,
posterPath:movie.poster_path,backdropPath:movie.backdrop_path,
releaseDate:movie.release_date,voteAverage:movie.vote_average,
genres:(movie.genres||[]).map(g=>g.name)
})
});
favorites.push({tmdbId});
$('modalFavorite').textContent='Đã yêu thích';
$('modalFavorite').style.background='#e50914';
}
if(state.tab==='favorites')loadMovies();
}catch(e){alert('Lỗi: '+e.message)}
}

function closeModal(){
$('movieModal').classList.remove('active');
document.body.style.overflow='';
$('episodesList').innerHTML='';
const cs=document.getElementById('commentSection');
if(cs)cs.remove();
}
function playVideo(url){
if(!url||(!url.startsWith('http')&&!url.startsWith('//'))){alert('Link video không hợp lệ');return}
$('playerFrame').src=url;
$('playerModal').classList.add('active');
document.body.style.overflow='hidden';
}
function closePlayer(){$('playerFrame').src='';$('playerModal').classList.remove('active');document.body.style.overflow=''}

/* ============ SEARCH ============ */
let searchTimer;
if($('searchInput'))$('searchInput').addEventListener('input',e=>{
clearTimeout(searchTimer);
searchTimer=setTimeout(()=>{
state.query=e.target.value.trim();
state.page=1;
if(state.query)performSearch();
else switchTab(state.tab);
},400);
});

async function performSearch(){
const grid=$('movieGrid');
grid.innerHTML='<p style="grid-column:1/-1;color:#9a9aa3">Đang tìm...</p>';
$('sectionTitle').textContent=`Kết quả: "${state.query}"`;
$('sourceBadge').textContent='';$('loadMoreBtn').style.display='none';
try{
let data;
if(state.tab==='custom'){data=await apiFetch(`/api/custom/search?keyword=${encodeURIComponent(state.query)}`)}
else{data=await apiFetch(`/api/tmdb/search?query=${encodeURIComponent(state.query)}`)}
state.movies=data.results||[];
renderMovies();
}catch(e){grid.innerHTML='<p style="grid-column:1/-1;color:#e50914">Lỗi tìm kiếm</p>'}
}

if($('loadMoreBtn'))$('loadMoreBtn').addEventListener('click',()=>{state.page++;loadMovies(true)});

if($('movieModal'))$('movieModal').addEventListener('click',e=>{if(e.target.id==='movieModal')closeModal()});
if($('playerModal'))$('playerModal').addEventListener('click',e=>{if(e.target.id==='playerModal')closePlayer()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closePlayer()}});

async function loadFavorites(){
try{favorites=await apiFetch('/api/movies/favorites')}
catch{favorites=[]}
}

async function init(){
await loadFavorites();
await loadMovies();
}

/* ============ COMMENTS ============ */
function getUserFromStorage(){
try{return JSON.parse(localStorage.getItem('phimhay_user')||'null')}
catch{return null}
}
function getUserToken(){return localStorage.getItem('phimhay_user_token')||''}

async function loadComments(slug,source){
let section=document.getElementById('commentSection');
if(!section){
section=document.createElement('div');
section.id='commentSection';
section.className='comment-section';
const modalInfo=document.querySelector('.modal-info');
if(modalInfo)modalInfo.appendChild(section);
}

const user=getUserFromStorage();
const token=getUserToken();

let formHtml;
if(user&&token){
formHtml=`
<div class="comment-form">
<textarea id="commentInput" placeholder="Viết bình luận..." maxlength="1000"></textarea>
<button id="commentSubmit">Gửi</button>
</div>`;
}else{
formHtml=`<div class="comment-login">Vui lòng <a href="/auth">đăng nhập</a> để bình luận</div>`;
}

section.innerHTML=`<h3>Bình luận</h3>${formHtml}<div id="commentList"><p class="comment-empty">Đang tải...</p></div>`;

await refreshComments(slug,source);

const submitBtn=document.getElementById('commentSubmit');
if(submitBtn)submitBtn.onclick=()=>submitComment(slug,source);
}

async function refreshComments(slug,source){
const list=document.getElementById('commentList');
if(!list)return;
try{
const res=await fetch(`${API_COMMENTS}/comments/${source}/${slug}`);
const comments=await res.json();
if(!comments.length){
list.innerHTML='<p class="comment-empty">Chưa có bình luận nào</p>';
return;
}
const user=getUserFromStorage();
list.innerHTML=comments.map(c=>{
const date=new Date(c.createdAt).toLocaleString('vi-VN');
const canDelete=user&&(c.userId===user.id||user.role==='admin');
return `
<div class="comment-item">
<div class="comment-head">
<span class="comment-user">${escapeHtml(c.username||'Ẩn danh')}</span>
<span class="comment-time">${date}</span>
</div>
<div class="comment-body">${escapeHtml(c.content)}</div>
<div class="comment-actions">
<button class="like-btn" data-id="${c._id}">Thích ${c.likes>0?`(${c.likes})`:''}</button>
${canDelete?`<button class="del-btn" data-id="${c._id}">Xóa</button>`:''}
</div>
</div>`;
}).join('');

list.querySelectorAll('.like-btn').forEach(btn=>{
btn.onclick=()=>likeComment(btn.dataset.id,slug,source);
});
list.querySelectorAll('.del-btn').forEach(btn=>{
btn.onclick=()=>deleteComment(btn.dataset.id,slug,source);
});
}catch(e){
list.innerHTML='<p class="comment-empty">Lỗi tải bình luận</p>';
}
}

async function submitComment(slug,source){
const input=document.getElementById('commentInput');
const content=input?.value.trim();
if(!content)return;
const token=getUserToken();
if(!token)return alert('Vui lòng đăng nhập');
try{
const res=await fetch(`${API_COMMENTS}/comments`,{
method:'POST',
headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
body:JSON.stringify({movieSlug:slug,movieSource:source,content})
});
const data=await res.json();
if(!res.ok)throw new Error(data.error);
input.value='';
refreshComments(slug,source);
}catch(e){alert('Lỗi: '+e.message)}
}

async function likeComment(id,slug,source){
const token=getUserToken();
if(!token)return alert('Vui lòng đăng nhập để thích');
try{
const res=await fetch(`${API_COMMENTS}/comments/${id}/like`,{
method:'POST',
headers:{'Authorization':`Bearer ${token}`}
});
if(!res.ok)throw new Error('Lỗi');
refreshComments(slug,source);
}catch(e){console.error(e)}
}

async function deleteComment(id,slug,source){
if(!confirm('Xóa bình luận này?'))return;
const token=getUserToken();
if(!token)return;
try{
const res=await fetch(`${API_COMMENTS}/comments/${id}`,{
method:'DELETE',
headers:{'Authorization':`Bearer ${token}`}
});
if(!res.ok)throw new Error('Lỗi');
refreshComments(slug,source);
}catch(e){alert('Lỗi: '+e.message)}
}

function escapeHtml(text){
const div=document.createElement('div');
div.textContent=text;
return div.innerHTML;
}

function updateAuthButton(){
const btn=document.getElementById('btnAuth');
if(!btn)return;
const user=getUserFromStorage();
if(user){
btn.textContent=user.username;
btn.href='#';
btn.onclick=(e)=>{
e.preventDefault();
if(confirm('Đăng xuất khỏi tài khoản?')){
localStorage.removeItem('phimhay_user_token');
localStorage.removeItem('phimhay_user');
location.reload();
}
};
}else{
btn.textContent='Đăng nhập';
btn.href='/auth';
}
}

/* ============ INIT ============ */
initAuth();
updateAuthButton();

window.addEventListener('load',()=>{
const splash=document.getElementById('splash');
if(splash){splash.style.transition='opacity 0.3s';splash.style.opacity='0';setTimeout(()=>splash.remove(),300)}
});
