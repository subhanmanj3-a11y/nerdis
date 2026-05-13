const User = require('../models/User');
const Business = require('../models/Business');
const Deal = require('../models/Deal');
const Review = require('../models/Review');
const Payment = require('../models/Payment');

// ─── @route   GET /api/admin/dashboard ───────────────────────────────────────
// @desc    Get platform-wide stats for admin dashboard
// @access  Admin
const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalBusinesses,
      totalDeals,
      activeDeals,
      pendingDeals,
      totalReviews,
      flaggedReviews,
      newUsersThisMonth,
      newDealsThisWeek,
      pendingVerifications,
      totalRevenue
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Business.countDocuments(),
      Deal.countDocuments(),
      Deal.countDocuments({ status: 'active', expiresAt: { $gt: now } }),
      Deal.countDocuments({ status: 'pending' }),
      Review.countDocuments(),
      Review.countDocuments({ isFlagged: true, isApproved: true }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Deal.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Business.countDocuments({ verificationStatus: 'pending', isVerified: false }),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Monthly new users (last 6 months)
    const monthlyUsers = await User.aggregate([
      { $match: { createdAt: { $gte: new Date(now - 180 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Category breakdown
    const categoryBreakdown = await Deal.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalBusinesses,
        totalDeals,
        activeDeals,
        pendingDeals,
        totalReviews,
        flaggedReviews,
        newUsersThisMonth,
        newDealsThisWeek,
        pendingVerifications,
        totalRevenue: totalRevenue[0]?.total || 0,
        monthlyUsers,
        categoryBreakdown
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/admin/deals ───────────────────────────────────────────
// @desc    Get all deals with filters (admin view)
// @access  Admin
const getAllDeals = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = {};

    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search)   filter.$text    = { $search: req.query.search };

    const [deals, total] = await Promise.all([
      Deal.find(filter)
        .populate('business', 'businessName isVerified')
        .populate('postedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Deal.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      deals
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/deals/:id/approve ───────────────────────────────
// @desc    Approve a pending deal
// @access  Admin
const approveDeal = async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });

    if (deal.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Deal is already ${deal.status}.` });
    }

    deal.status      = 'active';
    deal.approvedBy  = req.user._id;
    deal.approvedAt  = new Date();
    await deal.save();

    res.status(200).json({ success: true, message: 'Deal approved and is now live.', deal });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/deals/:id/reject ────────────────────────────────
// @desc    Reject a pending deal
// @access  Admin
const rejectDeal = async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });

    deal.status          = 'rejected';
    deal.rejectionReason = req.body.reason || 'Does not meet platform guidelines.';
    await deal.save();

    res.status(200).json({ success: true, message: 'Deal rejected.', deal });
  } catch (err) {
    next(err);
  }
};

// ─── @route   DELETE /api/admin/deals/:id ────────────────────────────────────
// @desc    Force-delete any deal
// @access  Admin
const adminDeleteDeal = async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });

    const { deleteImage } = require('../config/cloudinary');
    for (const img of deal.images) {
      if (img.publicId) await deleteImage(img.publicId).catch(() => {});
    }

    await deal.deleteOne();
    res.status(200).json({ success: true, message: 'Deal deleted by admin.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/admin/users ───────────────────────────────────────────
// @desc    Get all users
// @access  Admin
const getAllUsers = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.role)    filter.role    = req.query.role;
    if (req.query.banned)  filter.isBanned = req.query.banned === 'true';
    if (req.query.search) {
      filter.$or = [
        { name:  { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), users });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/users/:id/ban ───────────────────────────────────
// @desc    Ban a user
// @access  Admin
const banUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot ban another admin.' });
    }

    user.isBanned  = true;
    user.banReason = req.body.reason || 'Policy violation.';
    await user.save();

    res.status(200).json({ success: true, message: `User ${user.email} has been banned.` });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/users/:id/unban ─────────────────────────────────
// @desc    Unban a user
// @access  Admin
const unbanUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    user.isBanned  = false;
    user.banReason = null;
    await user.save();

    res.status(200).json({ success: true, message: `User ${user.email} has been unbanned.` });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/users/:id/role ──────────────────────────────────
// @desc    Change user role
// @access  Admin
const changeUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user', 'business', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.status(200).json({ success: true, message: `Role updated to ${role}.`, user });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/admin/businesses ──────────────────────────────────────
// @desc    Get all businesses (admin view)
// @access  Admin
const getAllBusinesses = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.verified) filter.isVerified         = req.query.verified === 'true';
    if (req.query.status)   filter.verificationStatus = req.query.status;
    if (req.query.banned)   filter.isBanned           = req.query.banned === 'true';

    const [businesses, total] = await Promise.all([
      Business.find(filter)
        .populate('owner', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Business.countDocuments(filter)
    ]);

    res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), businesses });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/businesses/:id/verify ───────────────────────────
// @desc    Approve business verification
// @access  Admin
const verifyBusiness = async (req, res, next) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    business.isVerified         = true;
    business.verificationStatus = 'approved';
    await business.save();

    // Also update user role to 'business' if not already
    await User.findByIdAndUpdate(business.owner, { role: 'business' });

    res.status(200).json({ success: true, message: 'Business verified.', business });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/businesses/:id/reject ───────────────────────────
// @desc    Reject business verification
// @access  Admin
const rejectBusinessVerification = async (req, res, next) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    business.verificationStatus = 'rejected';
    await business.save();

    res.status(200).json({ success: true, message: 'Business verification rejected.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/businesses/:id/ban ──────────────────────────────
// @desc    Ban a business
// @access  Admin
const banBusiness = async (req, res, next) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    business.isBanned   = true;
    business.isActive   = false;
    business.banReason  = req.body.reason || 'Policy violation.';
    await business.save();

    // Pause all active deals
    await Deal.updateMany(
      { business: business._id, status: 'active' },
      { $set: { status: 'paused' } }
    );

    res.status(200).json({ success: true, message: 'Business banned and deals paused.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/admin/reviews/flagged ─────────────────────────────────
// @desc    Get all flagged reviews
// @access  Admin
const getFlaggedReviews = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ isFlagged: true })
        .populate('user',     'name email avatar')
        .populate('deal',     'title thumbnail')
        .populate('business', 'businessName')
        .populate('flaggedBy','name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ isFlagged: true })
    ]);

    res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), reviews });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/admin/reviews/:id/approve ─────────────────────────────
// @desc    Approve a flagged review (keep it)
// @access  Admin
const approveReview = async (req, res, next) => {
  try {
    await Review.findByIdAndUpdate(req.params.id, {
      isFlagged:  false,
      isApproved: true,
      flagReason: null,
      flaggedBy:  null
    });
    res.status(200).json({ success: true, message: 'Review approved.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   DELETE /api/admin/reviews/:id ──────────────────────────────────
// @desc    Delete a review (admin moderation)
// @access  Admin
const adminDeleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    await review.deleteOne();
    res.status(200).json({ success: true, message: 'Review deleted.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/admin/payments ────────────────────────────────────────
// @desc    Get all payments
// @access  Admin
const getAllPayments = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status)  filter.status  = req.query.status;
    if (req.query.gateway) filter.gateway = req.query.gateway;
    if (req.query.type)    filter.type    = req.query.type;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('business', 'businessName')
        .populate('user',     'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter)
    ]);

    res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), payments });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboardStats,
  getAllDeals,
  approveDeal,
  rejectDeal,
  adminDeleteDeal,
  getAllUsers,
  banUser,
  unbanUser,
  changeUserRole,
  getAllBusinesses,
  verifyBusiness,
  rejectBusinessVerification,
  banBusiness,
  getFlaggedReviews,
  approveReview,
  adminDeleteReview,
  getAllPayments
};
