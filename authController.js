const crypto = require('crypto');
const User = require('../models/User');
const Business = require('../models/Business');

// ─── Helper: Send Token Response ─────────────────────────────────────────────
const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const token = user.generateAuthToken();
  res.status(statusCode).json({
    success: true,
    message,
    token,
    user: user.toSafeObject()
  });
};

// ─── @route   POST /api/auth/register ────────────────────────────────────────
// @desc    Register new user or business account
// @access  Public
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    // Create user
    const user = await User.create({ name, email, password, role, phone });

    // If registering as business, create a placeholder Business profile
    if (role === 'business') {
      await Business.create({
        owner: user._id,
        businessName: name,
        category: 'Others',
        verificationStatus: 'pending'
      });
    }

    sendTokenResponse(user, 201, res, 'Account created successfully.');
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/auth/login ───────────────────────────────────────────
// @desc    Login user and return JWT
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Fetch user with password field (normally excluded)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: `Account suspended. Reason: ${user.banReason || 'Policy violation.'}`
      });
    }

    sendTokenResponse(user, 200, res, 'Logged in successfully.');
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/auth/me ────────────────────────────────────────────────
// @desc    Get current logged-in user profile
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('bookmarks', 'title thumbnail discountPercent status');

    res.status(200).json({
      success: true,
      user: user.toSafeObject()
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/auth/me ────────────────────────────────────────────────
// @desc    Update current user profile
// @access  Private
const updateMe = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'phone', 'theme', 'notificationsEnabled', 'fcmToken'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Handle avatar upload
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      const { deleteImage } = require('../config/cloudinary');

      // Delete old avatar if exists
      if (req.user.avatarPublicId) {
        await deleteImage(req.user.avatarPublicId).catch(() => {});
      }

      updates.avatar          = req.uploadedFiles[0].url;
      updates.avatarPublicId  = req.uploadedFiles[0].publicId;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated.',
      user: user.toSafeObject()
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/auth/logout ──────────────────────────────────────────
// @desc    Logout (client should discard token; optionally clear FCM token)
// @access  Private
const logout = async (req, res, next) => {
  try {
    // Clear FCM token on logout to stop push notifications
    await User.findByIdAndUpdate(req.user._id, { fcmToken: null });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/auth/forgot-password ─────────────────────────────────
// @desc    Send password reset email
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Respond with success to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: 'If that email is registered, a reset link has been sent.'
      });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // In production, send this via email (nodemailer)
    const resetUrl = `${process.env.CLIENT_ORIGIN}/pages/reset-password.html?token=${resetToken}`;

    // TODO: integrate nodemailer here
    console.log(`[DEV] Password reset URL: ${resetUrl}`);

    res.status(200).json({
      success: true,
      message: 'If that email is registered, a reset link has been sent.',
      // Only expose token in dev for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/auth/reset-password/:token ────────────────────────────
// @desc    Reset password using token
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken:   hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired.'
      });
    }

    user.password             = req.body.password;
    user.passwordResetToken   = null;
    user.passwordResetExpires = null;
    await user.save();

    sendTokenResponse(user, 200, res, 'Password reset successfully.');
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/auth/change-password ──────────────────────────────────
// @desc    Change password (logged in user)
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.'
      });
    }

    user.password = newPassword;
    await user.save();

    sendTokenResponse(user, 200, res, 'Password changed successfully.');
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/auth/saved-locations ─────────────────────────────────
// @desc    Add a saved location (home/work/other)
// @access  Private
const addSavedLocation = async (req, res, next) => {
  try {
    const { label, name, coordinates } = req.body;

    const user = await User.findById(req.user._id);

    // Replace existing location with same label
    user.savedLocations = user.savedLocations.filter((l) => l.label !== label);
    user.savedLocations.push({ label, name, coordinates });

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Location saved.',
      savedLocations: user.savedLocations
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   DELETE /api/auth/saved-locations/:label ────────────────────────
// @desc    Remove a saved location
// @access  Private
const removeSavedLocation = async (req, res, next) => {
  try {
    const { label } = req.params;

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { savedLocations: { label } }
    });

    res.status(200).json({
      success: true,
      message: `Saved location '${label}' removed.`
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/auth/fcm-token ────────────────────────────────────────
// @desc    Update Firebase Cloud Messaging token
// @access  Private
const updateFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'FCM token is required.' });
    }

    await User.findByIdAndUpdate(req.user._id, { fcmToken });

    res.status(200).json({ success: true, message: 'FCM token updated.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
