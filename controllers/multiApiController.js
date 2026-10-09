const axios = require('axios');

const nguonc = axios.create({ baseURL: 'https://phim.nguonc.com/api', timeout: 20000 });
const kkphim = axios.create({ baseURL: 'https://phimapi.com', timeout: 20000 });
const ophim = axios.create({ baseURL: 'https://ophim1.com/v1/api', timeout: 20000 });

function mapItem(item, source) {
    return {
        id: item.slug,
        title: item.name,
        poster_path: item.poster_url,
        backdrop_path: item.thumb_url,
        release_date: item.year?.toString(),
        vote_average: item.tmdb?.vote_average || item.vote_average || 0,
        overview: (item.content || '').replace(/<[^>]*>/g, '').slice(0, 300),
        source,
        episode_current: item.episode_current,
        quality: item.quality
    };
}

async function fetchNguonC(page) {
    const { data } = await nguonc.get('/films/phim-moi-cap-nhat', { params: { page } });
    return (data.items || []).map(i => mapItem(i, 'nguonc'));
}

async function fetchKKPhim(page) {
    const { data } = await kkphim.get('/danh-sach/phim-moi-cap-nhat', { params: { page } });
    return (data.items || []).map(i => mapItem(i, 'kkphim'));
}

async function fetchOphim(page) {
    const { data } = await ophim.get('/danh-sach/phim-moi-cap-nhat', { params: { page } });
    return (data.items || []).map(i => mapItem(i, 'ophim'));
}

exports.aggregate = async (req, res) => {
    const page = req.query.page || 1;
    const results = await Promise.allSettled([
        fetchNguonC(page), fetchKKPhim(page), fetchOphim(page)
    ]);
    const merged = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value || []);
    const seen = new Set();
    const unique = merged.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
    unique.sort(() => Math.random() - 0.5);
    res.json({ source: 'aggregate', results: unique, total_pages: 1 });
};

exports.nguoncNew = async (req, res) => {
    try { res.json({ source: 'nguonc', results: await fetchNguonC(req.query.page || 1), total_pages: 1 }); }
    catch (e) { res.status(500).json({ error: e.message }); }
};

exports.nguoncDetail = async (req, res) => {
    try {
        const { data } = await nguonc.get(`/film/${req.params.slug}`);
        const m = data.movie || data;
        res.json({
            source: 'nguonc',
            movie: {
                name: m.name, slug: m.slug, origin_name: m.origin_name,
                content: m.content, poster_url: m.poster_url, thumb_url: m.thumb_url,
                year: m.year, quality: m.quality, lang: m.lang,
                episode_current: m.episode_current, tmdb: m.tmdb
            },
            episodes: data.episodes || []
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.kkphimNew = async (req, res) => {
    try { res.json({ source: 'kkphim', results: await fetchKKPhim(req.query.page || 1), total_pages: 1 }); }
    catch (e) { res.status(500).json({ error: e.message }); }
};

exports.kkphimDetail = async (req, res) => {
    try {
        const { data } = await kkphim.get(`/phim/${req.params.slug}`);
        const m = data.movie || data;
        res.json({
            source: 'kkphim',
            movie: {
                name: m.name, slug: m.slug, origin_name: m.origin_name,
                content: m.content, poster_url: m.poster_url, thumb_url: m.thumb_url,
                year: m.year, quality: m.quality, lang: m.lang,
                episode_current: m.episode_current, tmdb: m.tmdb
            },
            episodes: data.episodes || []
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.ophimNew = async (req, res) => {
    try { res.json({ source: 'ophim', results: await fetchOphim(req.query.page || 1), total_pages: 1 }); }
    catch (e) { res.status(500).json({ error: e.message }); }
};

exports.ophimDetail = async (req, res) => {
    try {
        const { data } = await ophim.get(`/phim/${req.params.slug}`);
        const m = data.movie || data;
        res.json({
            source: 'ophim',
            movie: {
                name: m.name, slug: m.slug, origin_name: m.origin_name,
                content: m.content, poster_url: m.poster_url, thumb_url: m.thumb_url,
                year: m.year, quality: m.quality, lang: m.lang,
                episode_current: m.episode_current, tmdb: m.tmdb
            },
            episodes: data.episodes || []
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
