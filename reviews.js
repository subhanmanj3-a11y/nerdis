const express = require('express');
const router  = express.Router();

const {
  getDealReviews,
  createReview,
  updateReview,
  deleteReview,
  toggleHelpful,
  flagReview,
  replyToReview,
  getMyReviews
} = require('../controllers/reviewController');

const { protect, optionalAuth, businessOnly } = require('../middleware/auth');
const { reviewImageUpload }                   = require('../middleware/upload');
const { reviewLimiter }                       = require('../middleware/rateLimiter');
const {
  validateReview,
  validateMongoId,
  validatePagination
} = require('../middleware/validate');

// ─── Public / Optional Auth ───────────────────────────────────────────────────
router.get('/deal/:dealId',
  optionalAuth,
  ...validateMongoId('dealId'),
  validatePagination,
  getDealReviews
);

// ─── Protected: My Reviews ────────────────────────────────────────────────────
router.get('/my', protect, validatePagination, getMyReviews);

// ─── Protected: Create Review ─────────────────────────────────────────────────
router.post('/deal/:dealId',
  protect,
  reviewLimiter,
  ...validateMongoId('dealId'),
  ...reviewImageUpload,
  validateReview,
  createReview
);

// ─── Protected: Update / Delete Review ───────────────────────────────────────
router.put('/:id',
  protect,
  ...validateMongoId('id'),
  ...reviewImageUpload,
  validateReview,
  updateReview
);

router.delete('/:id',
  protect,
  ...validateMongoId('id'),
  deleteReview
);

// ─── Protected: Helpful Vote ──────────────────────────────────────────────────
router.post('/:id/helpful',
  protect,
  ...validateMongoId('id'),
  toggleHelpful
);

// ─── Protected: Flag Review ───────────────────────────────────────────────────
router.post('/:id/flag',
  protect,
  ...validateMongoId('id'),
  flagReview
);

// ─── Protected: Business Reply ────────────────────────────────────────────────
router.post('/:id/reply',
  ...businessOnly,
  ...validateMongoId('id'),
  replyToReview
);

module.exports = router;
