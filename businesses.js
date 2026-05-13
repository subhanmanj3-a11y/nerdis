const express = require('express');
const router  = express.Router();

const {
  getBusinesses,
  getBusiness,
  getMyBusiness,
  updateMyBusiness,
  updateCoverImage,
  updateOccupancy,
  getAnalytics,
  getBusinessDeals,
  getMyDeals,
  submitVerification
} = require('../controllers/businessController');

const { protect, optionalAuth, businessOnly }      = require('../middleware/auth');
const { businessLogoUpload, coverImageUpload, verificationUpload } = require('../middleware/upload');
const { validateBusinessSetup, validateMongoId, validatePagination } = require('../middleware/validate');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/',     optionalAuth, validatePagination, getBusinesses);
router.get('/:id',  optionalAuth, ...validateMongoId('id'), getBusiness);
router.get('/:id/deals', optionalAuth, ...validateMongoId('id'), validatePagination, getBusinessDeals);

// ─── Protected: My Business ───────────────────────────────────────────────────
router.get('/me/profile',   ...businessOnly,                                    getMyBusiness);
router.put('/me/profile',   ...businessOnly, ...businessLogoUpload, validateBusinessSetup, updateMyBusiness);
router.put('/me/cover',     ...businessOnly, ...coverImageUpload,               updateCoverImage);
router.put('/me/occupancy', ...businessOnly,                                    updateOccupancy);
router.get('/me/analytics', ...businessOnly,                                    getAnalytics);
router.get('/me/deals',     ...businessOnly, validatePagination,                getMyDeals);
router.post('/me/verify',   ...businessOnly, ...verificationUpload,             submitVerification);

module.exports = router;
