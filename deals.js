const express = require('express');
const router  = express.Router();

const {
  getDeals,
  getNearbyDeals,
  getFlashDeals,
  getOnlineDeals,
  getSurpriseDeal,
  getDeal,
  createDeal,
  updateDeal,
  deleteDeal,
  reportSighting,
  trackClick,
  trackShare,
  getDealsForMap
} = require('../controllers/dealController');

const { protect, optionalAuth, isDealOwner, businessOnly } = require('../middleware/auth');
const { dealImageUpload }                                   = require('../middleware/upload');
const { dealCreateLimiter, sightingLimiter }               = require('../middleware/rateLimiter');
const {
  validateCreateDeal,
  validateUpdateDeal,
  validateNearbyQuery,
  validatePagination,
  validateMongoId
} = require('../middleware/validate');

// ─── Public / Optional Auth Routes ───────────────────────────────────────────
router.get('/',         optionalAuth, validatePagination, getDeals);
router.get('/nearby',   optionalAuth, validateNearbyQuery, getNearbyDeals);
router.get('/flash',    optionalAuth, getFlashDeals);
router.get('/online',   optionalAuth, validatePagination, getOnlineDeals);
router.get('/surprise', optionalAuth, getSurpriseDeal);
router.get('/map',      optionalAuth, getDealsForMap);
router.get('/:id',      optionalAuth, ...validateMongoId('id'), getDeal);

// ─── Analytics Tracking (public) ─────────────────────────────────────────────
router.post('/:id/click', ...validateMongoId('id'), trackClick);
router.post('/:id/share', ...validateMongoId('id'), trackShare);

// ─── Protected: Sighting ──────────────────────────────────────────────────────
router.post('/:id/sighting',
  protect,
  sightingLimiter,
  ...validateMongoId('id'),
  reportSighting
);

// ─── Protected: Create Deal (business only) ───────────────────────────────────
router.post('/',
  ...businessOnly,
  dealCreateLimiter,
  ...dealImageUpload,
  validateCreateDeal,
  createDeal
);

// ─── Protected: Update / Delete Deal ─────────────────────────────────────────
router.put('/:id',
  protect,
  isDealOwner,
  ...dealImageUpload,
  validateUpdateDeal,
  updateDeal
);

router.delete('/:id',
  protect,
  isDealOwner,
  deleteDeal
);

module.exports = router;
