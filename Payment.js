const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    // ─── Relations ────────────────────────────────────────────────────────────
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Payment must be linked to a business']
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payment must be linked to a user']
    },

    // ─── Payment Type ─────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: ['subscription', 'boost', 'featured'],
      required: [true, 'Payment type is required']
    },

    // ─── Plan Details ─────────────────────────────────────────────────────────
    plan: {
      type: String,
      enum: ['free', 'basic', 'pro', 'enterprise', 'boost_slot', 'featured_slot'],
      required: [true, 'Plan is required']
    },
    planDuration: {
      type: String,
      enum: ['monthly', 'yearly', 'one_time'],
      default: 'monthly'
    },

    // ─── Amount ───────────────────────────────────────────────────────────────
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    currency: {
      type: String,
      default: 'usd',
      lowercase: true
    },
    amountPKR: {
      type: Number,
      default: null // Stored for local gateway reference
    },

    // ─── Gateway ──────────────────────────────────────────────────────────────
    gateway: {
      type: String,
      enum: ['stripe', 'easypaisa', 'jazzcash', 'manual'],
      required: [true, 'Payment gateway is required']
    },

    // ─── Status ───────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
      default: 'pending'
    },

    // ─── Stripe Fields ────────────────────────────────────────────────────────
    stripePaymentIntentId: {
      type: String,
      default: null
    },
    stripeSubscriptionId: {
      type: String,
      default: null
    },
    stripeInvoiceId: {
      type: String,
      default: null
    },
    stripeCustomerId: {
      type: String,
      default: null
    },

    // ─── Local Gateway Fields (Easypaisa / JazzCash) ──────────────────────────
    localTransactionId: {
      type: String,
      default: null
    },
    localPhoneNumber: {
      type: String,
      default: null
    },
    localGatewayRef: {
      type: String,
      default: null
    },

    // ─── Deal Reference (for boosts) ──────────────────────────────────────────
    deal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
      default: null
    },
    boostDuration: {
      type: Number, // hours
      default: null
    },
    boostStartsAt: {
      type: Date,
      default: null
    },
    boostEndsAt: {
      type: Date,
      default: null
    },

    // ─── Subscription Period ──────────────────────────────────────────────────
    periodStart: {
      type: Date,
      default: null
    },
    periodEnd: {
      type: Date,
      default: null
    },

    // ─── Metadata ─────────────────────────────────────────────────────────────
    description: {
      type: String,
      trim: true,
      maxlength: 300
    },
    receiptUrl: {
      type: String,
      default: null
    },
    refundReason: {
      type: String,
      default: null
    },
    refundedAt: {
      type: Date,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
paymentSchema.index({ business: 1 });
paymentSchema.index({ user: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ type: 1 });
paymentSchema.index({ gateway: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });
paymentSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
paymentSchema.index({ deal: 1 }, { sparse: true });

// ─── Virtual: isActive (for subscriptions) ───────────────────────────────────
paymentSchema.virtual('isActive').get(function () {
  if (this.status !== 'completed') return false;
  if (this.periodEnd) return this.periodEnd > new Date();
  return true;
});

// ─── Virtual: isBoostActive ───────────────────────────────────────────────────
paymentSchema.virtual('isBoostActive').get(function () {
  if (this.type !== 'boost' || this.status !== 'completed') return false;
  const now = new Date();
  return this.boostStartsAt <= now && this.boostEndsAt >= now;
});

// ─── Static: Get Revenue Summary for a Business ───────────────────────────────
paymentSchema.statics.getRevenueSummary = async function (businessId) {
  const result = await this.aggregate([
    {
      $match: {
        business: new mongoose.Types.ObjectId(businessId),
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$type',
        total:       { $sum: '$amount' },
        count:       { $sum: 1 },
        lastPayment: { $max: '$createdAt' }
      }
    }
  ]);
  return result;
};

// ─── Static: Get Monthly Revenue (last 6 months) ─────────────────────────────
paymentSchema.statics.getMonthlyRevenue = async function (businessId) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  return this.aggregate([
    {
      $match: {
        business: new mongoose.Types.ObjectId(businessId),
        status: 'completed',
        createdAt: { $gte: sixMonthsAgo }
      }
    },
    {
      $group: {
        _id: {
          year:  { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$amount' },
        count:   { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
};

// ─── Post-save Hook: Activate boost on deal ───────────────────────────────────
paymentSchema.post('save', async function () {
  if (
    this.type === 'boost' &&
    this.status === 'completed' &&
    this.deal &&
    this.boostEndsAt
  ) {
    try {
      const Deal = mongoose.model('Deal');
      await Deal.findByIdAndUpdate(this.deal, {
        isBoosted:    true,
        boostedUntil: this.boostEndsAt
      });
    } catch (err) {
      console.error('Error activating deal boost:', err.message);
    }
  }
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
