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
    const el = $('
