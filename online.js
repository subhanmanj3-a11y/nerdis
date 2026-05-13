// ─── Online Page State ────────────────────────────────────────────────────────
const OnlinePage = {
  category:   '',
  sort:        '',
  couponOnly:  false,
  page:        1,
  limit:       20,
  loading:     false,
  hasMore:     true,
  observer:    null,

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    this._bindFilters();
    this._initInfiniteScroll();
    await Promise.all([
      this.loadStats(),
      this.loadDeals(true)
    ]);
  },

  // ─── Load Stats ────────────────────────────────────────────────────────────
  async loadStats() {
    try {
      const res   = await window.NeardisAPI.DealsAPI.getOnline({ limit: 100 });
      const deals = res.deals || [];

      const total          = res.total || 0;
      const withCoupons    = deals.filter(d => d.couponCode).length;
      const avgDiscount    = deals.length
        ? Math.round(deals.reduce((s, d) => s + d.discountPercent, 0) / deals.length)
        : 0;

      const statTotal   = document.getElementById('stat-total');
      const statCoupons = document.getElementById('stat-coupons');
      const statAvg     = document.getElementById('stat-avg-discount');

      if (statTotal)   statTotal.textContent   = total;
      if (statCoupons) statCoupons.textContent  = withCoupons + '+';
      if (statAvg)     statAvg.textContent      = avgDiscount + '%';
    } catch {}
  },

  // ─── Load Deals ────────────────────────────────────────────────────────────
  async loadDeals(reset = false) {
    if (this.loading) return;
    if (!reset && !this.hasMore) return;

    this.loading = true;

    const grid    = document.getElementById('online-deals-grid');
    const spinner = document.getElementById('load-more-spinner');
    const empty   = document.getElementById('empty-state');

    if (reset) {
      this.page    = 1;
      this.hasMore = true;
      grid.innerHTML = this._skeletons(6);
      empty?.classList.add('hidden');
    }

    if (!reset && spinner) spinner.classList.remove('hidden');

    try {
      const params = {
        page:  this.page,
        limit: this.limit,
        sort:  this.sort,
        ...(this.category && { category: this.category })
      };

      const res   = await window.NeardisAPI.DealsAPI.getOnline(params);
      let deals   = res.deals || [];

      // Client-side coupon filter
      if (this.couponOnly) deals = deals.filter(d => d.couponCode);

      this.hasMore = res.hasMore && !this.couponOnly;
      this.page++;

      if (reset) grid.innerHTML = '';

      if (!deals.length && reset) {
        empty?.classList.remove('hidden');
        return;
      }

      deals.forEach((deal, i) => {
        const el = document.createElement('div');
        el.innerHTML = this._renderDealCard(deal);
        const card = el.firstElementChild;
        card.style.animationDelay = `${i * 0.05}s`;
        grid.appendChild(card);
        this._bindCopyBtn(card, deal);
      });

      window.Timer.initAll();
      window.Global.initLazyLoad();

    } catch (err) {
      console.error('Online deals error:', err);
      window.NeardisAPI.Toast.error('Failed to load online deals.');
    } finally {
      this.loading = false;
      if (spinner) spinner.classList.add('hidden');
    }
  },

  // ─── Bind Copy Button ─────────────────────────────────────────────────────
  _bindCopyBtn(card, deal) {
    const btn = card.querySelector('.coupon-box__copy');
    if (!btn || !deal.couponCode) return;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      await window.NeardisAPI.Clipboard.copy(deal.couponCode);
      btn.textContent = '✅ Copied!';
      btn.classList.add('coupon-box__copy--copied');

      // Track click (affiliate)
      window.NeardisAPI.DealsAPI.trackClick(deal._id).catch(() => {});

      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('coupon-box__copy--copied');
      }, 2500);
    });
  },

  // ─── Bind Filters ─────────────────────────────────────────────────────────
  _bindFilters() {
    // Category pills
    document.getElementById('category-pills')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('#category-pills .pill').forEach(p => p.classList.remove('pill--active'));
      pill.classList.add('pill--active');
      this.category = pill.dataset.category || '';
      this.loadDeals(true);
    });

    // Coupon only toggle
    document.getElementById('coupon-only-toggle')?.addEventListener('change', (e) => {
      this.couponOnly = e.target.checked;
      this.loadDeals(true);
    });

    // Sort
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.sort = e.target.value;
      this.loadDeals(true);
    });
  },

  // ─── Infinite Scroll ──────────────────────────────────────────────────────
  _initInfiniteScroll() {
    const trigger = document.getElementById('infinite-scroll-trigger');
    if (!trigger) return;

    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.loading && this.hasMore) {
        this.loadDeals(false);
      }
    }, { rootMargin: '200px' });

    this.observer.observe(trigger);
  },

  // ─── Reset ────────────────────────────────────────────────────────────────
  reset() {
    this.category   = '';
    this.sort        = '';
    this.couponOnly  = false;
    document.querySelectorAll('#category-pills .pill').forEach(p => p.classList.remove('pill--active'));
    document.querySelector('#category-pills .pill[data-category=""]')?.classList.add('pill--active');
    document.getElementById('sort-select') && (document.getElementById('sort-select').value = '');
    document.getElementById('coupon-only-toggle') && (document.getElementById('coupon-only-toggle').checked = false);
    this.loadDeals(true);
  },

  // ─── Render Deal Card ─────────────────────────────────────────────────────
  _renderDealCard(deal) {
    const urgency  = window.Timer.urgencyLevel(deal.expiresAt);
    const isFlash  = deal.isFlashDeal;
    const isBoosted= deal.isBoosted;
    const shopLogo = deal.business?.logo || '';
    const shopName = deal.business?.businessName || '';
    const isVerified = deal.business?.isVerified;

    const couponSection = deal.couponCode
      ? `<div class="coupon-box">
           <span class="coupon-box__code">${deal.couponCode}</span>
           <button class="coupon-box__copy">Copy</button>
         </div>`
      : `<div class="coupon-box coupon-box--no-code">
           <span class="coupon-box__no-code-text">No code needed — discount applied automatically</span>
         </div>`;

    const openLink = deal.externalLink || deal.affiliateLink || '#';

    return `
      <article class="card online-deal-card animate-fade-in ${isFlash ? 'card--flash' : ''} ${isBoosted ? 'card--boosted' : ''}">
        <div class="online-deal-card__image-wrap">
          <img
            data-src="${deal.thumbnail || ''}"
            src="/client/assets/placeholder.png"
            alt="${deal.title}"
            class="online-deal-card__image"
            loading="lazy"
          />
          <div class="online-deal-card__badges">
            <span class="badge badge--discount">${deal.discountPercent}% OFF</span>
            ${isFlash   ? '<span class="badge badge--flash">⚡ FLASH</span>'    : ''}
            ${isBoosted ? '<span class="badge badge--boosted">⭐ Featured</span>' : ''}
            <span class="badge badge--online">🌐 Online</span>
          </div>
          ${shopLogo
            ? `<img src="${shopLogo}" alt="${shopName}" class="online-deal-card__shop-logo"
                    onerror="this.style.display='none'" />`
            : ''}
        </div>

        <div class="online-deal-card__body">
          <div class="online-deal-card__header">
            <div class="online-deal-card__info">
              <div class="online-deal-card__shop">
                ${shopName}
                ${isVerified ? '<span style="color:var(--accent-blue)">✓</span>' : ''}
              </div>
              <a href="/client/pages/deal.html?id=${deal._id}">
                <h3 class="online-deal-card__title">${deal.title}</h3>
              </a>
            </div>
            <span class="online-deal-card__discount">${deal.discountPercent}%</span>
          </div>

          ${couponSection}

          <div class="online-deal-card__footer">
            <span
              class="online-deal-card__timer timer timer--${urgency}"
              data-expires="${deal.expiresAt}"
              data-compact="true"
              data-expired-text="Expired"
            ></span>
            <a
              href="${openLink}"
              target="_blank"
              rel="noopener sponsored"
              class="online-deal-card__open-btn"
              onclick="window.NeardisAPI.DealsAPI.trackClick('${deal._id}').catch(()=>{})"
            >
              Shop Now →
            </a>
          </div>
        </div>
      </article>`;
  },

  // ─── Skeletons ───────────────────────────────────────────────────────────
  _skeletons(n) {
    return Array(n).fill(`
      <div class="card online-deal-card">
        <div class="skeleton" style="height:180px"></div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:0.75rem">
          <div class="skeleton" style="height:14px;width:75%"></div>
          <div class="skeleton" style="height:40px;border-radius:10px"></div>
          <div class="skeleton" style="height:36px;border-radius:10px"></div>
        </div>
      </div>`).join('');
  }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => OnlinePage.init());
window.OnlinePage = OnlinePage;
