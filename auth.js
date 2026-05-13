const express = require('express');
const router  = express.Router();

const {
  register,
  login,
  getMe,
  updateMe,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  addSavedLocation,
  removeSavedLocation,
  updateFcmToken
} = require('../controllers/authController');

const { protect }                               = require('../middleware/auth');
const { avatarUpload }                          = require('../middleware/upload');
const { passwordResetLimiter }                  = require('../middleware/rateLimiter');
const {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validateSavedLocation
} = require('../middleware/validate');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.post('/register', validateRegister,                        register);
router.post('/login',    validateLogin,                           login);
router.post('/forgot-password', passwordResetLimiter,             forgotPassword);
router.put('/reset-password/:token', validatePasswordReset,       resetPassword);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.get('/me',       protect,                                  getMe);
router.put('/me',       protect, ...avatarUpload,                 updateMe);
router.post('/logout',  protect,                                  logout);

router.put('/change-password', protect,                           changePassword);
router.put('/fcm-token',       protect,                           updateFcmToken);

// ─── Saved Locations ──────────────────────────────────────────────────────────
router.post('/saved-locations',          protect, validateSavedLocation, addSavedLocation);
router.delete('/saved-locations/:label', protect,                        removeSavedLocation);

module.exports = router;
