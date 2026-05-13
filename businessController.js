const Business = require('../models/Business');
const Deal = require('../models/Deal');
const User = require('../models/User');
const { deleteImage } = require('../config/cloudinary');

// ─── @route   GET /api/businesses ────────────────────────────────────────────
// @desc    Get all verified businesses (paginated)
// @access  Public
const getBusinesses = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { isActive: true, isBanned: false };
    if (req.query.category)   filter.category = req.query.category;
    if (req.query.verified)   filter.isVerified = req.query.verified === 'true';
    if (req.query.search)     filter.$text = { $search: req.query.search };

    const [businesses, total] = await Promise.all([
      Business.find(filter)
        .select('-verificationDocs -subscription.stripeCustomerId -subscription.stripeSubscriptionId')
        .sort({ isVerified: -1, averageRating: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Business.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      businesses
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/businesses/:id ────────────────────────────────────────
// @desc    Get single business profile
// @access  Public
const getBusiness = async (req, res, next) => {
  try {
    const business = await Business.findById(req.params.id)
      .select('-verificationDocs -subscription.stripeCustomerId -subscription.stripeSubscriptionId')
      .populate('owner', 'name email avatar createdAt')
      .lean();

    if (!business || business.isBanned) {
      return res.status(404).json({ success: false, message: 'Business not found.' });
    }

    // Get active deal count
    const activeDeals = await Deal.countDocuments({
      business: business._id,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });

    res.status(200).json({
      success: true,
      business: { ...business, activeDeals }
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/businesses/me ─────────────────────────────────────────
// @desc    Get current user's business profile
// @access  Private (business)
const getMyBusiness = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });

    if (!business) {
      return res.status(404).json({ success: false, message: 'No business profile found.' });
    }

    res.status(200).json({ success: true, business });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/businesses/me ─────────────────────────────────────────
// @desc    Update own business profile
// @access  Private (business)
const updateMyBusiness = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });

    if (!business) {
      return res.status(404).json({ success: false, message: 'Business profile not found.' });
    }

    const allowedUpdates = [
      'businessName', 'description', 'category', 'phone', 'email',
      'website', 'socialLinks', 'address', 'location', 'operatingHours'
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) business[field] = req.body[field];
    });

    // Handle logo upload
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      if (business.logoPublicId) {
        await deleteImage(business.logoPublicId).catch(() => {});
      }
      business.logo          = req.uploadedFiles[0].url;
      business.logoPublicId  = req.uploadedFiles[0].publicId;
    }

    // Re-trigger verification if name changed
    if (req.body.businessName && req.body.businessName !== business.businessName) {
      business.isVerified         = false;
      business.verificationStatus = 'pending';
    }

    await business.save();

    res.status(200).json({ success: true, message: 'Business profile updated.', business });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/businesses/me/cover ───────────────────────────────────
// @desc    Update business cover image
// @access  Private (business)
const updateCoverImage = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      business.coverImage = req.uploadedFiles[0].url;
      await business.save();
    }

    res.status(200).json({ success: true, message: 'Cover image updated.', coverImage: business.coverImage });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/businesses/me/occupancy ───────────────────────────────
// @desc    Toggle live occupancy level
// @access  Private (business)
const updateOccupancy = async (req, res, next) => {
  try {
    const { enabled, currentLevel } = req.body;

    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    if (enabled !== undefined)      business.liveOccupancy.enabled      = enabled;
    if (currentLevel !== undefined) business.liveOccupancy.currentLevel = currentLevel;
    business.liveOccupancy.lastUpdated = new Date();

    await business.save();

    res.status(200).json({
      success: true,
      message: 'Occupancy updated.',
      liveOccupancy: business.liveOccupancy
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/businesses/me/analytics ───────────────────────────────
// @desc    Get business analytics dashboard data
// @access  Private (business)
const getAnalytics = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    // Aggregate deal analytics
    const dealStats = await Deal.aggregate([
      { $match: { business: business._id } },
      {
        $group: {
          _id: '$status',
          count:       { $sum: 1 },
          totalViews:  { $sum: '$analytics.views' },
          totalClicks: { $sum: '$analytics.clicks' },
          avgDiscount: { $avg: '$discountPercent' }
        }
      }
    ]);

    // Top performing deals
    const topDeals = await Deal.find({ business: business._id, status: 'active' })
      .select('title thumbnail discountPercent analytics.views analytics.clicks expiresAt')
      .sort({ 'analytics.views': -1 })
      .limit(5)
      .lean();

    // Recent deals
    const recentDeals = await Deal.find({ business: business._id })
      .select('title status discountPercent createdAt expiresAt analytics.views')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Hourly views heatmap (aggregate across all deals)
    const hourlyAgg = await Deal.aggregate([
      { $match: { business: business._id } },
      {
        $group: {
          _id: null,
          hourlyViews: {
            $reduce: {
              input: '$analytics.hourlyViews',
              initialValue: Array(24).fill(0),
              in: {
                $map: {
                  input: { $range: [0, 24] },
                  as: 'i',
                  in: {
                    $add: [
                      { $arrayElemAt: ['$$value', '$$i'] },
                      { $arrayElemAt: ['$$this', '$$i'] }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    ]);

    const hourlyViews = hourlyAgg.length > 0 ? hourlyAgg[0].hourlyViews : Array(24).fill(0);

    res.status(200).json({
      success: true,
      analytics: {
        overview: business.analytics,
        dealStats,
        topDeals,
        recentDeals,
        hourlyViews,
        subscription: business.subscription
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/businesses/:id/deals ──────────────────────────────────
// @desc    Get all active deals for a specific business
// @access  Public
const getBusinessDeals = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {
      business: req.params.id,
      status: 'active',
      expiresAt: { $gt: new Date() }
    };

    const [deals, total] = await Promise.all([
      Deal.find(filter)
        .sort({ isBoosted: -1, createdAt: -1 })
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

// ─── @route   GET /api/businesses/me/deals ───────────────────────────────────
// @desc    Get all deals for current business (all statuses)
// @access  Private (business)
const getMyDeals = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id }).select('_id');
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = { business: business._id };

    if (req.query.status) filter.status = req.query.status;

    const [deals, total] = await Promise.all([
      Deal.find(filter)
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

// ─── @route   POST /api/businesses/me/verify ─────────────────────────────────
// @desc    Submit verification documents
// @access  Private (business)
const submitVerification = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    if (business.isVerified) {
      return res.status(400).json({ success: false, message: 'Business is already verified.' });
    }

    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      business.verificationDocs = req.uploadedFiles.map((f) => f.url);
    }

    business.verificationStatus = 'pending';
    await business.save();

    res.status(200).json({
      success: true,
      message: 'Verification documents submitted. Pending review.',
      verificationStatus: business.verificationStatus
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBusinesses,
  getBusiness,
  getMyBusiness,
  updateMyBusiness,
  updateCoverImage,
  updateOccupancy,
  getAnalytics,
  getBusinessDeals,
  getMyDeals,
  submitVerification
};
