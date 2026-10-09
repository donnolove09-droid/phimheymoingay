const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/multiApiController');

router.get('/aggregate', ctrl.aggregate);

router.get('/nguonc/new', ctrl.nguoncNew);
router.get('/nguonc/movie/:slug', ctrl.nguoncDetail);

router.get('/kkphim/new', ctrl.kkphimNew);
router.get('/kkphim/movie/:slug', ctrl.kkphimDetail);

router.get('/ophim/new', ctrl.ophimNew);
router.get('/ophim/movie/:slug', ctrl.ophimDetail);

module.exports = router;
