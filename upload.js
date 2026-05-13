const multer = require('multer');
const path = require('path');
const {
  uploadDealImage,
  uploadBusinessLogo,
  uploadAvatar
} = require('../config/cloudinary');

// ─── Max file counts ──────────────────────────────────────────────────────────
const MAX_DEAL_IMAGES    = 5;
const MAX_REVIEW_IMAGES  = 3;
const MAX_VERIFY_DOCS    = 3;

// ─── Error Handler Wrapper ────────────────────────────────────────────────────
// Wraps multer middleware to catch errors and forward them properly
const handleMulterError = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB per file.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: `Too many files. Maximum allowed is ${err.field === 'images' ? MAX_DEAL_IMAGES : MAX_REVIEW_IMAGES}.`
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: `Unexpected field: ${err.field}. Please use the correct field name.`
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    }

    // Custom file filter errors
    if (err.message && err.message.includes('Invalid file type')) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    next(err);
  });
};

// ─── Deal Images Upload ───────────────────────────────────────────────────────
// Field: "images" — up to 5 files
const uploadDealImages = handleMulterError(
  uploadDealImage.array('images', MAX_DEAL_IMAGES)
);

// Single deal image
const uploadSingleDealImage = handleMulterError(
  uploadDealImage.single('image')
);

// ─── Business Logo Upload ─────────────────────────────────────────────────────
// Field: "logo" — single file
const uploadBusinessLogoMiddleware = handleMulterError(
  uploadBusinessLogo.single('logo')
);

// ─── Cover Image Upload ───────────────────────────────────────────────────────
const uploadCoverImage = handleMulterError(
  uploadBusinessLogo.single('coverImage')
);

// ─── Avatar Upload ────────────────────────────────────────────────────────────
// Field: "avatar" — single file
const uploadAvatarMiddleware = handleMulterError(
  uploadAvatar.single('avatar')
);

// ─── Review Images Upload ─────────────────────────────────────────────────────
// Field: "images" — up to 3 files
const uploadReviewImages = handleMulterError(
  uploadDealImage.array('images', MAX_REVIEW_IMAGES)
);

// ─── Verification Documents Upload ───────────────────────────────────────────
// Field: "docs" — up to 3 files
const uploadVerificationDocs = handleMulterError(
  uploadBusinessLogo.array('docs', MAX_VERIFY_DOCS)
);

// ─── Post-upload Normalizer ───────────────────────────────────────────────────
// Attaches a normalized `req.uploadedFiles` array for easy downstream use
const normalizeUploads = (req, res, next) => {
  const files = [];

  if (req.file) {
    files.push({
      url:      req.file.path,       // Cloudinary URL
      publicId: req.file.filename    // Cloudinary public_id
    });
  }

  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach((f) => {
        files.push({
          url:      f.path,
          publicId: f.filename
        });
      });
    } else {
      // Fields object (multer.fields)
      Object.values(req.files).flat().forEach((f) => {
        files.push({
          url:      f.path,
          publicId: f.filename
        });
      });
    }
  }

  req.uploadedFiles = files;
  next();
};

// ─── Optional Upload ──────────────────────────────────────────────────────────
// Wraps any upload middleware to make it non-blocking if no file is sent
const optionalUpload = (middleware) => (req, res, next) => {
  middleware(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

// ─── Combined Middlewares ─────────────────────────────────────────────────────
const dealImageUpload      = [uploadDealImages,              normalizeUploads];
const singleDealImgUpload  = [uploadSingleDealImage,         normalizeUploads];
const businessLogoUpload   = [uploadBusinessLogoMiddleware,  normalizeUploads];
const coverImageUpload     = [uploadCoverImage,              normalizeUploads];
const avatarUpload         = [uploadAvatarMiddleware,        normalizeUploads];
const reviewImageUpload    = [uploadReviewImages,            normalizeUploads];
const verificationUpload   = [uploadVerificationDocs,        normalizeUploads];

module.exports = {
  dealImageUpload,
  singleDealImgUpload,
  businessLogoUpload,
  coverImageUpload,
  avatarUpload,
  reviewImageUpload,
  verificationUpload,
  normalizeUploads,
  optionalUpload
};
