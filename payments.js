const express = require('express');
const router  = express.Router();

const {
  getPlans,
  createSubscription,
  boostDeal,
  localPayment,
  stripeWebhook,
  getMyPayments,
  cancelSubscription
} = require('../controllers/paymentController');

const { protect, businessOnly } = require('../middleware/auth');
const { paymentLimiter }        = require('../middleware/rateLimiter');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/plans', getPlans);

// ─── Stripe Webhook (raw body — mounted before express.json in index.js) ─────
router.post('/webhook', stripeWebhook);

// ─── Protected: Business Payment Routes ──────────────────────────────────────
router.post('/subscribe',          ...businessOnly, paymentLimiter, createSubscription);
router.post('/boost',              ...businessOnly, paymentLimiter, boostDeal);
router.post('/local',              ...businessOnly, paymentLimiter, localPayment);
router.post('/cancel-subscription',...businessOnly,                 cancelSubscription);
router.get('/my',                  ...businessOnly,                 getMyPayments);

module.exports = router;
