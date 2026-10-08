const express = require('express');
const ctrl = require('../controllers/phimapiController');
const router = express.Router();

router.get('/new', ctrl.getNewMovies);
router.get('/movie/:slug', ctrl.getMovieDetail);

module.exports = router;
