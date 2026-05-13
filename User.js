const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
  {
    // ─── Basic Info ───────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false // Never return password in queries
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s\-()]{7,15}$/, 'Please enter a valid phone number']
    },
    avatar: {
      type: String,
      default: null
    },
    avatarPublicId: {
      type: String,
      default: null
    },

    // ─── Role & Status ────────────────────────────────────────────────────────
    role: {
      type: String,
      enum: ['user', 'business', 'admin'],
      default: 'user'
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    isBanned: {
      type: Boolean,
      default: false
    },
    banReason: {
      type: String,
      default: null
    },

    // ─── Preferences ─────────────────────────────────────────────────────────
    theme: {
      type: String,
      enum: ['dark', 'light'],
      default: 'dark'
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    fcmToken: {
      type: String,
      default: null
    },

    // ─── Saved Locations ──────────────────────────────────────────────────────
    savedLocations: [
      {
        label: {
          type: String,
          enum: ['home', 'work', 'other'],
          default: 'other'
        },
        name: String,
        coordinates: {
          type: [Number], // [lng, lat]
          index: '2dsphere'
        }
      }
    ],

    // ─── Bookmarks ────────────────────────────────────────────────────────────
    bookmarks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
      }
    ],

    // ─── Auth Tokens ──────────────────────────────────────────────────────────
    passwordResetToken: {
      type: String,
      default: null
    },
    passwordResetExpires: {
      type: Date,
      default: null
    },
    emailVerificationToken: {
      type: String,
      default: null
    },

    // ─── Stats ────────────────────────────────────────────────────────────────
    totalDealsViewed: {
      type: Number,
      default: 0
    },
    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ createdAt: -1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
userSchema.virtual('bookmarkCount').get(function () {
  return this.bookmarks ? this.bookmarks.length : 0;
});

// ─── Pre-save Hook: Hash Password ─────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Instance Method: Compare Password ───────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Instance Method: Generate JWT ───────────────────────────────────────────
userSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this._id,
      role: this.role,
      email: this.email
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ─── Instance Method: Generate Password Reset Token ──────────────────────────
userSchema.methods.generatePasswordResetToken = function () {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
  return resetToken; // Return unhashed token (sent via email)
};

// ─── Static Method: Find Active (non-banned) Users ───────────────────────────
userSchema.statics.findActive = function () {
  return this.find({ isBanned: false });
};

// ─── Remove sensitive fields from JSON output ────────────────────────────────
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.emailVerificationToken;
  delete obj.fcmToken;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
