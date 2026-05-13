const Deal = require('../models/Deal');
const Business = require('../models/Business');
const User = require('../models/User');
const { deleteImage } = require('../config/cloudinary');

// ─── Helper: Haversine Distance (km) ─────────────────────────────────────────
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Helper: Build Filter Query ───────────────────────────────────────────────
const buildDealFilter = (query) => {
  const filter = { status: 'active', expiresAt: { $gt: new Date() } };

  if (query.category) filter.category = query.category;
  if (query.dealType) filter.dealType = query.dealType;
  if (query.isFlashDeal === 'true') filter.isFlashDeal = true;
  if (query.isBoosted === 'true') filter.isBoosted = true;
  if (query.minDiscount) filter.discountPercent = { $gte: Number(query.minDiscount) };
  if (query.search) {
    filter.$text = { $search: query.search };
  }

  return filter;
};

// ─── @route   GET /api/deals ──────────────────────────────────────────────────
// @desc    Get all active deals (paginated, filtered, sorted)
// @access  Public
const getDeals = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = buildDealFilter(req.query);

    // Sort options
    let sort = { createdAt: -1 }; // default: newest
    if (req.query.sort === 'popular')    sort = { 'analytics.views': -1 };
    if (req.query.sort === 'discount')   sort = { discountPercent: -1 };
    if (req.query.sort === 'expiring')   sort = { expiresAt: 1 };
    if (req.query.sort === 'boosted')    sort = { isBoosted: -1, createdAt: -1 };

    const [deals, total] = await Promise.all([
      Deal.find(filter)
        .populate('business', 'businessName logo address location averageRating')
        .sort(sort)
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
      hasMore: skip + deals.length < total,
      deals
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/deals/nearby ──────────────────────────────────────────
// @desc    Get deals near user location (Haversine + MongoDB $near)
// @access  Public
const getNearbyDeals = async (req, res, next) => {
  try {
    const lat    = parseFloat(req.query.lat);
    const lng    = parseFloat(req.query.lng);
    const radius = Math.min(parseFloat(req.query.radius) || 5000, 50000); // max 50km
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;

    const filter = {
      ...buildDealFilter(req.query),
      dealType: { $in: ['local', 'both'] },
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius
        }
      }
    };

    const deals = await Deal.find(filter)
      .populate('business', 'businessName logo address location averageRating liveOccupancy')
      .skip(skip)
      .limit(limit)
      .lean();

    // Attach distance to each deal
    const dealsWithDistance = deals.map((deal) => {
      if (deal.location?.coordinates?.length === 2) {
        const [dLng, dLat] = deal.location.coordinates;
        deal.distance = parseFloat(haversineDistance(lat, lng, dLat, dLng).toFixed(2));
      }
      return deal;
    });

    res.status(200).json({
      success: true,
      count: dealsWithDistance.length,
      page,
      hasMore: dealsWithDistance.length === limit,
      deals: dealsWithDistance
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/deals/flash ───────────────────────────────────────────
// @desc    Get flash deals
// @access  Public
const getFlashDeals = async (req, res, next) => {
  try {
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const deals = await Deal.findFlash(limit)
      .populate('business', 'businessName logo')
      .lean();

    res.status(200).json({ success: true, count: deals.length, deals });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/deals/online ──────────────────────────────────────────
// @desc    Get online-only deals with coupon codes
// @access  Public
const getOnlineDeals = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {
      status: 'active',
      expiresAt: { $gt: new Date() },
      dealType: { $in: ['online', 'both'] }
    };

    if (req.query.category) filter.category = req.query.category;
    if (req.query.search)   filter.$text = { $search: req.query.search };

    const [deals, total] = await Promise.all([
      Deal.find(filter)
        .populate('business', 'businessName logo website')
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
      hasMore: skip + deals.length < total,
      deals
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/deals/surprise ────────────────────────────────────────
// @desc    Get a random nearby deal ("Surprise Me")
// @access  Public
const getSurpriseDeal = async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    let filter = { status: 'active', expiresAt: { $gt: new Date() } };

    if (!isNaN(lat) && !isNaN(lng)) {
      filter.dealType = { $in: ['local', 'both'] };
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 10000
        }
      };
    }

    const count = await Deal.countDocuments(filter);
    if (count === 0) {
      return res.status(404).json({ success: false, message: 'No deals found nearby.' });
    }

    const randomSkip = Math.floor(Math.random() * count);
    const deal = await Deal.findOne(filter)
      .populate('business', 'businessName logo address location')
      .skip(randomSkip)
      .lean();

    res.status(200).json({ success: true, deal });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/deals/:id ─────────────────────────────────────────────
// @desc    Get single deal by ID
// @access  Public
const getDeal = async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id)
      .populate('business', 'businessName logo address location phone email website socialLinks averageRating operatingHours liveOccupancy')
      .populate('postedBy', 'name avatar')
      .lean();

    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found.' });
    }

    if (deal.status !== 'active' && deal.status !== 'expired') {
      // Only admins and owners can view pending/rejected deals
      const isOwner = req.user && deal.postedBy?._id?.toString() === req.user._id.toString();
      const isAdmin = req.user && req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(404).json({ success: false, message: 'Deal not found.' });
      }
    }

    // Increment view count (non-blocking)
    Deal.findByIdAndUpdate(req.params.id, {
      $inc: {
        'analytics.views': 1,
        [`analytics.hourlyViews.${new Date().getHours()}`]: 1
      }
    }).catch(() => {});

    // Also update business analytics
    if (deal.business?._id) {
      Business.findByIdAndUpdate(deal.business._id, {
        $inc: { 'analytics.totalViews': 1 }
      }).catch(() => {});
    }

    // Check if bookmarked by current user
    let isBookmarked = false;
    if (req.user) {
      const user = await User.findById(req.user._id).select('bookmarks');
      isBookmarked = user.bookmarks.some((id) => id.toString() === req.params.id);
    }

    res.status(200).json({ success: true, deal: { ...deal, isBookmarked } });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/deals ─────────────────────────────────────────────────
// @desc    Create a new deal (business only)
// @access  Private (business)
const createDeal = async (req, res, next) => {
  try {
    // Get the business profile for this user
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'You need a business account to post deals.'
      });
    }

    if (business.isBanned) {
      return res.status(403).json({ success: false, message: 'Your business account is suspended.' });
    }

    // Build deal data
    const dealData = {
      ...req.body,
      business:  business._id,
      postedBy:  req.user._id,
      status:    'pending', // Requires admin approval
    };

    // Parse location if provided as string
    if (typeof req.body.location === 'string') {
      try { dealData.location = JSON.parse(req.body.location); } catch {}
    }

    // Parse tags if string
    if (typeof req.body.tags === 'string') {
      try { dealData.tags = JSON.parse(req.body.tags); } catch { dealData.tags = []; }
    }

    // Attach uploaded images
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      dealData.images    = req.uploadedFiles;
      dealData.thumbnail = req.uploadedFiles[0].url;
    }

    const deal = await Deal.create(dealData);

    // Update business analytics
    await Business.findByIdAndUpdate(business._id, {
      $inc: { 'analytics.totalDealsPosted': 1 }
    });

    res.status(201).json({
      success: true,
      message: 'Deal submitted for review.',
      deal
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   PUT /api/deals/:id ─────────────────────────────────────────────
// @desc    Update a deal
// @access  Private (deal owner or admin)
const updateDeal = async (req, res, next) => {
  try {
    const deal = req.deal; // Set by isDealOwner middleware

    const allowedUpdates = [
      'title', 'description', 'category', 'discountPercent',
      'originalPrice', 'discountedPrice', 'dealType', 'isFlashDeal',
      'isLimitedStock', 'stockCount', 'couponCode', 'externalLink',
      'affiliateLink', 'expiresAt', 'startsAt', 'tags', 'address', 'location'
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) deal[field] = req.body[field];
    });

    // Handle new image uploads
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      // Delete old images from Cloudinary
      for (const img of deal.images) {
        if (img.publicId) await deleteImage(img.publicId).catch(() => {});
      }
      deal.images    = req.uploadedFiles;
      deal.thumbnail = req.uploadedFiles[0].url;
    }

    // Re-submit for approval if significant changes
    if (req.body.title || req.body.expiresAt) {
      deal.status = 'pending';
    }

    await deal.save();

    res.status(200).json({ success: true, message: 'Deal updated.', deal });
  } catch (err) {
    next(err);
  }
};

// ─── @route   DELETE /api/deals/:id ──────────────────────────────────────────
// @desc    Delete a deal
// @access  Private (deal owner or admin)
const deleteDeal = async (req, res, next) => {
  try {
    const deal = req.deal;

    // Delete images from Cloudinary
    for (const img of deal.images) {
      if (img.publicId) await deleteImage(img.publicId).catch(() => {});
    }

    await deal.deleteOne();

    res.status(200).json({ success: true, message: 'Deal deleted.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/deals/:id/sighting ───────────────────────────────────
// @desc    Report a user sighting ("Still Available")
// @access  Private
const reportSighting = async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });

    // Prevent duplicate sightings from same user in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSighting = deal.sightings.find(
      (s) =>
        s.user?.toString() === req.user._id.toString() &&
        s.createdAt > oneDayAgo
    );

    if (recentSighting) {
      return res.status(400).json({
        success: false,
        message: 'You already reported a sighting for this deal in the last 24 hours.'
      });
    }

    deal.sightings.push({ user: req.user._id, note: req.body.note });
    deal.lastSightedAt    = new Date();
    deal.isStillAvailable = true;
    await deal.save();

    res.status(200).json({
      success: true,
      message: 'Sighting reported. Thanks!',
      sightingsCount: deal.sightings.length
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/deals/:id/click ──────────────────────────────────────
// @desc    Track deal click (visit shop / open link)
// @access  Public
const trackClick = async (req, res, next) => {
  try {
    await Deal.findByIdAndUpdate(req.params.id, {
      $inc: { 'analytics.clicks': 1 }
    });

    // Update business click analytics
    const deal = await Deal.findById(req.params.id).select('business');
    if (deal?.business) {
      await Business.findByIdAndUpdate(deal.business, {
        $inc: { 'analytics.totalClicks': 1 }
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/deals/:id/share ──────────────────────────────────────
// @desc    Track deal share
// @access  Public
const trackShare = async (req, res, next) => {
  try {
    await Deal.findByIdAndUpdate(req.params.id, {
      $inc: { 'analytics.shares': 1 }
    });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/deals/map ─────────────────────────────────────────────
// @desc    Get deals for map view (coordinates only, lightweight)
// @access  Public
const getDealsForMap = async (req, res, next) => {
  try {
    const lat    = parseFloat(req.query.lat);
    const lng    = parseFloat(req.query.lng);
    const radius = Math.min(parseFloat(req.query.radius) || 10000, 50000);

    const filter = {
      status: 'active',
      expiresAt: { $gt: new Date() },
      dealType: { $in: ['local', 'both'] }
    };

    if (!isNaN(lat) && !isNaN(lng)) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius
        }
      };
    }

    const deals = await Deal.find(filter)
      .select('title category discountPercent location thumbnail isFlashDeal isBoosted business')
      .populate('business', 'businessName')
      .limit(200)
      .lean();

    res.status(200).json({ success: true, count: deals.length, deals });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDeals,
  getNearbyDeals,
  getFlashDeals,
  getOnlineDeals,
  getSurpriseDeal,
  getDeal,
  createDeal,
  updateDeal,
  deleteDeal,
  reportSighting,
  trackClick,
  trackShare,
  getDealsForMap
};
