const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

// ─── Cloudinary Configuration ─────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// ─── Allowed File Types ───────────────────────────────────────────────────────
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ─── Deal Images Storage ──────────────────────────────────────────────────────
const dealStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neardis/deals',
    allowed_formats: ALLOWED_FORMATS,
    transformation: [
      { width: 800, height: 600, crop: 'limit', quality: 'auto:good' },
      { fetch_format: 'auto' }
    ],
    public_id: (req, file) => {
      const name = path.parse(file.originalname).name.replace(/\s+/g, '-');
      return `deal-${Date.now()}-${name}`;
    }
  }
});

// ─── Business Logo Storage ────────────────────────────────────────────────────
const businessStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neardis/businesses',
    allowed_formats: ALLOWED_FORMATS,
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto:good' },
      { fetch_format: 'auto' }
    ],
    public_id: (req, file) => {
      return `business-${req.user?.id || 'unknown'}-${Date.now()}`;
    }
  }
});

// ─── Avatar Storage ───────────────────────────────────────────────────────────
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neardis/avatars',
    allowed_formats: ALLOWED_FORMATS,
    transformation: [
      { width: 200, height: 200, crop: 'fill', gravity: 'face', quality: 'auto:good' },
      { fetch_format: 'auto' }
    ],
    public_id: (req, file) => {
      return `avatar-${req.user?.id || 'unknown'}-${Date.now()}`;
    }
  }
});

// ─── File Filter ──────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (ALLOWED_FORMATS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(`Invalid file type. Allowed: ${ALLOWED_FORMATS.join(', ')}`),
      false
    );
  }
};

// ─── Multer Instances ─────────────────────────────────────────────────────────
const uploadDealImage = multer({
  storage: dealStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

const uploadBusinessLogo = multer({
  storage: businessStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

// ─── Cloudinary Helpers ───────────────────────────────────────────────────────

/**
 * Delete an image from Cloudinary by its public_id
 * @param {string} publicId
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
    throw err;
  }
};

/**
 * Extract public_id from a Cloudinary URL
 * @param {string} url - Full Cloudinary URL
 * @returns {string} public_id
 */
const extractPublicId = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;
  // Remove version segment if present (v1234567890)
  const relevantParts = parts.slice(uploadIndex + 1).filter(p => !/^v\d+$/.test(p));
  const filename = relevantParts[relevantParts.length - 1].split('.')[0];
  relevantParts[relevantParts.length - 1] = filename;
  return relevantParts.join('/');
};

/**
 * Upload a base64 image directly (for cases without multipart)
 * @param {string} base64Data
 * @param {string} folder
 */
const uploadBase64 = async (base64Data, folder = 'neardis/misc') => {
  try {
    const result = await cloudinary.uploader.upload(base64Data, {
      folder,
      transformation: [{ quality: 'auto:good' }, { fetch_format: 'auto' }]
    });
    return result;
  } catch (err) {
    console.error('Cloudinary base64 upload error:', err.message);
    throw err;
  }
};

module.exports = {
  cloudinary,
  uploadDealImage,
  uploadBusinessLogo,
  uploadAvatar,
  deleteImage,
  extractPublicId,
  uploadBase64
};
