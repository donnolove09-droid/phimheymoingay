const axios = require('axios');
const api = axios.create({ baseURL: process.env.PHIMAPI_BASE_URL, timeout: 15000 });

exports.getNewMovies = async (req, res) => {
    try {
        const { data } = await api.get('/danh-sach/phim-moi-cap-nhat', {
            params: { page: req.query.page || 1 }
        });
        res.json({
            source: 'phimapi',
            results: (data.items || []).map(mapItem),
            total_pages: data.pagination?.totalPages || 1
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getMovieDetail = async (req, res) => {
    try {
        const { data } = await api.get(`/phim/${req.params.slug}`);
        res.json({ source: 'phimapi', ...data });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

function mapItem(item) {
    return {
        id: item.slug,
        title: item.name,
        poster_path: item.poster_url,
        backdrop_path: item.thumb_url,
        release_date: item.year?.toString(),
        vote_average: item.tmdb?.vote_average || 0,
        overview: (item.content || '').replace(/<[^>]*>/g, '').slice(0, 300),
        source: 'phimapi',
        episode_current: item.episode_current,
        quality: item.quality
    };
}
