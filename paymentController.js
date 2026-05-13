const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Business = require('../models/Business');
const Deal = require('../models/Deal');

// ─── Subscription Plan Pricing ────────────────────────────────────────────────
const PLANS = {
  basic: {
    name:             'Basic',
    monthlyPrice:     999,   // cents ($9.99)
    yearlyPrice:      9999,  // cents ($99.99)
    boostedSlotsLimit: 2,
    stripePriceIdMonthly: process.env.STRIPE_BASIC_MONTHLY_PRICE_ID,
    stripePriceIdYearly:  process.env.STRIPE_BASIC_YEARLY_PRICE_ID
  },
  pro: {
    name:             'Pro',
    monthlyPrice:     2999,
    yearlyPrice:      29999,
    boostedSlotsLimit: 10,
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    stripePriceIdYearly:  process.env.STRIPE_PRO_YEARLY_PRICE_ID
  },
  enterprise: {
    name:             'Enterprise',
    monthlyPrice:     9999,
    yearlyPrice:      99999,
    boostedSlotsLimit: 999,
    stripePriceIdMonthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    stripePriceIdYearly:  process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID
  }
};

// ─── Boost Pricing ────────────────────────────────────────────────────────────
const BOOST_PRICES = {
  24:  499,  // 24 hours  = $4.99
  48:  799,  // 48 hours  = $7.99
  168: 1999  // 7 days    = $19.99
};

// ─── @route   GET /api/payments/plans ────────────────────────────────────────
// @desc    Get all subscription plans
// @access  Public
const getPlans = (req, res) => {
  res.status(200).json({
    success: true,
    plans: Object.entries(PLANS).map(([key, plan]) => ({
      id:               key,
      name:             plan.name,
      monthlyPrice:     plan.monthlyPrice / 100,
      yearlyPrice:      plan.yearlyPrice  / 100,
      boostedSlotsLimit: plan.boostedSlotsLimit
    }))
  });
};

// ─── @route   POST /api/payments/subscribe ───────────────────────────────────
// @desc    Create Stripe subscription for a plan
// @access  Private (business)
const createSubscription = async (req, res, next) => {
  try {
    const { plan, duration = 'monthly' } = req.body;

    if (!PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected.' });
    }

    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    const planConfig = PLANS[plan];
    const priceId = duration === 'yearly'
      ? planConfig.stripePriceIdYearly
      : planConfig.stripePriceIdMonthly;

    // Create or retrieve Stripe customer
    let stripeCustomerId = business.subscription.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name:  business.businessName,
        metadata: { businessId: business._id.toString(), userId: req.user._id.toString() }
      });
      stripeCustomerId = customer.id;
      business.subscription.stripeCustomerId = stripeCustomerId;
      await business.save();
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer:   stripeCustomerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_ORIGIN}/pages/dashboard.html?payment=success&plan=${plan}`,
      cancel_url:  `${process.env.CLIENT_ORIGIN}/pages/dashboard.html?payment=cancelled`,
      metadata: {
        businessId: business._id.toString(),
        userId:     req.user._id.toString(),
        plan,
        duration
      }
    });

    // Record pending payment
    await Payment.create({
      business:   business._id,
      user:       req.user._id,
      type:       'subscription',
      plan,
      planDuration: duration,
      amount:     duration === 'yearly' ? planConfig.yearlyPrice : planConfig.monthlyPrice,
      currency:   'usd',
      gateway:    'stripe',
      status:     'pending',
      description: `${planConfig.name} plan (${duration})`
    });

    res.status(200).json({ success: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/payments/boost ───────────────────────────────────────
// @desc    Boost a deal via Stripe
// @access  Private (business)
const boostDeal = async (req, res, next) => {
  try {
    const { dealId, hours = 24 } = req.body;

    const boostPrice = BOOST_PRICES[hours];
    if (!boostPrice) {
      return res.status(400).json({
        success: false,
        message: `Invalid boost duration. Choose: ${Object.keys(BOOST_PRICES).join(', ')} hours.`
      });
    }

    const deal = await Deal.findById(dealId);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found.' });

    const business = await Business.findOne({ owner: req.user._id });
    if (!business || deal.business.toString() !== business._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not your deal.' });
    }

    if (deal.isBoosted && deal.boostedUntil > new Date()) {
      return res.status(400).json({ success: false, message: 'Deal is already boosted.' });
    }

    const boostStart = new Date();
    const boostEnd   = new Date(boostStart.getTime() + hours * 60 * 60 * 1000);

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   boostPrice,
      currency: 'usd',
      metadata: {
        dealId:     dealId,
        businessId: business._id.toString(),
        userId:     req.user._id.toString(),
        hours:      hours.toString()
      }
    });

    // Record pending payment
    const payment = await Payment.create({
      business:             business._id,
      user:                 req.user._id,
      type:                 'boost',
      plan:                 'boost_slot',
      planDuration:         'one_time',
      amount:               boostPrice,
      currency:             'usd',
      gateway:              'stripe',
      status:               'pending',
      stripePaymentIntentId: paymentIntent.id,
      deal:                 dealId,
      boostDuration:        hours,
      boostStartsAt:        boostStart,
      boostEndsAt:          boostEnd,
      description:          `Boost deal "${deal.title}" for ${hours} hours`
    });

    res.status(200).json({
      success:      true,
      clientSecret: paymentIntent.client_secret,
      paymentId:    payment._id,
      boostPrice:   boostPrice / 100
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/payments/local ───────────────────────────────────────
// @desc    Mock local gateway payment (Easypaisa / JazzCash)
// @access  Private (business)
const localPayment = async (req, res, next) => {
  try {
    const { gateway, phoneNumber, transactionId, plan, duration = 'monthly' } = req.body;

    if (!['easypaisa', 'jazzcash'].includes(gateway)) {
      return res.status(400).json({ success: false, message: 'Invalid gateway.' });
    }
    if (!PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan.' });
    }

    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    const planConfig = PLANS[plan];
    const amountPKR  = duration === 'yearly'
      ? Math.round(planConfig.yearlyPrice  * 2.85) // Mock PKR conversion
      : Math.round(planConfig.monthlyPrice * 2.85);

    // Mock verification (in production, call gateway API)
    const isVerified = transactionId && transactionId.length >= 8;

    if (!isVerified) {
      return res.status(400).json({ success: false, message: 'Invalid transaction ID.' });
    }

    const periodEnd = new Date();
    duration === 'yearly'
      ? periodEnd.setFullYear(periodEnd.getFullYear() + 1)
      : periodEnd.setMonth(periodEnd.getMonth() + 1);

    const payment = await Payment.create({
      business:          business._id,
      user:              req.user._id,
      type:              'subscription',
      plan,
      planDuration:      duration,
      amount:            duration === 'yearly' ? planConfig.yearlyPrice : planConfig.monthlyPrice,
      currency:          'usd',
      amountPKR,
      gateway,
      status:            'completed',
      localTransactionId: transactionId,
      localPhoneNumber:   phoneNumber,
      periodStart:        new Date(),
      periodEnd,
      description:       `${planConfig.name} plan via ${gateway}`
    });

    // Activate subscription
    await Business.findByIdAndUpdate(business._id, {
      'subscription.plan':              plan,
      'subscription.status':            'active',
      'subscription.currentPeriodEnd':  periodEnd,
      'subscription.boostedSlotsLimit': planConfig.boostedSlotsLimit
    });

    res.status(200).json({
      success: true,
      message: `Payment via ${gateway} confirmed. ${planConfig.name} plan activated.`,
      payment
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/payments/webhook ─────────────────────────────────────
// @desc    Stripe webhook handler
// @access  Stripe (raw body)
const stripeWebhook = async (req, res, next) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      // ── Subscription created / updated ──────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const metadata     = subscription.metadata || {};
        const plan         = metadata.plan || 'basic';
        const duration     = metadata.duration || 'monthly';
        const planConfig   = PLANS[plan] || PLANS.basic;

        if (metadata.businessId) {
          const periodEnd = new Date(subscription.current_period_end * 1000);

          await Business.findByIdAndUpdate(metadata.businessId, {
            'subscription.plan':                plan,
            'subscription.status':              subscription.status === 'active' ? 'active' : 'inactive',
            'subscription.stripeSubscriptionId': subscription.id,
            'subscription.currentPeriodEnd':    periodEnd,
            'subscription.boostedSlotsLimit':   planConfig.boostedSlotsLimit
          });

          await Payment.findOneAndUpdate(
            { stripeSubscriptionId: subscription.id },
            {
              status:     'completed',
              periodStart: new Date(subscription.current_period_start * 1000),
              periodEnd
            }
          );
        }
        break;
      }

      // ── Subscription cancelled / deleted ─────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const metadata     = subscription.metadata || {};

        if (metadata.businessId) {
          await Business.findByIdAndUpdate(metadata.businessId, {
            'subscription.plan':   'free',
            'subscription.status': 'cancelled'
          });
        }
        break;
      }

      // ── PaymentIntent succeeded (boosts) ─────────────────────────────────────
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const meta   = intent.metadata || {};

        await Payment.findOneAndUpdate(
          { stripePaymentIntentId: intent.id },
          { status: 'completed' }
        );

        // Activate deal boost
        if (meta.dealId && meta.hours) {
          const boostEnd = new Date(Date.now() + parseInt(meta.hours) * 60 * 60 * 1000);
          await Deal.findByIdAndUpdate(meta.dealId, {
            isBoosted:    true,
            boostedUntil: boostEnd
          });
        }
        break;
      }

      // ── PaymentIntent failed ──────────────────────────────────────────────────
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        await Payment.findOneAndUpdate(
          { stripePaymentIntentId: intent.id },
          { status: 'failed' }
        );
        break;
      }

      // ── Invoice paid ──────────────────────────────────────────────────────────
      case 'invoice.paid': {
        const invoice  = event.data.object;
        const metadata = invoice.subscription_details?.metadata || {};

        await Payment.findOneAndUpdate(
          { stripeSubscriptionId: invoice.subscription },
          {
            status:         'completed',
            stripeInvoiceId: invoice.id,
            receiptUrl:      invoice.hosted_invoice_url
          }
        );
        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed.' });
  }
};

// ─── @route   GET /api/payments/my ───────────────────────────────────────────
// @desc    Get payment history for current business
// @access  Private (business)
const getMyPayments = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id }).select('_id');
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find({ business: business._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments({ business: business._id })
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      payments
    });
  } catch (err) {
    next(err);
  }
};

// ─── @route   POST /api/payments/cancel-subscription ────────────────────────
// @desc    Cancel Stripe subscription
// @access  Private (business)
const cancelSubscription = async (req, res, next) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

    const subId = business.subscription.stripeSubscriptionId;
    if (!subId) {
      return res.status(400).json({ success: false, message: 'No active Stripe subscription found.' });
    }

    // Cancel at period end (not immediately)
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

    await Business.findByIdAndUpdate(business._id, {
      'subscription.status': 'cancelled'
    });

    res.status(200).json({
      success: true,
      message: 'Subscription will be cancelled at the end of the current billing period.'
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPlans,
  createSubscription,
  boostDeal,
  localPayment,
  stripeWebhook,
  getMyPayments,
  cancelSubscription
};
