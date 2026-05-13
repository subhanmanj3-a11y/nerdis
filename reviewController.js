const Review = require('../models/Review');
const Deal = require('../models/Deal');
const Business = require('../models/Business');
const { deleteImage } = require('../config/cloudinary');

// ─── @route   GET /api/reviews/deal/:dealId ───────────────────────────────────
// @desc    Get all approved reviews for a deal
// @access  Public
const getDealReviews = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const filter = { deal: req.params.dealId, isApproved: true, isFlagged: false };

    let sort = { createdAt: -1 };
    if (req.query.sort === 'helpful') sort = { helpfulVotes: -1 };
    if (req.query.sort === 'rating')  sort = { rating: -1 };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('user', 'name avatar createdAt')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter)
    ]);

    // If user is logged in, mark which reviews they found helpful
    let markedHelpful = [];
    if (req.user) {
      const userReviews = await Review.find({
        deal: req.params.dealId,
        helpfulVoters: req.user._id
      }).select('_id');
      markedHelpful = userReviews.map((r) => r._id.toString());
    }

    const enriched = reviews.map((r) => ({
      ...r,
      markedHelpful: markedHelpful.includes(r._id.toString())
    }));

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      hasMore: skip + reviews.length < total,
      reviews: enriched
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/reviews/deal/:dealId ─────────────────────────────────
// @desc    Submit a review for a deal
// @access  Private
const createReview = async (req, res, next) => {
  try {
    const { dealId } = req.params;

    // Check deal exists and is active
    const deal = await Deal.findById(dealId);
    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found.' });
    }
    if (deal.status !== 'active' && deal.status !== 'expired') {
      return res.status(400).json({ success: false, message: 'Cannot review this deal.' });
    }

    // Check for existing review by this user
    const existing = await Review.findOne({ deal: dealId, user: req.user._id });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this deal.'
      });
    }

    const reviewData = {
      deal:     dealId,
      user:     req.user._id,
      business: deal.business,
      rating:   req.body.rating,
      comment:  req.body.comment,
      worthIt:  req.body.worthIt !== undefined ? req.body.worthIt : null
    };

    // Attach uploaded review images
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      reviewData.images = req.uploadedFiles;
    }

    const review = await Review.create(reviewData);
    await review.populate('user', 'name avatar');

    // Update business total review count
    await Business.findByIdAndUpdate(deal.business, {
      $inc: { totalReviews: 1 }
    });

    res.status(201).json({
      success: true,
      message: 'Review submitted.',
      review
    });
  } catch (err) {
    // Duplicate key (race condition)
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this deal.'
      });
    }
    next(err);
  }
};

// ─── @route   PUT /api/reviews/:id ───────────────────────────────────────────
// @desc    Update own review
// @access  Private
const updateReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    if (review.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not your review.' });
    }

    const allowedUpdates = ['rating', 'comment', 'worthIt'];
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) review[field] = req.body[field];
    });

    // Handle new images
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      for (const img of review.images) {
        if (img.publicId) await deleteImage(img.publicId).catch(() => {});
      }
      review.images = req.uploadedFiles;
    }

    await review.save();
    await review.populate('user', 'name avatar');

    res.status(200).json({ success: true, message: 'Review updated.', review });
  } catch (err) {
    next(err);
  }
};

// ─── @route   DELETE /api/reviews/:id ────────────────────────────────────────
// @desc    Delete own review (or admin)
// @access  Private
const deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    const isOwner = review.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    // Delete review images from Cloudinary
    for (const img of review.images) {
      if (img.publicId) await deleteImage(img.publicId).catch(() => {});
    }

    await review.deleteOne();

    // Update business total review count
    await Business.findByIdAndUpdate(review.business, {
      $inc: { totalReviews: -1 }
    });

    res.status(200).json({ success: true, message: 'Review deleted.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/reviews/:id/helpful ──────────────────────────────────
// @desc    Toggle helpful vote on a review
// @access  Private
const toggleHelpful = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    if (review.user.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot mark your own review as helpful.'
      });
    }

    await review.markHelpful(req.user._id);

    const alreadyVoted = review.helpfulVoters.some(
      (id) => id.toString() === req.user._id.toString()
    );

    res.status(200).json({
      success: true,
      helpfulVotes: review.helpfulVotes,
      marked: !alreadyVoted // true = just added, false = just removed
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/reviews/:id/flag ─────────────────────────────────────
// @desc    Flag a review for moderation
// @access  Private
const flagReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    if (review.isFlagged) {
      return res.status(400).json({ success: false, message: 'Review already flagged.' });
    }

    review.isFlagged  = true;
    review.flagReason = req.body.reason || 'No reason provided';
    review.flaggedBy  = req.user._id;
    await review.save();

    res.status(200).json({ success: true, message: 'Review flagged for moderation.' });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/reviews/:id/reply ────────────────────────────────────
// @desc    Business owner replies to a review
// @access  Private (business)
const replyToReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id).populate('deal', 'business');

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    // Check if current user owns the business
    const Business = require('../models/Business');
    const business = await Business.findOne({ owner: req.user._id });

    if (!business || business._id.toString() !== review.business.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the business owner can reply to this review.'
      });
    }

    if (review.reply?.text) {
      return res.status(400).json({
        success: false,
        message: 'You have already replied to this review.'
      });
    }

    review.reply = {
      text:      req.body.text,
      repliedAt: new Date()
    };
    await review.save();

    res.status(200).json({ success: true, message: 'Reply posted.', reply: review.reply });
  } catch (err) {
    next(err);
  }
};

// ─── @route   GET /api/reviews/my ─────────────────────────────────────────────
// @desc    Get all reviews by the current user
// @access  Private
const getMyReviews = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ user: req.user._id })
        .populate('deal', 'title thumbnail discountPercent status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ user: req.user._id })
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      reviews
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDealReviews,
  createReview,
  updateReview,
  deleteReview,
  toggleHelpful,
  flagReview,
  replyToReview,
  getMyReviews
};
