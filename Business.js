const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    // ─── Owner ────────────────────────────────────────────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Business must have an owner'],
      unique: true
    },

    // ─── Basic Info ───────────────────────────────────────────────────────────
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: [2, 'Business name must be at least 2 characters'],
      maxlength: [100, 'Business name cannot exceed 100 characters']
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    category: {
      type: String,
      enum: ['Food', 'Clothes', 'Cosmetics', 'Electronics', 'Health', 'Services', 'Others'],
      required: [true, 'Business category is required']
    },
    logo: {
      type: String,
      default: null
    },
    logoPublicId: {
      type: String,
      default: null
    },
    coverImage: {
      type: String,
      default: null
    },

    // ─── Contact ──────────────────────────────────────────────────────────────
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    website: {
      type: String,
      trim: true
    },
    socialLinks: {
      instagram: { type: String, default: null },
      facebook:  { type: String, default: null },
      twitter:   { type: String, default: null },
      whatsapp:  { type: String, default: null }
    },

    // ─── Location ─────────────────────────────────────────────────────────────
    address: {
      street:  { type: String, trim: true },
      city:    { type: String, trim: true },
      state:   { type: String, trim: true },
      country: { type: String, trim: true, default: 'Pakistan' },
      zipCode: { type: String, trim: true }
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    },

    // ─── Verification & Status ────────────────────────────────────────────────
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    verificationDocs: [
      {
        type: String // URLs to uploaded verification documents
      }
    ],
    isBanned: {
      type: Boolean,
      default: false
    },
    banReason: {
      type: String,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },

    // ─── Live Occupancy ───────────────────────────────────────────────────────
    liveOccupancy: {
      enabled: { type: Boolean, default: false },
      currentLevel: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
      },
      lastUpdated: { type: Date, default: Date.now }
    },

    // ─── Subscription / Monetization ─────────────────────────────────────────
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'enterprise'],
        default: 'free'
      },
      status: {
        type: String,
        enum: ['active', 'inactive', 'cancelled', 'past_due'],
        default: 'inactive'
      },
      stripeCustomerId:     { type: String, default: null },
      stripeSubscriptionId: { type: String, default: null },
      currentPeriodEnd:     { type: Date, default: null },
      boostedSlotsUsed:     { type: Number, default: 0 },
      boostedSlotsLimit:    { type: Number, default: 0 }
    },

    // ─── Analytics ────────────────────────────────────────────────────────────
    analytics: {
      totalDealsPosted:  { type: Number, default: 0 },
      totalViews:        { type: Number, default: 0 },
      totalClicks:       { type: Number, default: 0 },
      totalConversions:  { type: Number, default: 0 },
      peakHour:          { type: Number, default: null }, // 0-23
      weeklyViews: {
        type: [Number],
        default: [0, 0, 0, 0, 0, 0, 0] // Sun-Sat
      }
    },

    // ─── Ratings ──────────────────────────────────────────────────────────────
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    },

    // ─── Operating Hours ──────────────────────────────────────────────────────
    operatingHours: {
      monday:    { open: String, close: String, closed: { type: Boolean, default: false } },
      tuesday:   { open: String, close: String, closed: { type: Boolean, default: false } },
      wednesday: { open: String, close: String, closed: { type: Boolean, default: false } },
      thursday:  { open: String, close: String, closed: { type: Boolean, default: false } },
      friday:    { open: String, close: String, closed: { type: Boolean, default: false } },
      saturday:  { open: String, close: String, closed: { type: Boolean, default: false } },
      sunday:    { open: String, close: String, closed: { type: Boolean, default: true  } }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
businessSchema.index({ location: '2dsphere' });
businessSchema.index({ owner: 1 });
businessSchema.index({ slug: 1 });
businessSchema.index({ category: 1 });
businessSchema.index({ isVerified: 1 });
businessSchema.index({ isBanned: 1 });
businessSchema.index({ 'subscription.plan': 1 });
businessSchema.index({ businessName: 'text', description: 'text' });

// ─── Pre-save: Auto-generate Slug ────────────────────────────────────────────
businessSchema.pre('save', async function (next) {
  if (!this.isModified('businessName')) return next();

  let baseSlug = this.businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  let slug = baseSlug;
  let count = 1;

  // Ensure uniqueness
  while (await mongoose.model('Business').findOne({ slug, _id: { $ne: this._id } })) {
    slug = `${baseSlug}-${count}`;
    count++;
  }

  this.slug = slug;
  next();
});

// ─── Virtual: Deal Count ──────────────────────────────────────────────────────
businessSchema.virtual('deals', {
  ref: 'Deal',
  localField: '_id',
  foreignField: 'business',
  count: true
});

// ─── Instance Method: Update Analytics ───────────────────────────────────────
businessSchema.methods.incrementStat = async function (field) {
  const allowedFields = ['totalViews', 'totalClicks', 'totalConversions'];
  if (!allowedFields.includes(field)) return;
  this.analytics[field] = (this.analytics[field] || 0) + 1;
  await this.save();
};

// ─── Static Method: Get Nearby Businesses ─────────────────────────────────────
businessSchema.statics.findNearby = function (lng, lat, maxDistanceMeters = 5000) {
  return this.find({
    isActive: true,
    isBanned: false,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: maxDistanceMeters
      }
    }
  });
};

const Business = mongoose.model('Business', businessSchema);
module.exports = Business;
