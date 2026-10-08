const CustomMovie = require('../models/CustomMovie');

function slugify(text) {
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

exports.list = async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = 20;
    const [items, total] = await Promise.all([
        CustomMovie.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        CustomMovie.countDocuments()
    ]);
    res.json({
        source: 'custom',
        results: items.map(toCard),
        total_pages: Math.ceil(total / limit),
        page
    });
};

exports.detail = async (req, res) => {
    const movie = await CustomMovie.findOne({ slug: req.params.slug });
    if (!movie) return res.status(404).json({ error: 'Không tìm thấy' });
    movie.views += 1;
    await movie.save();
    res.json({ source: 'custom', movie });
};

exports.search = async (req, res) => {
    const { keyword, page = 1 } = req.query;
    const regex = new RegExp(keyword, 'i');
    const limit = 20;
    const [items, total] = await Promise.all([
        CustomMovie.find({ $or: [{ title: regex }, { description: regex }] })
            .skip((page - 1) * limit).limit(limit),
        CustomMovie.countDocuments({ $or: [{ title: regex }, { description: regex }] })
    ]);
    res.json({
        source: 'custom',
        results: items.map(toCard),
        total_pages: Math.ceil(total / limit)
    });
};

exports.create = async (req, res) => {
    const body = req.body;
    if (!body.title || !body.videoUrl) {
        return res.status(400).json({ error: 'Thiếu title hoặc videoUrl' });
    }
    let slug = body.slug || slugify(body.title);
    const existing = await CustomMovie.findOne({ slug });
    if (existing) slug = `${slug}-${Date.now().toString().slice(-5)}`;
    const movie = await CustomMovie.create({ ...body, slug });
    res.status(201).json(movie);
};

exports.update = async (req, res) => {
    const movie = await CustomMovie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(movie);
};

exports.remove = async (req, res) => {
    await CustomMovie.findByIdAndDelete(req.params.id);
    res.json({ success: true });
};

exports.adminList = async (req, res) => {
    const items = await CustomMovie.find().sort({ createdAt: -1 });
    res.json(items);
};

function toCard(m) {
    return {
        id: m.slug,
        _id: m._id,
        title: m.title,
        poster_path: m.poster,
        backdrop_path: m.backdrop,
        release_date: m.year?.toString(),
        vote_average: 0,
        overview: m.description?.slice(0, 200),
        source: 'custom',
        quality: m.quality,
        episode_current: m.isSeries ? `${m.episodes?.length || 0} tập` : 'Full'
    };
}
