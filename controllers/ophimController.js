const axios = require('axios');
const ophim = axios.create({ baseURL: process.env.OPHIM_BASE_URL, timeout: 15000 });

exports.getNewMovies = async (req, res) => {
    try {
        const { data } = await ophim.get('/danh-sach/phim-moi-cap-nhat', {
            params: { page: req.query.page || 1 }
        });
        res.json({
            source: 'ophim',
            results: (data.items || []).map(mapItem),
            total_pages: data.pagination?.totalPages || 1
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getMovieDetail = async (req, res) => {
    try {
        const { data } = await ophim.get(`/phim/${req.params.slug}`);
        res.json({ source: 'ophim', ...data });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.searchMovies = async (req, res) => {
    try {
        const { keyword, page = 1 } = req.query;
        const { data } = await ophim.get('/tim-kiem', { params: { keyword, page } });
        res.json({
            source: 'ophim',
            results: (data.data?.items || []).map(mapItem),
            total_pages: 1
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

function mapItem(item) {
    return {
        id: item.slug,
        title: item.name,
        poster_path: item.poster_url,
        backdrop_path: item.thumb_url,
        release_date: item.year?.toString(),
        vote_average: 0,
        overview: (item.content || '').replace(/<[^>]*>/g, '').slice(0, 300),
        source: 'ophim',
        episode_current: item.episode_current,
        quality: item.quality
    };
}
