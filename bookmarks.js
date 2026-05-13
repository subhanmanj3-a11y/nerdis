const express = require('express');
const router  = express.Router();

const {
  getBookmarks,
  addBookmark,
  removeBookmark,
  checkBookmark,
  clearBookmarks
} = require('../controllers/bookmarkController');

const { protect }            = require('../middleware/auth');
const { validateMongoId, validatePagination } = require('../middleware/validate');

// All bookmark routes require authentication
router.use(protect);

// ─── Get all bookmarks ────────────────────────────────────────────────────────
router.get('/', validatePagination, getBookmarks);

// ─── Clear all bookmarks ──────────────────────────────────────────────────────
router.delete('/', clearBookmarks);

// ─── Check if a deal is bookmarked ───────────────────────────────────────────
router.get('/check/:dealId', ...validateMongoId('dealId'), checkBookmark);

// ─── Add bookmark ─────────────────────────────────────────────────────────────
router.post('/:dealId', ...validateMongoId('dealId'), addBookmark);

// ─── Remove bookmark ──────────────────────────────────────────────────────────
router.delete('/:dealId', ...validateMongoId('dealId'), removeBookmark);

module.exports = router;
