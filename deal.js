// ─── Deal Page State ──────────────────────────────────────────────────────────
const DealPage = {
  dealId:       null,
  deal:         null,
  userLat:      null,
  userLng:      null,
  reviewPage:   1,
  reviewLimit:  10,
  reviewRating: 0,
  worthItVote:  null,
  isBookmarked: false,

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    const params = new URLSearchParams(window.location.search);
    this.dealId  = params.get('id');

    if (!this.dealId) {
      this._showError();
      return;
    }

    // Get user location (non-blocking)
    window.NeardisAPI.Geo.getPosition()
      .then(pos => { this.userLat = pos.lat; this.userLng = pos.lng; })
      .catch(() => {});

    await this.loadDeal();
    await this.loadReviews(true);
  },

  // ─── Load Deal ─────────────────────────────────────────────────────────────
  async loadDeal() {
    try {
      const res  = await window.NeardisAPI.DealsAPI.getDeal(this.dealId);
      this.deal  = res.deal;
      this.isBookmarked = res.deal.isBookmarked || false;

      // Track click
      window.NeardisAPI.DealsAPI.trackClick(this.dealId).catch(() => {});

      this._renderDeal();
      this._updateMetaTags();

    } catch (err) {
      console.error('Deal load error:', err);
      this._showError();
    }
  },

  // ─── Render Deal ───────────────────────────────────────────────────────────
  _renderDeal() {
    const deal = this.deal;

    // Hide skeleton, show content
    document.getElementById('deal-skeleton')?.classList.add('hidden');
    document.getElementById('deal-content')?.classList.remove('hidden');

    this._renderGallery();
    this._renderHeader();
    this._renderPriceRow();
    this._renderMetaRow();
    this._renderCountdown();
    this._renderCTA();
    this._renderCoupon();
    this._renderShop();
    this._renderDescription();
    this._renderWorthIt();
    this._renderSightings();
    this._bindBookmark();
    this._bindShare();
    this._bindReviewForm();
    this._bindSightingReport();
  },

  // ─── Gallery ───────────────────────────────────────────────────────────────
  _renderGallery() {
    const deal   = this.deal;
    const main   = document.getElementById('gallery-main');
    const thumbs = document.getElementById('gallery-thumbs');
    const badges = document.getElementById('gallery-badges');

    const images = deal.images?.length
      ? deal.images
      : [{ url: deal.thumbnail || '' }];

    if (main) {
      main.src = images[0].url;
      main.alt = deal.title;
    }

    // Thumbnails
    if (thumbs && images.length > 1) {
      thumbs.innerHTML = images.map((img, i) => `
        <div class="deal-gallery__thumb ${i === 0 ? 'deal-gallery__thumb--active' : ''}"
             data-index="${i}" data-url="${img.url}">
          <img src="${img.url}" alt="Image ${i+1}" loading="lazy" />
        </div>`).join('');

      thumbs.addEventListener('click', (e) => {
        const thumb = e.target.closest('.deal-gallery__thumb');
        if (!thumb) return;
        main.src = thumb.dataset.url;
        document.querySelectorAll('.deal-gallery__thumb').forEach(t => t.classList.remove('deal-gallery__thumb--active'));
        thumb.classList.add('deal-gallery__thumb--active');
      });
    }

    // Badges
    if (badges) {
      badges.innerHTML = `
        <span class="badge badge--discount">${deal.discountPercent}% OFF</span>
        ${deal.isFlashDeal   ? '<span class="badge badge--flash">⚡ FLASH</span>'     : ''}
        ${deal.isBoosted     ? '<span class="badge badge--boosted">⭐ Boosted</span>'  : ''}
        ${deal.dealType === 'online' ? '<span class="badge badge--online">🌐 Online</span>' : ''}
        ${deal.isLimitedStock ? '<span class="badge badge--expiring">⚠️ Limited Stock</span>' : ''}
      `;
    }
  },

  // ─── Header ────────────────────────────────────────────────────────────────
  _renderHeader() {
    const deal = this.deal;

    const badgesEl = document.getElementById('deal-badges');
    if (badgesEl) {
      badgesEl.innerHTML = `<span class="badge badge--category">${deal.category}</span>`;
    }

    const titleEl = document.getElementById('deal-title');
    if (titleEl) titleEl.textContent = deal.title;

    document.title = `${deal.title} — Neardis`;
  },

  // ─── Price Row ─────────────────────────────────────────────────────────────
  _renderPriceRow() {
    const deal = this.deal;
    const el   = document.getElementById('deal-price-row');
    if (!el) return;

    const currency = deal.currency || 'PKR';
    const fmt      = (n) => new Intl.NumberFormat('en-PK').format(n);

    el.innerHTML = `
      ${deal.discountedPrice
        ? `<span class="deal-price__discounted">${currency} ${fmt(deal.discountedPrice)}</span>`
        : ''}
      ${deal.originalPrice
        ? `<span class="deal-price__original">${currency} ${fmt(deal.originalPrice)}</span>`
        : ''}
      <span class="deal-price__discount-badge">${deal.discountPercent}% OFF</span>
    `;
  },

  // ─── Meta Row ──────────────────────────────────────────────────────────────
  _renderMetaRow() {
    const deal = this.deal;
    const el   = document.getElementById('deal-meta-row');
    if (!el) return;

    const distance = this.userLat && deal.location?.coordinates
      ? window.Haversine.dealDistance(deal, this.userLat, this.userLng)
      : null;

    const rating = deal.averageRating
      ? `${'⭐'.repeat(Math.round(deal.averageRating))} ${deal.averageRating.toFixed(1)} (${deal.totalReviews})`
      : null;

    el.innerHTML = `
      ${distance ? `<span class="deal-meta-item"><span class="deal-meta-item__icon">📍</span>${distance} away</span>` : ''}
      ${deal.business?.businessName
        ? `<span class="deal-meta-item"><span class="deal-meta-item__icon">🏪</span>${deal.business.businessName}</span>`
        : ''}
      ${rating
        ? `<span class="deal-meta-item">${rating}</span>`
        : ''}
      <span class="deal-meta-item"><span class="deal-meta-item__icon">🏷️</span>${deal.dealType === 'online' ? 'Online Deal' : deal.dealType === 'both' ? 'Local & Online' : 'Local Deal'}</span>
      <span class="deal-meta-item"><span class="deal-meta-item__icon">👁️</span>${deal.analytics?.views || 0} views</span>
    `;
  },

  // ─── Countdown ─────────────────────────────────────────────────────────────
  _renderCountdown() {
    const deal    = this.deal;
    const card    = document.getElementById('deal-countdown-card');
    const timerEl = document.getElementById('deal-countdown-timer');
    const dateEl  = document.getElementById('deal-countdown-date');

    if (!card || !timerEl) return;

    // Set expiry date label
    if (dateEl) {
      dateEl.textContent = `Expires: ${new Date(deal.expiresAt).toLocaleString('en-PK', {
        dateStyle: 'medium', timeStyle: 'short'
      })}`;
    }

    // Start timer
    timerEl.dataset.expires = deal.expiresAt;
    window.Timer.start(timerEl, deal.expiresAt, {
      compact:     false,
      showSeconds: true,
      expiredText: 'Expired',
      onExpire: () => {
        card?.classList.add('deal-countdown-card--urgent');
      }
    });

    // Apply urgency border immediately
    const urgency = window.Timer.urgencyLevel(deal.expiresAt);
    if (urgency === 'urgent' || urgency === 'expired') {
      card.classList.add('deal-countdown-card--urgent');
    }
  },

  // ─── CTA Buttons ───────────────────────────────────────────────────────────
  _renderCTA() {
    const deal = this.deal;
    const el   = document.getElementById('deal-cta-row');
    if (!el) return;

    const isLocal  = deal.dealType === 'local'  || deal.dealType === 'both';
    const isOnline = deal.dealType === 'online' || deal.dealType === 'both';
    const expired  = window.Timer.isExpired(deal.expiresAt);

    el.innerHTML = `
      ${isLocal && deal.business?.address
        ? `<a
            href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deal.business.address)}"
            target="_blank" rel="noopener"
            class="btn btn--primary ${expired ? 'btn--ghost' : ''}"
            id="visit-shop-btn"
            ${expired ? 'style="pointer-events:none;opacity:0.5"' : ''}
          >
            🏪 Visit Shop
          </a>`
        : ''}
      ${isOnline && deal.externalLink
        ? `<a
            href="${deal.externalLink}"
            target="_blank" rel="noopener sponsored"
            class="btn btn--primary"
            id="open-link-btn"
            ${expired ? 'style="pointer-events:none;opacity:0.5"' : ''}
          >
            🌐 Open Link
          </a>`
        : ''}
      ${expired
        ? `<div class="badge badge--expiring" style="align-self:center;font-size:0.875rem;padding:8px 16px">
            ⏰ This deal has expired
           </div>`
        : ''}
    `;

    // Track clicks
    document.getElementById('visit-shop-btn')?.addEventListener('click', () => {
      window.NeardisAPI.DealsAPI.trackClick(this.dealId).catch(() => {});
    });
    document.getElementById('open-link-btn')?.addEventListener('click', () => {
      window.NeardisAPI.DealsAPI.trackClick(this.dealId).catch(() => {});
    });
  },

  // ─── Coupon Code ───────────────────────────────────────────────────────────
  _renderCoupon() {
    const deal = this.deal;
    if (!deal.couponCode) return;

    const card = document.getElementById('deal-coupon-card');
    const code = document.getElementById('deal-coupon-code');
    const btn  = document.getElementById('copy-coupon-btn');

    card?.classList.remove('hidden');
    if (code) code.textContent = deal.couponCode;

    btn?.addEventListener('click', () => {
      window.NeardisAPI.Clipboard.copy(deal.couponCode);
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  },

  // ─── Shop Card ─────────────────────────────────────────────────────────────
  _renderShop() {
    const deal     = this.deal;
    const business = deal.business;
    const el       = document.getElementById('deal-shop-card');
    if (!el || !business) return;

    const occupancy = business.liveOccupancy?.enabled
      ? `<span class="occupancy-badge occupancy-badge--${business.liveOccupancy.currentLevel}">
           🔴 ${business.liveOccupancy.currentLevel.charAt(0).toUpperCase() + business.liveOccupancy.currentLevel.slice(1)} Occupancy
         </span>`
      : '';

    el.innerHTML = `
      <img
        src="${business.logo || ''}"
        alt="${business.businessName}"
        class="deal-shop__logo"
        onerror="this.style.display='none'"
      />
      <div class="deal-shop__info">
        <h3 class="deal-shop__name">
          ${business.businessName}
          ${business.isVerified ? '<span class="deal-shop__verified" title="Verified">✓</span>' : ''}
        </h3>
        <div class="deal-shop__meta">
          ${business.address?.city ? `<span>📍 ${business.address.city}${business.address.country ? ', ' + business.address.country : ''}</span>` : ''}
          ${business.phone        ? `<span>📞 ${business.phone}</span>` : ''}
          ${business.averageRating ? `<span>⭐ ${business.averageRating.toFixed(1)} rating</span>` : ''}
          ${occupancy}
        </div>
        <div class="deal-shop__links">
          ${business.website
            ? `<a href="${business.website}" target="_blank" rel="noopener" class="deal-shop__link">🌐 Website</a>`
            : ''}
          ${business.socialLinks?.instagram
            ? `<a href="${business.socialLinks.instagram}" target="_blank" rel="noopener" class="deal-shop__link">📸 Instagram</a>`
            : ''}
          ${business.socialLinks?.whatsapp
            ? `<a href="https://wa.me/${business.socialLinks.whatsapp}" target="_blank" rel="noopener" class="deal-shop__link">💬 WhatsApp</a>`
            : ''}
        </div>
      </div>
    `;
  },

  // ─── Description ───────────────────────────────────────────────────────────
  _renderDescription() {
    const el = document.getElementById('deal-description');
    if (!el) return;

    if (!this.deal.description) {
      document.getElementById('deal-desc-section')?.classList.add('hidden');
      return;
    }

    el.textContent = this.deal.description;
  },

  // ─── Worth It ──────────────────────────────────────────────────────────────
  _renderWorthIt() {
    const deal    = this.deal;
    const bar     = document.getElementById('worthit-bar');
    const pct     = document.getElementById('worthit-percent');
    const score   = deal.worthItScore || 0;

    if (bar)  bar.style.setProperty('--worth-pct', `${score}%`);
    if (pct)  pct.textContent = `${score}%`;

    // Vote buttons
    document.getElementById('worthit-yes')?.addEventListener('click', () => this._voteWorthIt(true));
    document.getElementById('worthit-no')?.addEventListener('click',  () => this._voteWorthIt(false));
  },

  async _voteWorthIt(value) {
    const { Auth, Toast } = window.NeardisAPI;
    if (!Auth.isLoggedIn()) {
      Toast.info('Please log in to vote.');
      return;
    }

    // Submit as part of review (simplified: use review API)
    Toast.info(value ? '👍 Thanks for your vote!' : '👎 Thanks for your feedback!');

    // Optimistic UI update
    const bar = document.getElementById('worthit-bar');
    const pct = document.getElementById('worthit-percent');
    const yes = this.deal.worthItVotes?.yes || 0;
    const no  = this.deal.worthItVotes?.no  || 0;
    const total = yes + no + 1;
    const newYes = value ? yes + 1 : yes;
    const newPct = Math.round((newYes / total) * 100);

    if (bar) bar.style.setProperty('--worth-pct', `${newPct}%`);
    if (pct) pct.textContent = `${newPct}%`;

    // Disable buttons after vote
    document.getElementById('worthit-yes')?.setAttribute('disabled', 'true');
    document.getElementById('worthit-no')?.setAttribute('disabled', 'true');
  },

  // ─── Sightings ─────────────────────────────────────────────────────────────
  _renderSightings() {
    const deal = this.deal;
    const el   = document.getElementById('sightings-status');
    if (!el) return;

    const count    = deal.sightings?.length || 0;
    const lastSeen = deal.lastSightedAt
      ? `Last seen ${this._timeAgo(deal.lastSightedAt)}`
      : 'No sightings yet';

    el.innerHTML = `
      <span class="sightings-available">
        ${deal.isStillAvailable ? '✅ Still Available' : '❓ Unknown'}
      </span>
      <span class="sightings-time">${count} sighting${count !== 1 ? 's' : ''} · ${lastSeen}</span>
    `;
  },

  // ─── Sighting Report ───────────────────────────────────────────────────────
  _bindSightingReport() {
    document.getElementById('report-sighting-btn')?.addEventListener('click', async () => {
      const { Auth, DealsAPI, Toast } = window.NeardisAPI;
      if (!Auth.isLoggedIn()) {
        Toast.info('Please log in to report a sighting.');
        return;
      }

      const btn = document.getElementById('report-sighting-btn');
      btn.disabled    = true;
      btn.textContent = 'Reporting…';

      try {
        await DealsAPI.reportSighting(this.dealId, '');
        Toast.success('Sighting reported! Thanks 👀');
        btn.textContent = '✅ Reported!';
        this._renderSightings();
      } catch (err) {
        Toast.error(err.message || 'Could not report sighting.');
        btn.disabled    = false;
        btn.textContent = '📍 I See It! Report Sighting';
      }
    });
  },

  // ─── Bookmark ──────────────────────────────────────────────────────────────
  _bindBookmark() {
    const btn = document.getElementById('bookmark-btn');
    if (!btn) return;

    if (this.isBookmarked) btn.classList.add('icon-action-btn--active');

    btn.addEventListener('click', async () => {
      const { Auth, BookmarksAPI, Toast } = window.NeardisAPI;
      if (!Auth.isLoggedIn()) {
        Toast.info('Please log in to bookmark deals.');
        return;
      }

      try {
        if (this.isBookmarked) {
          await BookmarksAPI.removeBookmark(this.dealId);
          this.isBookmarked = false;
          btn.classList.remove('icon-action-btn--active');
          Toast.success('Bookmark removed.');
        } else {
          await BookmarksAPI.addBookmark(this.dealId);
          this.isBookmarked = true;
          btn.classList.add('icon-action-btn--active');
          Toast.success('Deal bookmarked! 🔖');
        }
      } catch (err) {
        Toast.error(err.message || 'Could not update bookmark.');
      }
    });
  },

  // ─── Share ─────────────────────────────────────────────────────────────────
  _bindShare() {
    document.getElementById('share-btn')?.addEventListener('click', () => {
      window.NeardisAPI.Share.deal(this.deal);
    });
  },

  // ─── Review Form ───────────────────────────────────────────────────────────
  _bindReviewForm() {
    const writeBtn   = document.getElementById('write-review-btn');
    const form       = document.getElementById('review-form');
    const cancelBtn  = document.getElementById('cancel-review-btn');
    const submitBtn  = document.getElementById('submit-review-btn');
    const stars      = document.querySelectorAll('#review-stars span');
    const yesVote    = document.getElementById('worthit-vote-yes');
    const noVote     = document.getElementById('worthit-vote-no');

    writeBtn?.addEventListener('click', () => {
      const { Auth, Toast } = window.NeardisAPI;
      if (!Auth.isLoggedIn()) {
        Toast.info('Please log in to write a review.');
        return;
      }
      form?.classList.toggle('hidden');
      writeBtn.textContent = form?.classList.contains('hidden') ? '✍️ Write Review' : '✕ Cancel';
    });

    cancelBtn?.addEventListener('click', () => {
      form?.classList.add('hidden');
      writeBtn.textContent = '✍️ Write Review';
    });

    // Star rating
    stars.forEach((star, i) => {
      star.addEventListener('click', () => {
        this.reviewRating = i + 1;
        stars.forEach((s, j) => s.classList.toggle('active', j <= i));
      });
      star.addEventListener('mouseenter', () => {
        stars.forEach((s, j) => s.classList.toggle('active', j <= i));
      });
    });

    document.getElementById('review-stars')?.addEventListener('mouseleave', () => {
      stars.forEach((s, j) => s.classList.toggle('active', j < this.reviewRating));
    });

    // Worth It vote
    yesVote?.addEventListener('click', () => {
      this.worthItVote = true;
      yesVote.classList.add('pill--active');
      noVote?.classList.remove('pill--active');
    });

    noVote?.addEventListener('click', () => {
      this.worthItVote = false;
      noVote.classList.add('pill--active');
      yesVote?.classList.remove('pill--active');
    });

    // Submit
    submitBtn?.addEventListener('click', async () => {
      const comment = document.getElementById('review-comment')?.value.trim();

      if (!this.reviewRating) {
        window.NeardisAPI.Toast.warning('Please select a star rating.');
        return;
      }

      submitBtn.disabled    = true;
      submitBtn.textContent = 'Submitting…';

      try {
        const fd = new FormData();
        fd.append('rating',  this.reviewRating);
        if (comment)              fd.append('comment',  comment);
        if (this.worthItVote !== null) fd.append('worthIt', this.worthItVote);

        await window.NeardisAPI.ReviewsAPI.createReview(this.dealId, fd);
        window.NeardisAPI.Toast.success('Review submitted! ✅');

        form?.classList.add('hidden');
        writeBtn.textContent = '✍️ Write Review';
        document.getElementById('review-comment').value = '';
        this.reviewRating = 0;
        stars.forEach(s => s.classList.remove('active'));

        // Reload reviews
        this.reviewPage = 1;
        await this.loadReviews(true);

      } catch (err) {
        window.NeardisAPI.Toast.error(err.message || 'Failed to submit review.');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Submit Review';
      }
    });
  },

  // ─── Load Reviews ──────────────────────────────────────────────────────────
  async loadReviews(reset = false) {
    if (reset) {
      this.reviewPage = 1;
      document.getElementById('reviews-list').innerHTML = `
        <div class="flex items-center gap-3" style="padding:0.5rem 0">
          <div class="spinner"></div>
          <span style="font-size:0.875rem;color:var(--text-secondary)">Loading reviews…</span>
        </div>`;
    }

    try {
      const res     = await window.NeardisAPI.ReviewsAPI.getDealReviews(this.dealId, {
        page:  this.reviewPage,
        limit: this.reviewLimit
      });
      const reviews = res.reviews || [];

      const list = document.getElementById('reviews-list');

      if (reset) list.innerHTML = '';

      if (!reviews.length && reset) {
        list.innerHTML = `
          <div class="empty-state" style="padding:1.5rem 0">
            <div class="empty-state__icon">💬</div>
            <p class="empty-state__text">No reviews yet. Be the first!</p>
          </div>`;
        return;
      }

      reviews.forEach(review => {
        const el = document.createElement('div');
        el.innerHTML = this._renderReviewCard(review);
        list.appendChild(el.firstElementChild);
      });

      // Load more button
      const loadMoreWrap = document.getElementById('reviews-load-more');
      if (loadMoreWrap) {
        loadMoreWrap.style.display = res.hasMore ? 'flex' : 'none';
      }

      document.getElementById('load-more-reviews-btn')?.addEventListener('click', async () => {
        this.reviewPage++;
        await this.loadReviews(false);
      });

      // Bind helpful buttons
      this._bindHelpfulVotes();

    } catch (err) {
      console.error('Reviews load error:', err);
    }
  },

  // ─── Render Review Card ────────────────────────────────────────────────────
  _renderReviewCard(review) {
    const stars = '⭐'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const date  = this._timeAgo(review.createdAt);
    const avatar = review.user?.avatar
      ? `<img src="${review.user.avatar}" alt="${review.user.name}" />`
      : `<span>${(review.user?.name || 'U')[0].toUpperCase()}</span>`;

    return `
      <div class="review-card" data-review-id="${review._id}">
        <div class="review-card__header">
          <div class="review-card__user">
            <div class="review-card__avatar">${avatar}</div>
            <div>
              <div class="review-card__name">${review.user?.name || 'Anonymous'}</div>
              <div class="review-card__date">${date}</div>
            </div>
          </div>
          <span class="review-card__stars">${stars}</span>
        </div>

        ${review.comment
          ? `<p class="review-card__comment">${review.comment}</p>`
          : ''}

        <div class="review-card__footer">
          <button
            class="review-card__helpful ${review.markedHelpful ? 'review-card__helpful--active' : ''}"
            data-review-id="${review._id}"
          >
            👍 Helpful (${review.helpfulVotes || 0})
          </button>

          ${review.worthIt !== null && review.worthIt !== undefined
            ? `<span class="review-card__worthit ${review.worthIt ? 'review-card__worthit--yes' : 'review-card__worthit--no'}">
                ${review.worthIt ? '✅ Worth It' : '❌ Not Worth It'}
               </span>`
            : ''}
        </div>

        ${review.reply?.text
          ? `<div class="review-card__reply">
               <div class="review-card__reply-label">🏪 Business Response</div>
               <p class="review-card__reply-text">${review.reply.text}</p>
             </div>`
          : ''}
      </div>`;
  },

  // ─── Helpful Vote Binding ──────────────────────────────────────────────────
  _bindHelpfulVotes() {
    document.querySelectorAll('.review-card__helpful').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { Auth, ReviewsAPI, Toast } = window.NeardisAPI;
        if (!Auth.isLoggedIn()) { Toast.info('Please log in to vote.'); return; }

        const reviewId = btn.dataset.reviewId;
        try {
          const res = await ReviewsAPI.toggleHelpful(reviewId);
          btn.classList.toggle('review-card__helpful--active', res.marked);
          btn.textContent = `👍 Helpful (${res.helpfulVotes})`;
        } catch (err) {
          Toast.error(err.message || 'Could not record vote.');
        }
      });
    });
  },

  // ─── Update OG Meta Tags ───────────────────────────────────────────────────
  _updateMetaTags() {
    const deal = this.deal;
    document.getElementById('meta-description')?.setAttribute('content', deal.description || deal.title);
    document.getElementById('og-title')?.setAttribute('content',       `${deal.title} — ${deal.discountPercent}% OFF on Neardis`);
    document.getElementById('og-description')?.setAttribute('content', deal.description || `${deal.discountPercent}% discount at ${deal.business?.businessName}`);
    document.getElementById('og-image')?.setAttribute('content',       deal.thumbnail   || '');
  },

  // ─── Show Error ────────────────────────────────────────────────────────────
  _showError() {
    document.getElementById('deal-skeleton')?.classList.add('hidden');
    document.getElementById('deal-error')?.classList.remove('hidden');
  },

  // ─── Time Ago Helper ───────────────────────────────────────────────────────
  _timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr);
    const mins = Math.floor(diff / 60000);
    if (mins < 1)    return 'just now';
    if (mins < 60)   return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)    return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => DealPage.init());
window.DealPage = DealPage;
