// ─── Category Page State ──────────────────────────────────────────────────────
const CategoryPage = {
  category:    '',
  sort:        '',
  flashOnly:   false,
  page:        1,
  limit:       20,
  loading:     false,
  hasMore:     true,
  userLat:     null,
  userLng:     null,
  observer:    null,
  counts:      {},

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    // Show skeletons immediately
    const grid = document.getElementById('deals-grid');
    if (grid) grid.innerHTML = this._skeletons(8);

    this._readURLParams();
    this._bindCategoryCards();
    this._bindSubFilters();
    this._initInfiniteScroll();

    // Get user location (non-blocking)
    window.NeardisAPI.Geo.getPosition()
      .then(pos => { this.userLat = pos.lat; this.userLng = pos.lng; })
      .catch(() => {});

    await Promise.all([
      this.loadCounts(),
      this.loadDeals(true)
    ]);
  },

  // ─── Read URL Params ───────────────────────────────────────────────────────
  _readURLParams() {
    const params = new URLSearchParams(window.location.search);
    const cat    = params.get('category') || params.get('filter') || '';

    if (cat === 'flash') {
      this.flashOnly = true;
      document.getElementById('flash-only-toggle') &&
        (document.getElementById('flash-only-toggle').checked = true);
    } else if (cat) {
      this.category = cat;
      this._setActiveCard(cat);
    }
  },

  // ─── Load Category Counts ─────────────────────────────────────────────────
  async loadCounts() {
    const categories = ['Food', 'Clothes', 'Cosmetics', 'Electronics', 'Health', 'Services', 'Others'];

    try {
      // Fetch all deals count
      const allRes = await window.NeardisAPI.DealsAPI.getDeals({ limit: 1 });
      const allEl  = document.getElementById('count-all');
      if (allEl) allEl.textContent = allRes.total || 0;

      // Fetch per-category counts (parallel)
      await Promise.all(categories.map(async (cat) => {
        try {
          const res = await window.NeardisAPI.DealsAPI.getDeals({ category: cat, limit: 1 });
          const el  = document.getElementById(`count-${cat}`);
          if (el) el.textContent = res.total || 0;
          this.counts[cat] = res.total || 0;
        } catch {}
      }));
    } catch {}
  },

  // ─── Load Deals ────────────────────────────────────────────────────────────
  async loadDeals(reset = false) {
    if (this.loading) return;
    if (!reset && !this.hasMore) return;

    this.loading = true;

    const grid    = document.getElementById('deals-grid');
    const spinner = document.getElementById('load-more-spinner');
    const empty   = document.getElementById('empty-state');

    if (reset) {
      this.page    = 1;
      this.hasMore = true;
      grid.innerHTML = this._skeletons(8);
      empty?.classList.add('hidden');
    }

    if (!reset && spinner) spinner.classList.remove('hidden');

    try {
      const params = {
        page:  this.page,
        limit: this.limit,
        sort:  this.sort,
        ...(this.category  && { category:    this.category }),
        ...(this.flashOnly && { isFlashDeal: 'true' })
      };

      const res   = this.userLat && !this.category
        ? await window.NeardisAPI.DealsAPI.getNearby({
            ...params, lat: this.userLat, lng: this.userLng, radius: 10000
          })
        : await window.NeardisAPI.DealsAPI.getDeals(params);

      const deals = res.deals || [];
      this.hasMore = res.hasMore || false;
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
        card.style.animationDelay = `${i * 0.04}s`;
        grid.appendChild(card);
      });

      window.Timer.initAll();
      window.Global.initLazyLoad();

    } catch (err) {
      console.error('Category load error:', err);
      window.NeardisAPI.Toast.error('Failed to load deals.');
    } finally {
      this.loading = false;
      if (spinner) spinner.classList.add('hidden');
    }
  },

  // ─── Bind Category Cards ───────────────────────────────────────────────────
  _bindCategoryCards() {
    document.getElementById('category-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.category-card');
      if (!card) return;

      document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      this.category = card.dataset.category || '';

      const label = document.getElementById('active-category-label');
      if (label) {
        label.textContent = this.category
          ? `${card.querySelector('.category-card__icon').textContent} ${this.category}`
          : 'All Deals';
      }

      this.loadDeals(true);

      // Update URL without reload
      const url = new URL(window.location);
      this.category
        ? url.searchParams.set('category', this.category)
        : url.searchParams.delete('category');
      window.history.replaceState({}, '', url);
    });
  },

  // ─── Bind Sub-Filters ─────────────────────────────────────────────────────
  _bindSubFilters() {
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.sort = e.target.value;
      this.loadDeals(true);
    });

    document.getElementById('flash-only-toggle')?.addEventListener('change', (e) => {
      this.flashOnly = e.target.checked;
      this.loadDeals(true);
    });
  },

  // ─── Set Active Card ──────────────────────────────────────────────────────
  _setActiveCard(category) {
    document.querySelectorAll('.category-card').forEach(c => {
      c.classList.toggle('active', c.dataset.category === category);
    });

    const label = document.getElementById('active-category-label');
    if (label && category) {
      const card = document.querySelector(`.category-card[data-category="${category}"]`);
      const icon = card?.querySelector('.category-card__icon')?.textContent || '🏷️';
      label.textContent = `${icon} ${category}`;
    }
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
    this.category  = '';
    this.sort      = '';
    this.flashOnly = false;
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
    document.querySelector('.category-card--all')?.classList.add('active');
    document.getElementById('sort-select') && (document.getElementById('sort-select').value = '');
    document.getElementById('flash-only-toggle') && (document.getElementById('flash-only-toggle').checked = false);
    document.getElementById('active-category-label') && (document.getElementById('active-category-label').textContent = 'All Deals');
    this.loadDeals(true);
  },

  // ─── Render Deal Card ─────────────────────────────────────────────────────
  _renderDealCard(deal) {
    const isFlash   = deal.isFlashDeal;
    const isBoosted = deal.isBoosted;
    const urgency   = window.Timer.urgencyLevel(deal.expiresAt);
    const distance  = this.userLat
      ? window.Haversine.dealDistance(deal, this.userLat, this.userLng)
      : '';

    return `
      <article class="card deal-card animate-fade-in ${isFlash ? 'card--flash' : ''} ${isBoosted ? 'card--boosted' : ''}">
        <a href="/client/pages/deal.html?id=${deal._id}" class="deal-card__image-wrap">
          <img
            data-src="${deal.thumbnail || ''}"
            src="/client/assets/placeholder.png"
            alt="${deal.title}"
            class="deal-card__image"
            loading="lazy"
          />
          <div class="deal-card__badges">
            <span class="badge badge--discount">${deal.discountPercent}% OFF</span>
            ${isFlash   ? '<span class="badge badge--flash">⚡ FLASH</span>' : ''}
            ${isBoosted ? '<span class="badge badge--boosted">⭐</span>'       : ''}
          </div>
        </a>
        <div class="deal-card__body">
          <a href="/client/pages/deal.html?id=${deal._id}">
            <h3 class="deal-card__title">${deal.title}</h3>
          </a>
          <div class="deal-card__meta">
            <span class="badge badge--category">${deal.category}</span>
            ${distance ? `<span>📍 ${distance}</span>` : ''}
          </div>
          <div class="deal-card__footer">
            <span
              class="timer timer--${urgency}"
              data-expires="${deal.expiresAt}"
              data-compact="true"
              data-expired-text="Expired"
            ></span>
            <button
              class="deal-card__bookmark"
              onclick="CategoryPage.toggleBookmark(event,'${deal._id}')"
              aria-label="Bookmark"
            >🔖</button>
          </div>
        </div>
      </article>`;
  },

  // ─── Toggle Bookmark ─────────────────────────────────────────────────────
  async toggleBookmark(e, dealId) {
    e.preventDefault();
    e.stopPropagation();
    const { Auth, BookmarksAPI, Toast } = window.NeardisAPI;
    if (!Auth.isLoggedIn()) { Toast.info('Please log in to bookmark deals.'); return; }
    const btn    = e.currentTarget;
    const saved  = btn.classList.contains('deal-card__bookmark--saved');
    try {
      saved
        ? await BookmarksAPI.removeBookmark(dealId)
        : await BookmarksAPI.addBookmark(dealId);
      btn.classList.toggle('deal-card__bookmark--saved', !saved);
      Toast.success(saved ? 'Bookmark removed.' : 'Bookmarked! 🔖');
    } catch (err) {
      Toast.error(err.message || 'Could not update bookmark.');
    }
  },

  // ─── Skeletons ───────────────────────────────────────────────────────────
  _skeletons(n) {
    return Array(n).fill(`
      <div class="card deal-card">
        <div class="skeleton" style="height:200px"></div>
        <div class="deal-card__body">
          <div class="skeleton" style="height:14px;width:80%;margin-bottom:8px"></div>
          <div class="skeleton" style="height:12px;width:50%"></div>
        </div>
      </div>`).join('');
  }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => CategoryPage.init());
window.CategoryPage = CategoryPage;
