const IMG_BASE = 'https://image.tmdb.org/t/p';
const KEY_STORAGE = 'phimhay_access_token';
const KEY_EXPIRE_STORAGE = 'phimhay_access_expire';
const KEY_VALUE_STORAGE = 'phimhay_access_key';

let accessToken = localStorage.getItem(KEY_STORAGE) || '';
let accessExpire = Number(localStorage.getItem(KEY_EXPIRE_STORAGE)) || 0;
let countdownTimer = null;
let currentMovie = null;
let favorites = [];

const state = {
    tab: 'tmdb_popular',
    page: 1,
    totalPages: 1,
    query: '',
    movies: []
};

const $ = id => document.getElementById(id);

async function verifyKey(key) {
    const res = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Key không hợp lệ');
    return data;
}

async function checkTokenStatus() {
    if (!accessToken) return { valid: false };
    try {
        const res = await fetch('/api/access/status', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        return await res.json();
    } catch {
        return { valid: false };
    }
}

function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    const el = $('countdown');
    if (!el) return;

    const tick = () => {
        const left = Math.floor((accessExpire - Date.now()) / 1000);
        if (left <= 0) {
            el.textContent = 'Hết hạn';
            clearInterval(countdownTimer);
            handleExpire();
            return;
        }
        const h = Math.floor(left / 3600);
        const m = Math.floor((left % 3600) / 60);
        const s = left % 60;
        el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
}

function handleExpire() {
    localStorage.removeItem(KEY_STORAGE);
    localStorage.removeItem(KEY_EXPIRE_STORAGE);
    alert('Phiên xem phim đã hết hạn. Vui lòng nhập key mới.');
    location.reload();
}

function initAuth() {
    const savedKey = localStorage.getItem(KEY_VALUE_STORAGE);
    if (savedKey) $('keyInput').value = savedKey;

    $('keySubmit').onclick = async () => {
        const key = $('keyInput').value.trim();
        if (!key) return showKeyError('Nhập key trước');

        $('keySubmit').disabled = true;
        $('keySubmit').textContent = 'Đang kiểm tra...';
        $('keyError').textContent = '';

        try {
            const data = await verifyKey(key);
            accessToken = data.token;
            accessExpire = new Date(data.expiresAt).getTime();

            localStorage.setItem(KEY_STORAGE, accessToken);
            localStorage.setItem(KEY_EXPIRE_STORAGE, String(accessExpire));
            localStorage.setItem(KEY_VALUE_STORAGE, key.toUpperCase());

            enterApp();
        } catch (e) {
            showKeyError(e.message);
        } finally {
            $('keySubmit').disabled = false;
            $('keySubmit').textContent = 'Xác nhận';
        }
    };

    $('keyInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') $('keySubmit').click();
    });

    $('logoutBtn').onclick = () => {
        if (!confirm('Đăng xuất khỏi phiên hiện tại?')) return;
        localStorage.removeItem(KEY_STORAGE);
        localStorage.removeItem(KEY_EXPIRE_STORAGE);
        location.reload();
    };

    if (accessToken) {
        checkTokenStatus().then(status => {
            if (status.valid) {
                accessExpire = new Date(status.expiresAt).getTime();
                enterApp();
            } else {
                localStorage.removeItem(KEY_STORAGE);
                localStorage.removeItem(KEY_EXPIRE_STORAGE);
                showKeyGate();
            }
        });
    } else {
        showKeyGate();
    }
}

function showKeyGate() {
    $('keyGate').classList.remove('hidden');
    $('app').classList.add('hidden');
    if (countdownTimer) clearInterval(countdownTimer);
}

function enterApp() {
    $('keyGate').classList.add('hidden');
    $('app').classList.remove('hidden');
    startCountdown();
    init();
}

function showKeyError(msg) {
    $('keyError').textContent = msg;
}

async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
        ...opts,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...(opts.headers || {})
        }
    });

    if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        localStorage.removeItem(KEY_STORAGE);
        localStorage.removeItem(KEY_EXPIRE_STORAGE);
        alert(data.error || 'Phiên đã hết hạn');
        location.reload();
        throw new Error('Unauthorized');
    }

    if (!res.ok) throw new Error('Request failed');
    return res.json();
}

function imgUrl(path, size = 'w500') {
    if (!path) return 'https://via.placeholder.com/500x750/1c1c20/666?text=No+Image';
    if (path.startsWith('http')) return path;
    return `${IMG_BASE}/${size}${path}`;
}

document.querySelectorAll('.nav-link').forEach(el => {
    el.addEventListener('click', e => {
        e.preventDefault();
        switchTab(el.dataset.tab);
    });
});

function switchTab(tab) {
    state.tab = tab;
    state.page = 1;
    state.query = '';
    $('searchInput').value = '';
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });

    const titles = {
        tmdb_popular: 'Phim quốc tế',
        ophim: 'Phim Việt',
        phimapi: 'Phim bộ',
        custom: 'Kho phim',
        favorites: 'Phim yêu thích'
    };
    $('sectionTitle').textContent = titles[tab] || '';
    loadMovies();
}

async function loadMovies(append = false) {
    const grid = $('movieGrid');
    if (!append) {
        grid.innerHTML = '<p style="grid-column:1/-1;color:#9a9aa3">Đang tải...</p>';
        state.movies = [];
    }

    try {
        let data;

        if (state.tab === 'favorites') {
            data = await apiFetch('/api/movies/favorites');
            state.movies = data.map(m => ({
                id: m.tmdbId, title: m.title,
                poster_path: m.posterPath, backdrop_path: m.backdropPath,
                release_date: m.releaseDate, vote_average: m.voteAverage,
                overview: m.overview, source: 'tmdb'
            }));
            $('sourceBadge').textContent = 'Local';
        } else if (state.tab === 'custom') {
            data = await apiFetch(`/api/custom?page=${state.page}`);
            state.movies = append ? [...state.movies, ...data.results] : data.results;
            state.totalPages = data.total_pages;
            $('sourceBadge').textContent = 'Custom';
        } else if (state.tab === 'ophim') {
            data = await apiFetch(`/api/ophim/new?page=${state.page}`);
            state.movies = append ? [...state.movies, ...data.results] : data.results;
            state.totalPages = data.total_pages;
            $('sourceBadge').textContent = 'Ophim';
        } else if (state.tab === 'phimapi') {
            data = await apiFetch(`/api/phimapi/new?page=${state.page}`);
            state.movies = append ? [...state.movies, ...data.results] : data.results;
            state.totalPages = data.total_pages;
            $('sourceBadge').textContent = 'PhimAPI';
        } else {
            data = await apiFetch(`/api/tmdb/popular?page=${state.page}`);
            state.movies = append ? [...state.movies, ...data.results] : data.results;
            state.totalPages = data.total_pages;
            $('sourceBadge').textContent = 'TMDB';
        }

        renderMovies();
        renderHero();

        $('loadMoreBtn').style.display =
            (state.tab !== 'favorites' && state.page < state.totalPages) ? 'inline-block' : 'none';
    } catch (e) {
        console.error(e);
        grid.innerHTML = `<p style="grid-column:1/-1;color:#e50914">${e.message}</p>`;
    }
}

function renderMovies() {
    const grid = $('movieGrid');
    if (!state.movies.length) {
        grid.innerHTML = '<p style="grid-column:1/-1;color:#9a9aa3">Không có phim</p>';
        return;
    }

    grid.innerHTML = state.movies.map(m => `
        <div class="movie-card" data-id="${m.id}" data-source="${m.source || 'tmdb'}">
            <div class="movie-poster">
                <img src="${imgUrl(m.poster_path || m.poster)}" alt="${m.title}" loading="lazy"
                     onerror="this.src='https://via.placeholder.com/500x750/1c1c20/666?text=No+Image'">
                ${m.vote_average ? `<span class="movie-rating">${Number(m.vote_average).toFixed(1)}</span>` : ''}
                ${m.quality ? `<span class="movie-quality">${m.quality}</span>` : ''}
            </div>
            <h3 class="movie-title">${m.title}</h3>
            <div class="movie-year">${(m.release_date || '').slice(0, 4) || '—'}
                ${m.episode_current ? ` · ${m.episode_current}` : ''}</div>
        </div>
    `).join('');

    grid.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', () =>
            openModal(card.dataset.id, card.dataset.source)
        );
    });
}

function renderHero() {
    const movie = state.movies[0];
    if (!movie) return;

    const hero = $('hero');
    const oldBg = hero.querySelector('.hero-bg');
    if (oldBg) oldBg.remove();

    const bg = document.createElement('div');
    bg.className = 'hero-bg';
    bg.style.backgroundImage = `url(${imgUrl(movie.backdrop_path || movie.poster_path, 'original')})`;
    hero.insertBefore(bg, hero.firstChild);

    $('heroTitle').textContent = movie.title;
    $('heroDesc').textContent = movie.overview || '';
    $('heroPlay').onclick = () => openModal(movie.id, movie.source || 'tmdb');
}

async function openModal(id, source = 'tmdb') {
    try {
        let movie, trailerKey = null;

        if (source === 'custom') {
            const data = await apiFetch(`/api/custom/${id}`);
            movie = data.movie;
            $('modalTitle').textContent = movie.title;
            $('modalBackdrop').style.backgroundImage = `url(${imgUrl(movie.backdrop || movie.poster, 'original')})`;
            $('modalPoster').src = imgUrl(movie.poster, 'w342');
            $('modalMeta').innerHTML = `
                <span>${movie.year || '—'}</span>
                <span>${(movie.genres || []).join(', ')}</span>
                <span>${movie.quality || 'HD'}</span>`;
            $('modalOverview').textContent = movie.description || 'Chưa có mô tả';

            const epList = $('episodesList');
            epList.innerHTML = '';
            if (movie.episodes?.length) {
                movie.episodes.forEach((ep, idx) => {
                    const btn = document.createElement('button');
                    btn.className = 'ep-btn' + (idx === 0 ? ' active' : '');
                    btn.textContent = ep.name || `Tập ${idx + 1}`;
                    btn.onclick = () => {
                        document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        playVideo(ep.embed || ep.m3u8 || movie.videoUrl);
                    };
                    epList.appendChild(btn);
                });
            }

            $('modalPlay').onclick = () => playVideo(
                movie.episodes?.[0]?.embed || movie.episodes?.[0]?.m3u8 || movie.videoUrl
            );
            $('modalFavorite').style.display = 'none';
        } else if (source === 'ophim') {
            const data = await apiFetch(`/api/ophim/movie/${id}`);
            const m = data.movie || data.data?.item;
            movie = m;
            $('modalTitle').textContent = m.name || m.title;
            $('modalBackdrop').style.backgroundImage = `url(${m.thumb_url || m.poster_url})`;
            $('modalPoster').src = m.poster_url || m.thumb_url;
            $('modalMeta').innerHTML = `
                <span>${m.year || '—'}</span>
                <span>${m.quality || 'HD'}</span>
                <span>${m.lang || 'Vietsub'}</span>`;
            $('modalOverview').textContent = (m.content || '').replace(/<[^>]*>/g, '').slice(0, 500);

            const epList = $('episodesList');
            epList.innerHTML = '';
            const serverData = m.episodes?.[0]?.server_data || [];
            serverData.forEach((ep, idx) => {
                const btn = document.createElement('button');
                btn.className = 'ep-btn' + (idx === 0 ? ' active' : '');
                btn.textContent = ep.name || `Tập ${idx + 1}`;
                btn.onclick = () => {
                    document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    playVideo(ep.link_embed || ep.link_m3u8);
                };
                epList.appendChild(btn);
            });

            $('modalPlay').onclick = () => {
                const first = serverData[0];
                if (first) playVideo(first.link_embed || first.link_m3u8);
            };
            $('modalFavorite').style.display = 'none';
        } else {
            const data = await apiFetch(`/api/tmdb/movie/${id}`);
            movie = data;
            const trailer = (data.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
            trailerKey = trailer?.key;

            $('modalTitle').textContent = data.title;
            $('modalBackdrop').style.backgroundImage = `url(${imgUrl(data.backdrop_path || data.poster_path, 'original')})`;
            $('modalPoster').src = imgUrl(data.poster_path, 'w342');
            $('modalMeta').innerHTML = `
                <span class="rating">${(data.vote_average || 0).toFixed(1)}</span>
                <span>${(data.release_date || '').slice(0, 4) || '—'}</span>
                <span>${(data.genres || []).map(g => g.name).join(', ')}</span>`;
            $('modalOverview').textContent = data.overview || 'Chưa có mô tả';

            $('modalPlay').onclick = () => {
                if (trailerKey) playVideo(`https://www.youtube.com/embed/${trailerKey}`);
            };
            $('modalPlay').disabled = !trailerKey;
            $('modalPlay').style.opacity = trailerKey ? 1 : 0.5;
            $('modalFavorite').style.display = 'inline-block';
            $('episodesList').innerHTML = '';
        }

        currentMovie = movie;
        $('movieModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (e) {
        console.error(e);
    }
}

function closeModal() {
    $('movieModal').classList.remove('active');
    document.body.style.overflow = '';
    $('episodesList').innerHTML = '';
}

function playVideo(url) {
    if (!url || (!url.startsWith('http') && !url.startsWith('//'))) return;
    $('playerFrame').src = url;
    $('playerModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePlayer() {
    $('playerFrame').src = '';
    $('playerModal').classList.remove('active');
    document.body.style.overflow = '';
}

let searchTimer;
$('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        state.query = e.target.value.trim();
        state.page = 1;
        if (state.query) performSearch();
        else switchTab(state.tab);
    }, 400);
});

async function performSearch() {
    const grid = $('movieGrid');
    grid.innerHTML = '<p style="grid-column:1/-1;color:#9a9aa3">Đang tìm...</p>';
    $('sectionTitle').textContent = `Kết quả: "${state.query}"`;
    $('sourceBadge').textContent = '';
    $('loadMoreBtn').style.display = 'none';

    try {
        let data;
        if (state.tab === 'ophim') {
            data = await apiFetch(`/api/ophim/search?keyword=${encodeURIComponent(state.query)}`);
        } else if (state.tab === 'custom') {
            data = await apiFetch(`/api/custom/search?keyword=${encodeURIComponent(state.query)}`);
        } else {
            data = await apiFetch(`/api/tmdb/search?query=${encodeURIComponent(state.query)}`);
        }
        state.movies = data.results || [];
        renderMovies();
    } catch (e) {
        grid.innerHTML = `<p style="grid-column:1/-1;color:#e50914">Lỗi tìm kiếm</p>`;
    }
}

$('loadMoreBtn').addEventListener('click', () => {
    state.page++;
    loadMovies(true);
});

$('movieModal').addEventListener('click', e => {
    if (e.target.id === 'movieModal') closeModal();
});
$('playerModal').addEventListener('click', e => {
    if (e.target.id === 'playerModal') closePlayer();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closePlayer(); }
});

async function loadFavorites() {
    try { favorites = await apiFetch('/api/movies/favorites'); }
    catch { favorites = []; }
}

async function init() {
    await loadFavorites();
    await loadMovies();
}

initAuth();

window.addEventListener('load', () => {
    const splash = document.getElementById('splash');
    if (splash) {
        splash.style.transition = 'opacity 0.3s';
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 300);
    }
});
