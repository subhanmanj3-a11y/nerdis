const rateLimit = require('express-rate-limit');

// ─── Helper: Standard Rate Limit Response ─────────────────────────────────────
const limitMessage = (action) => ({
  success: false,
  message: `Too many ${action} attempts. Please try again later.`
});

// ─── Auth Limiter ─────────────────────────────────────────────────────────────
// Strict: 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('login/signup'),
  skipSuccessfulRequests: true // Only count failed attempts
});

// ─── Password Reset Limiter ───────────────────────────────────────────────────
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('password reset')
});

// ─── Deal Creation Limiter ────────────────────────────────────────────────────
// Prevent spam posting: 20 deals per hour per IP
const dealCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('deal creation'),
  keyGenerator: (req) => req.user?.id || req.ip // Per user if authenticated
});

// ─── Review Limiter ───────────────────────────────────────────────────────────
// 10 reviews per hour per user
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('review submission'),
  keyGenerator: (req) => req.user?.id || req.ip
});

// ─── Search Limiter ───────────────────────────────────────────────────────────
// 60 searches per minute per IP
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('search')
});

// ─── Upload Limiter ───────────────────────────────────────────────────────────
// 30 uploads per hour per user
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('file upload'),
  keyGenerator: (req) => req.user?.id || req.ip
});

// ─── Sighting Limiter ─────────────────────────────────────────────────────────
// 5 sightings per deal per hour per user (anti-spam)
const sightingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('sighting report'),
  keyGenerator: (req) => `${req.user?.id || req.ip}:${req.params.id}`
});

// ─── Notification Limiter ────────────────────────────────────────────────────
// 20 notification triggers per hour
const notificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('notification')
});

// ─── Payment Limiter ──────────────────────────────────────────────────────────
// 10 payment attempts per 30 minutes per user
const paymentLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('payment'),
  keyGenerator: (req) => req.user?.id || req.ip
});

// ─── General API Limiter ──────────────────────────────────────────────────────
// 200 requests per 15 minutes (applied globally in index.js)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('API request')
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  dealCreateLimiter,
  reviewLimiter,
  searchLimiter,
  uploadLimiter,
  sightingLimiter,
  notificationLimiter,
  paymentLimiter,
  generalLimiter
};
