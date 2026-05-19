// ─── Feed State ───────────────────────────────────────────────────────────────
const Feed = {
  page:        1,
  limit:       20,
  loading:     false,
  hasMore:     true,
  category:    '',
  sort:        '',
  viewMode:    'grid',
  userLat:     null,
  userLng:     null,
  observer:    null,
  searchQuery: '',

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    // Show skeletons immediately before any async work
    const grid = document.getElementById('deals-grid');
    if (grid) grid.innerHTML = this._skeletons(8);

    this._readURLParams();
    await this._detectLocation();
    this._bindFilters();
    this._bindViewToggle();
    this._bindSurpriseMe();
    this._initInfiniteScroll();
    await Promise.all([
      this.loadFlashDeals(),
      this.loadDeals(true)
    ]);
  },

  // ─── Read URL Params ───────────────────────────────────────────────────────
  _readURLParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('search'))   this.searchQuery = params.get('search');
    if (params.get('category')) this.category    = params.get('category');
    if (params.get('sort'))     this.sort        = params.get('sort');
  },

  // ─── Detect Geolocation ────────────────────────────────────────────────────
  async _detectLocation() {
    const label = document.getElementById('location-label');

    try {
      const pos = await window.NeardisAPI.Geo.getPosition();
      this.userLat = pos.lat;
      this.userLng = pos.lng;

      // Reverse geocode using Nominatim (free, no key)
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`
        );
        const data = await resp.json();
        const area = data.address?.suburb || data.address?.city_district ||
                     data.address?.city   || data.address?.town || 'your area';
        if (label) label.textContent = area;
      } catch {
        if (label) label.textContent = 'your location';
      }

      document.getElementById('location-bar')?.classList.add('location-bar--located');
    } catch {
      // Fallback to default coords (Lahore)
      this.userLat = window.NeardisAPI.Geo.fallback.lat;
      this.userLng = window.NeardisAPI.Geo.fallback.lng;
      if (label) label.textContent = 'Lahore (default)';
    }

    // Bind refresh button
    document.getElementById('refresh-location-btn')?.addEventListener('click', async () => {
      if (label) label.textContent = 'Detecting…';
      window.NeardisAPI.Geo.cachedPosition = null;
      await this._detectLocation();
      this.reset();
    });
  },

  // ─── Load Flash Deals ──────────────────────────────────────────────────────
  async loadFlashDeals() {
    const container = document.getElementById('flash-scroll');
    const skeleton  = document.getElementById('flash-skeleton');

    try {
      const res   = await window.NeardisAPI.DealsAPI.getFlash({ limit: 8 });
      const deals = res.deals || [];

      if (skeleton) skeleton.remove();

      if (!deals.length) {
        document.getElementById('flash-section')?.remove();
        return;
      }

      const html = deals.map(deal => this._renderFlashCard(deal)).join('');
      container.insertAdjacentHTML('beforeend', html);

      // Init timers on flash cards
      window.Timer.initAll();

    } catch (err) {
      console.error('Flash deals error:', err);
      document.getElementById('flash-section')?.remove();
    }
  },

  // ─── Load Deals (paginated) ────────────────────────────────────────────────
  async loadDeals(reset = false) {
    if (this.loading) return;
    if (!reset && !this.hasMore) return;

    this.loading = true;

    if (reset) {
      this.page    = 1;
      this.hasMore = true;
      document.getElementById('deals-grid').innerHTML = this._skeletons(8);
      document.getElementById('empty-state')?.classList.add('hidden');
    }

    const spinner = document.getElementById('load-more-spinner');
    if (!reset && spinner) spinner.style.display = 'flex';

    try {
      const params = {
        page:     this.page,
        limit:    this.limit,
        sort:     this.sort,
        ...(this.category    && { category: this.category }),
        ...(this.searchQuery && { search:   this.searchQuery }),
      };

      let res;
      // Use nearby endpoint if we have coords
      if (this.userLat && this.userLng && !this.searchQuery) {
        res = await window.NeardisAPI.DealsAPI.getNearby({
          ...params,
          lat:    this.userLat,
          lng:    this.userLng,
          radius: 10000
        });
      } else {
        res = await window.NeardisAPI.DealsAPI.getDeals(params);
      }

      const deals = res.deals || [];
      this.hasMore = res.hasMore || false;
      this.page++;

      const grid = document.getElementById('deals-grid');

      if (reset) {
        grid.innerHTML = '';
        this._updateFeedTitle(res.total || 0);
      }

      if (!deals.length && reset) {
        document.getElementById('empty-state')?.classList.remove('hidden');
        return;
      }

      // Render cards
      deals.forEach((deal, i) => {
        const card = document.createElement('div');
        card.innerHTML = this._renderDealCard(deal);
        card.firstElementChild.style.animationDelay = `${i * 0.04}s`;
        grid.appendChild(card.firstElementChild);
      });

      // Re-init timers for new cards
      window.Timer.initAll();
      window.Global.initLazyLoad();

    } catch (err) {
      console.error('Feed load error:', err);
      window.NeardisAPI.Toast.error('Failed to load deals. Please try again.');
    } finally {
      this.loading = false;
      if (spinner) spinner.style.display = 'none';
    }
  },

  // ─── Update Feed Title ─────────────────────────────────────────────────────
  _updateFeedTitle(total) {
    const el = document.getElementById('feed-title');
    if (!el) return;

    if (this.searchQuery) {
      el.textContent = `🔍 Results for "${this.searchQuery}"`;
    } else if (this.category) {
      const icons = { Food:'🍔', Clothes:'👗', Cosmetics:'💄', Electronics:'📱', Health:'💊', Others:'🎁' };
      el.textContent = `${icons[this.category] || '🏷️'} ${this.category} Deals`;
    } else if (this.userLat) {
      el.textContent = `📍 Nearby Deals${total ? ` (${total})` : ''}`;
    } else {
      el.textContent = `🏠 Latest Deals${total ? ` (${total})` : ''}`;
    }
  },

  // ─── Bind Filter Pills ─────────────────────────────────────────────────────
  _bindFilters() {
    // Category pills
    document.getElementById('category-filters')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;

      document.querySelectorAll('#category-filters .pill').forEach(p => p.classList.remove('pill--active'));
      pill.classList.add('pill--active');

      this.category = pill.dataset.category || '';
      this.reset();
    });

    // Sort tabs
    document.getElementById('sort-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;

      document.querySelectorAll('#sort-tabs .tab').forEach(t => t.classList.remove('tab--active'));
      tab.classList.add('tab--active');

      this.sort = tab.dataset.sort || '';
      this.reset();
    });
  },

  // ─── Bind View Toggle ──────────────────────────────────────────────────────
  _bindViewToggle() {
    document.getElementById('view-grid')?.addEventListener('click', () => {
      this.viewMode = 'grid';
      document.getElementById('deals-grid')?.classList.remove('deals-grid--list');
      document.getElementById('view-grid')?.classList.add('view-btn--active');
      document.getElementById('view-list')?.classList.remove('view-btn--active');
    });

    document.getElementById('view-list')?.addEventListener('click', () => {
      this.viewMode = 'list';
      document.getElementById('deals-grid')?.classList.add('deals-grid--list');
      document.getElementById('view-list')?.classList.add('view-btn--active');
      document.getElementById('view-grid')?.classList.remove('view-btn--active');
    });
  },

  // ─── Surprise Me ──────────────────────────────────────────────────────────
  _bindSurpriseMe() {
    const btn   = document.getElementById('surprise-btn');
    const modal = document.getElementById('surprise-modal');
    const close = document.getElementById('surprise-modal-close');
    const body  = document.getElementById('surprise-modal-body');

    btn?.addEventListener('click', async () => {
      modal?.classList.add('modal-overlay--open');
      body.innerHTML = `
        <div class="flex items-center gap-3" style="padding:1rem 0">
          <div class="spinner spinner--lg"></div>
          <span>Finding a random deal near you…</span>
        </div>`;

      try {
        const params = {};
        if (this.userLat) { params.lat = this.userLat; params.lng = this.userLng; }
        const res  = await window.NeardisAPI.DealsAPI.getSurprise(params);
        const deal = res.deal;

        if (!deal) {
          body.innerHTML = `<p style="padding:1rem 0;color:var(--text-secondary)">No deals found near you right now. Try again later!</p>`;
          return;
        }

        body.innerHTML = `
          <div class="surprise-card animate-scale-in">
            <img src="${deal.thumbnail || ''}" alt="${deal.title}" class="surprise-card__img" loading="lazy" />
            <div class="surprise-card__body">
              <span class="badge badge--discount">${deal.discountPercent}% OFF</span>
              <h3 class="surprise-card__title">${deal.title}</h3>
              <p class="surprise-card__shop">${deal.business?.businessName || ''}</p>
              <p class="surprise-card__distance">
                ${deal.location?.coordinates && this.userLat
                  ? '📍 ' + window.Haversine.dealDistance(deal, this.userLat, this.userLng) + ' away'
                  : ''}
              </p>
              <div style="display:flex;gap:0.75rem;margin-top:1rem">
                <a href="/client/pages/deal.html?id=${deal._id}" class="btn btn--primary btn--full">
                  View Deal 🔥
                </a>
                <button class="btn btn--ghost" onclick="Feed._bindSurpriseMe(); document.getElementById('surprise-btn').click()">
                  🎲 Another
                </button>
              </div>
            </div>
          </div>`;

      } catch (err) {
        body.innerHTML = `<p style="padding:1rem 0;color:var(--accent-red)">Could not fetch a deal. Please try again.</p>`;
      }
    });

    close?.addEventListener('click', () => modal?.classList.remove('modal-overlay--open'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('modal-overlay--open');
    });
  },

  // ─── Infinite Scroll ───────────────────────────────────────────────────────
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

  // ─── Reset Feed ───────────────────────────────────────────────────────────
  reset() {
    this.loadDeals(true);
  },

  // ─── Render Flash Card ─────────────────────────────────────────────────────
  _renderFlashCard(deal) {
    const timeLeft = window.Timer.remaining(deal.expiresAt);
    const urgency  = window.Timer.urgencyLevel(deal.expiresAt);
    const timerId  = `flash-timer-${deal._id}`;

    return `
      <a href="/client/pages/deal.html?id=${deal._id}" class="flash-card card card--flash">
        <div class="flash-card__image-wrap">
          <img
            data-src="${deal.thumbnail || ''}"
            src="/client/assets/placeholder.png"
            alt="${deal.title}"
            class="flash-card__image"
            loading="lazy"
          />
          <span class="badge badge--discount flash-card__badge">${deal.discountPercent}% OFF</span>
        </div>
        <div class="flash-card__body">
          <p class="flash-card__title">${window.Global.truncate(deal.title, 40)}</p>
          <div class="flash-card__footer">
            <span class="badge badge--flash">⚡ FLASH</span>
            <span
              class="timer timer--${urgency}"
              id="${timerId}"
              data-expires="${deal.expiresAt}"
              data-compact="true"
            ></span>
          </div>
        </div>
      </a>`;
  },

  // ─── Render Deal Card ──────────────────────────────────────────────────────
  _renderDealCard(deal) {
    const isFlash    = deal.isFlashDeal;
    const isBoosted  = deal.isBoosted;
    const timerId    = `timer-${deal._id}`;
    const urgency    = window.Timer.urgencyLevel(deal.expiresAt);
    const distance   = this.userLat
      ? window.Haversine.dealDistance(deal, this.userLat, this.userLng)
      : '';
    const isBookmarked = window.NeardisAPI.Auth.getUser()?.bookmarks?.includes(deal._id);

    return `
      <article
        class="card deal-card animate-fade-in ${isFlash ? 'card--flash' : ''} ${isBoosted ? 'card--boosted' : ''}"
        data-deal-id="${deal._id}"
      >
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
            ${isFlash   ? '<span class="badge badge--flash">⚡ FLASH</span>'    : ''}
            ${isBoosted ? '<span class="badge badge--boosted">⭐ Boosted</span>'  : ''}
            ${deal.dealType === 'online' ? '<span class="badge badge--online">🌐 Online</span>' : ''}
          </div>
        </a>

        <div class="deal-card__body">
          <a href="/client/pages/deal.html?id=${deal._id}">
            <h3 class="deal-card__title">${deal.title}</h3>
          </a>

          <div class="deal-card__meta">
            <span class="badge badge--category">${deal.category}</span>
            ${distance ? `<span>📍 ${distance}</span>` : ''}
            ${deal.business?.businessName
              ? `<span class="truncate" style="max-width:120px">🏪 ${deal.business.businessName}</span>`
              : ''}
          </div>

          <div class="deal-card__footer">
            <span
              class="timer timer--${urgency}"
              id="${timerId}"
              data-expires="${deal.expiresAt}"
              data-compact="true"
              data-expired-text="Expired"
            ></span>

            <button
              class="deal-card__bookmark ${isBookmarked ? 'deal-card__bookmark--saved' : ''}"
              data-deal-id="${deal._id}"
              aria-label="Bookmark deal"
              onclick="Feed.toggleBookmark(event, '${deal._id}')"
            >
              ${isBookmarked ? '🔖' : '🔖'}
            </button>
          </div>
        </div>
      </article>`;
  },

  // ─── Toggle Bookmark ──────────────────────────────────────────────────────
  async toggleBookmark(e, dealId) {
    e.preventDefault();
    e.stopPropagation();

    const { Auth, BookmarksAPI, Toast } = window.NeardisAPI;
    if (!Auth.isLoggedIn()) {
      Toast.info('Please log in to bookmark deals.');
      window.location.href = '/client/pages/login.html';
      return;
    }

    const btn = e.currentTarget;
    const isSaved = btn.classList.contains('deal-card__bookmark--saved');

    try {
      if (isSaved) {
        await BookmarksAPI.removeBookmark(dealId);
        btn.classList.remove('deal-card__bookmark--saved');
        Toast.success('Bookmark removed.');
      } else {
        await BookmarksAPI.addBookmark(dealId);
        btn.classList.add('deal-card__bookmark--saved');
        Toast.success('Deal bookmarked! 🔖');
      }
    } catch (err) {
      Toast.error(err.message || 'Could not update bookmark.');
    }
  },

  // ─── Skeleton HTML ────────────────────────────────────────────────────────
  _skeletons(count) {
    return Array(count).fill(`
      <div class="card deal-card">
        <div class="skeleton" style="height:200px"></div>
        <div class="deal-card__body">
          <div class="skeleton" style="height:14px;width:85%;margin-bottom:8px"></div>
          <div class="skeleton" style="height:12px;width:55%;margin-bottom:12px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="skeleton" style="height:22px;width:60px;border-radius:6px"></div>
            <div class="skeleton" style="height:22px;width:22px;border-radius:6px"></div>
          </div>
        </div>
      </div>`).join('');
  }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => Feed.init());
window.Feed = Feed;
