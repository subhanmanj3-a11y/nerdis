const { body, param, query, validationResult } = require('express-validator');

// ─── Handle Validation Results ────────────────────────────────────────────────
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg
      }))
    });
  }
  next();
};

// ─── Auth Validators ──────────────────────────────────────────────────────────
const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),

  body('role')
    .optional()
    .isIn(['user', 'business']).withMessage('Role must be user or business'),

  handleValidation
];

const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),

  handleValidation
];

const validatePasswordReset = [
  body('password')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number'),

  handleValidation
];

// ─── Deal Validators ──────────────────────────────────────────────────────────
const validateCreateDeal = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 5, max: 120 }).withMessage('Title must be 5–120 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),

  body('category')
    .notEmpty().withMessage('Category is required')
    .isIn(['Food', 'Clothes', 'Cosmetics', 'Electronics', 'Health', 'Services', 'Others'])
    .withMessage('Invalid category'),

  body('discountPercent')
    .notEmpty().withMessage('Discount percentage is required')
    .isFloat({ min: 1, max: 100 }).withMessage('Discount must be between 1–100%'),

  body('originalPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Original price must be a positive number'),

  body('discountedPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Discounted price must be a positive number'),

  body('dealType')
    .optional()
    .isIn(['local', 'online', 'both']).withMessage('Deal type must be local, online, or both'),

  body('expiresAt')
    .notEmpty().withMessage('Expiry date is required')
    .isISO8601().withMessage('Expiry must be a valid date')
    .custom((val) => {
      if (new Date(val) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),

  body('externalLink')
    .optional()
    .isURL().withMessage('External link must be a valid URL'),

  body('couponCode')
    .optional()
    .trim()
    .isLength({ max: 30 }).withMessage('Coupon code cannot exceed 30 characters'),

  body('isFlashDeal')
    .optional()
    .isBoolean().withMessage('isFlashDeal must be true or false'),

  body('isLimitedStock')
    .optional()
    .isBoolean().withMessage('isLimitedStock must be true or false'),

  body('stockCount')
    .optional()
    .isInt({ min: 0 }).withMessage('Stock count must be a non-negative integer'),

  body('location.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 }).withMessage('Coordinates must be [longitude, latitude]'),

  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array')
    .custom((tags) => {
      if (tags.some((t) => typeof t !== 'string' || t.length > 30)) {
        throw new Error('Each tag must be a string under 30 characters');
      }
      return true;
    }),

  handleValidation
];

const validateUpdateDeal = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 120 }).withMessage('Title must be 5–120 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),

  body('category')
    .optional()
    .isIn(['Food', 'Clothes', 'Cosmetics', 'Electronics', 'Health', 'Services', 'Others'])
    .withMessage('Invalid category'),

  body('discountPercent')
    .optional()
    .isFloat({ min: 1, max: 100 }).withMessage('Discount must be 1–100%'),

  body('expiresAt')
    .optional()
    .isISO8601().withMessage('Expiry must be a valid date')
    .custom((val) => {
      if (new Date(val) <= new Date()) throw new Error('Expiry must be in the future');
      return true;
    }),

  body('externalLink')
    .optional()
    .isURL().withMessage('Must be a valid URL'),

  handleValidation
];

// ─── Review Validators ────────────────────────────────────────────────────────
const validateReview = [
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),

  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Comment cannot exceed 500 characters'),

  body('worthIt')
    .optional()
    .isBoolean().withMessage('worthIt must be true or false'),

  handleValidation
];

// ─── Business Validators ──────────────────────────────────────────────────────
const validateBusinessSetup = [
  body('businessName')
    .trim()
    .notEmpty().withMessage('Business name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),

  body('category')
    .notEmpty().withMessage('Category is required')
    .isIn(['Food', 'Clothes', 'Cosmetics', 'Electronics', 'Health', 'Services', 'Others'])
    .withMessage('Invalid category'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),

  body('phone')
    .optional()
    .matches(/^\+?[\d\s\-()]{7,15}$/).withMessage('Invalid phone number'),

  body('email')
    .optional()
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),

  body('website')
    .optional()
    .isURL().withMessage('Invalid website URL'),

  handleValidation
];

// ─── Query Validators ─────────────────────────────────────────────────────────
const validateNearbyQuery = [
  query('lat')
    .notEmpty().withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),

  query('lng')
    .notEmpty().withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),

  query('radius')
    .optional()
    .isFloat({ min: 100, max: 50000 }).withMessage('Radius must be between 100m and 50km'),

  handleValidation
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

  handleValidation
];

// ─── Param Validators ─────────────────────────────────────────────────────────
const validateMongoId = (paramName = 'id') => [
  param(paramName)
    .isMongoId().withMessage(`Invalid ${paramName} format`),

  handleValidation
];

// ─── Bookmark Validator ───────────────────────────────────────────────────────
const validateBookmark = [
  param('dealId')
    .isMongoId().withMessage('Invalid deal ID'),

  handleValidation
];

// ─── Saved Location Validator ─────────────────────────────────────────────────
const validateSavedLocation = [
  body('label')
    .optional()
    .isIn(['home', 'work', 'other']).withMessage('Label must be home, work, or other'),

  body('name')
    .trim()
    .notEmpty().withMessage('Location name is required')
    .isLength({ max: 100 }).withMessage('Location name cannot exceed 100 characters'),

  body('coordinates')
    .isArray({ min: 2, max: 2 }).withMessage('Coordinates must be [longitude, latitude]')
    .custom(([lng, lat]) => {
      if (lng < -180 || lng > 180) throw new Error('Longitude must be -180 to 180');
      if (lat < -90  || lat > 90)  throw new Error('Latitude must be -90 to 90');
      return true;
    }),

  handleValidation
];

module.exports = {
  handleValidation,
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validateCreateDeal,
  validateUpdateDeal,
  validateReview,
  validateBusinessSetup,
  validateNearbyQuery,
  validatePagination,
  validateMongoId,
  validateBookmark,
  validateSavedLocation
};
