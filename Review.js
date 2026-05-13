const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    // ─── Relations ────────────────────────────────────────────────────────────
    deal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
      required: [true, 'Review must belong to a deal']
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Review must have an author']
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Review must be linked to a business']
    },

    // ─── Content ──────────────────────────────────────────────────────────────
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5']
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters']
    },
    images: [
      {
        url:      { type: String },
        publicId: { type: String }
      }
    ],

    // ─── Worth It Vote ────────────────────────────────────────────────────────
    worthIt: {
      type: Boolean,
      default: null // null = not voted, true = worth it, false = not worth it
    },

    // ─── Moderation ───────────────────────────────────────────────────────────
    isApproved: {
      type: Boolean,
      default: true // auto-approve unless flagged
    },
    isFlagged: {
      type: Boolean,
      default: false
    },
    flagReason: {
      type: String,
      default: null
    },
    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // ─── Helpful Votes ────────────────────────────────────────────────────────
    helpfulVotes: {
      type: Number,
      default: 0
    },
    helpfulVoters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    // ─── Business Reply ───────────────────────────────────────────────────────
    reply: {
      text:      { type: String, trim: true, maxlength: 300 },
      repliedAt: { type: Date }
    }
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
reviewSchema.index({ deal: 1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ business: 1 });
reviewSchema.index({ rating: -1 });
reviewSchema.index({ isFlagged: 1 });
reviewSchema.index({ createdAt: -1 });

// ─── Compound: one review per user per deal ───────────────────────────────────
reviewSchema.index({ deal: 1, user: 1 }, { unique: true });

// ─── Post-save: Update Deal avg rating & worth-it score ──────────────────────
reviewSchema.post('save', async function () {
  await updateDealStats(this.deal);
});

reviewSchema.post('remove', async function () {
  await updateDealStats(this.deal);
});

// Also handle findOneAndDelete
reviewSchema.post('findOneAndDelete', async function (doc) {
  if (doc) await updateDealStats(doc.deal);
});

async function updateDealStats(dealId) {
  try {
    const Deal = mongoose.model('Deal');
    const stats = await mongoose.model('Review').aggregate([
      { $match: { deal: dealId, isApproved: true } },
      {
        $group: {
          _id: '$deal',
          avgRating:    { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          worthItYes:   { $sum: { $cond: [{ $eq: ['$worthIt', true]  }, 1, 0] } },
          worthItNo:    { $sum: { $cond: [{ $eq: ['$worthIt', false] }, 1, 0] } }
        }
      }
    ]);

    if (stats.length > 0) {
      const { avgRating, totalReviews, worthItYes, worthItNo } = stats[0];
      const total = worthItYes + worthItNo;
      const worthItScore = total > 0 ? Math.round((worthItYes / total) * 100) : 0;

      await Deal.findByIdAndUpdate(dealId, {
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews,
        worthItScore,
        'worthItVotes.yes': worthItYes,
        'worthItVotes.no':  worthItNo
      });
    } else {
      await Deal.findByIdAndUpdate(dealId, {
        averageRating: 0,
        totalReviews: 0,
        worthItScore: 0,
        'worthItVotes.yes': 0,
        'worthItVotes.no':  0
      });
    }
  } catch (err) {
    console.error('Error updating deal stats from review:', err.message);
  }
}

// ─── Instance Method: Mark as Helpful ────────────────────────────────────────
reviewSchema.methods.markHelpful = async function (userId) {
  const alreadyVoted = this.helpfulVoters.some(
    (id) => id.toString() === userId.toString()
  );
  if (alreadyVoted) {
    this.helpfulVoters = this.helpfulVoters.filter(
      (id) => id.toString() !== userId.toString()
    );
    this.helpfulVotes = Math.max(0, this.helpfulVotes - 1);
  } else {
    this.helpfulVoters.push(userId);
    this.helpfulVotes += 1;
  }
  return this.save();
};

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
