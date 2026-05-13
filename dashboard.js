// ─── Dashboard State ──────────────────────────────────────────────────────────
const Dashboard = {
  business:    null,
  analytics:   null,
  activeTab:   'overview',
  dealStatus:  '',
  dealPage:    1,
  chart:       null,
  imageFiles:  [],

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    const { Auth } = window.NeardisAPI;
    if (!Auth.isLoggedIn()) {
      window.location.href = '/client/pages/login.html?redirect=/client/pages/dashboard.html';
      return;
    }

    this._bindTabs();
    this._bindNewDeal();
    this._bindOccupancy();

    await Promise.all([
      this.loadBusiness(),
      this.loadAnalytics()
    ]);
  },

  // ─── Load Business ─────────────────────────────────────────────────────────
  async loadBusiness() {
    try {
      const res     = await window.NeardisAPI.BusinessAPI.getMyBusiness();
      this.business = res.business;
      this._renderHeader();
      this._populateProfileForm();
      await this.loadPlans();
      await this.loadPayments();
    } catch (err) {
      if (err.status === 404) {
        window.NeardisAPI.Toast.info('Set up your business profile to get started.');
      } else {
        window.NeardisAPI.Toast.error('Failed to load business data.');
      }
    }
  },

  // ─── Load Analytics ────────────────────────────────────────────────────────
  async loadAnalytics() {
    try {
      const res       = await window.NeardisAPI.BusinessAPI.getAnalytics();
      this.analytics  = res.analytics;
      this._renderStats();
      this._renderTopDeals();
      this._renderRecentDeals();
      this._renderRevenueSummary();
    } catch {}
  },

  // ─── Render Header ─────────────────────────────────────────────────────────
  _renderHeader() {
    const b = this.business;
    if (!b) return;

    // Avatar
    const avatarEl = document.getElementById('dash-avatar');
    if (avatarEl) {
      avatarEl.innerHTML = b.logo
        ? `<img src="${b.logo}" alt="${b.businessName}" />`
        : '🏪';
    }

    const nameEl = document.getElementById('dash-business-name');
    if (nameEl) nameEl.textContent = b.businessName;

    const metaEl = document.getElementById('dash-business-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <span>${b.category}</span>
        <span>·</span>
        <span class="${b.isVerified ? 'text-accent' : ''}">${b.isVerified ? '✓ Verified' : 'Unverified'}</span>
        <span>·</span>
        <span>${b.subscription?.plan?.charAt(0).toUpperCase() + b.subscription?.plan?.slice(1) || 'Free'} Plan</span>
      `;
    }
  },

  // ─── Render Stats ──────────────────────────────────────────────────────────
  _renderStats() {
    const a = this.analytics?.overview;
    if (!a) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '—';
    };

    set('stat-views',  this._fmt(a.totalViews));
    set('stat-clicks', this._fmt(a.totalClicks));
    set('stat-rating', this.business?.averageRating
      ? this.business.averageRating.toFixed(1) + ' ⭐' : '—');

    // Active deals from dealStats
    const active = this.analytics?.dealStats?.find(d => d._id === 'active');
    set('stat-deals', active?.count ?? '—');
  },

  // ─── Render Top Deals ──────────────────────────────────────────────────────
  _renderTopDeals() {
    const deals = this.analytics?.topDeals || [];
    const el    = document.getElementById('top-deals-list');
    if (!el) return;

    if (!deals.length) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:0.875rem">No deals yet. Create your first deal!</p>`;
      return;
    }

    el.innerHTML = deals.map(deal => `
      <div class="top-deal-row">
        <img
          src="${deal.thumbnail || ''}"
          alt="${deal.title}"
          class="top-deal-row__img"
          onerror="this.style.display='none'"
        />
        <div class="top-deal-row__info">
          <div class="top-deal-row__title">${deal.title}</div>
          <div class="top-deal-row__meta">
            <span>👁️ ${this._fmt(deal.analytics?.views || 0)}</span>
            <span>🖱️ ${this._fmt(deal.analytics?.clicks || 0)}</span>
            <span class="badge badge--discount" style="font-size:0.6875rem">${deal.discountPercent}% OFF</span>
          </div>
        </div>
        <span class="top-deal-row__stat">${this._fmt(deal.analytics?.views || 0)}</span>
      </div>`).join('');
  },

  // ─── Render Deal List (Deals Tab) ──────────────────────────────────────────
  async loadDeals(reset = true) {
    if (reset) this.dealPage = 1;

    const el = document.getElementById('dash-deals-list');
    if (reset) {
      el.innerHTML = `<div class="flex items-center gap-3" style="padding:1rem 0">
        <div class="spinner"></div><span>Loading…</span></div>`;
    }

    try {
      const res   = await window.NeardisAPI.BusinessAPI.getMyDeals({
        page: this.dealPage, limit: 20,
        ...(this.dealStatus && { status: this.dealStatus })
      });
      const deals = res.deals || [];

      if (reset) el.innerHTML = '';

      if (!deals.length && reset) {
        el.innerHTML = `<div class="empty-state" style="padding:1.5rem 0">
          <div class="empty-state__icon">🔥</div>
          <p class="empty-state__text">No deals here. Create your first deal!</p>
        </div>`;
        return;
      }

      deals.forEach(deal => {
        const row = document.createElement('div');
        row.innerHTML = this._renderDealRow(deal);
        el.appendChild(row.firstElementChild);
      });

      this._bindDealRowActions();
      window.Timer.initAll();
    } catch (err) {
      console.error('Load deals error:', err);
    }
  },

  // ─── Render Deal Row ───────────────────────────────────────────────────────
  _renderDealRow(deal) {
    const statusColors = {
      active:  'badge--new',
      pending: 'badge--boosted',
      expired: 'badge--expiring',
      rejected:'badge--expiring',
      paused:  'badge--category'
    };

    return `
      <div class="dash-deal-row" data-deal-id="${deal._id}">
        <img
          src="${deal.thumbnail || ''}"
          alt="${deal.title}"
          class="dash-deal-row__img"
          onerror="this.style.display='none'"
        />
        <div class="dash-deal-row__info">
          <div class="dash-deal-row__title">${deal.title}</div>
          <div class="dash-deal-row__meta">
            <span class="badge ${statusColors[deal.status] || 'badge--category'}" style="font-size:0.6875rem">
              ${deal.status.charAt(0).toUpperCase() + deal.status.slice(1)}
            </span>
            <span class="badge badge--discount" style="font-size:0.6875rem">${deal.discountPercent}% OFF</span>
            <span
              class="timer"
              data-expires="${deal.expiresAt}"
              data-compact="true"
              data-expired-text="Expired"
              style="font-size:0.75rem"
            ></span>
          </div>
        </div>
        <div class="dash-deal-row__stats">
          <div class="dash-deal-row__stat">
            <span class="dash-deal-row__stat-val">👁️ ${this._fmt(deal.analytics?.views || 0)}</span>
            <span class="dash-deal-row__stat-label">Views</span>
          </div>
          <div class="dash-deal-row__stat">
            <span class="dash-deal-row__stat-val">🖱️ ${this._fmt(deal.analytics?.clicks || 0)}</span>
            <span class="dash-deal-row__stat-label">Clicks</span>
          </div>
        </div>
        <div class="dash-deal-row__actions">
          <a href="/client/pages/deal.html?id=${deal._id}" class="dash-deal-action-btn" title="View">👁️</a>
          <button class="dash-deal-action-btn" data-action="delete" data-id="${deal._id}" title="Delete">🗑️</button>
        </div>
      </div>`;
  },

  // ─── Bind Deal Row Actions ─────────────────────────────────────────────────
  _bindDealRowActions() {
    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this deal? This cannot be undone.')) return;
        try {
          await window.NeardisAPI.DealsAPI.deleteDeal(btn.dataset.id);
          btn.closest('.dash-deal-row')?.remove();
          window.NeardisAPI.Toast.success('Deal deleted.');
        } catch (err) {
          window.NeardisAPI.Toast.error(err.message || 'Failed to delete deal.');
        }
      });
    });
  },

  // ─── Analytics Charts ──────────────────────────────────────────────────────
  _renderHourlyChart() {
    const data = this.analytics?.hourlyViews || Array(24).fill(0);
    const canvas = document.getElementById('hourly-chart');
    if (!canvas || !window.Chart) return;

    if (this.chart) this.chart.destroy();

    const labels = Array.from({ length: 24 }, (_, i) => {
      const h = i % 12 || 12;
      return `${h}${i < 12 ? 'am' : 'pm'}`;
    });

    const theme = document.documentElement.getAttribute('data-theme');
    const gridColor  = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor  = theme === 'dark' ? '#8b9ab5' : '#4a5568';

    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Views',
          data,
          backgroundColor: 'rgba(255,45,85,0.7)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } }, beginAtZero: true }
        }
      }
    });
  },

  // ─── Recent Deals ──────────────────────────────────────────────────────────
  _renderRecentDeals() {
    const deals = this.analytics?.recentDeals || [];
    const el    = document.getElementById('recent-deals-list');
    if (!el) return;

    if (!deals.length) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:0.875rem">No recent activity.</p>`;
      return;
    }

    el.innerHTML = deals.slice(0, 5).map(deal => `
      <div class="top-deal-row">
        <div class="top-deal-row__info">
          <div class="top-deal-row__title">${deal.title}</div>
          <div class="top-deal-row__meta">
            <span>${new Date(deal.createdAt).toLocaleDateString('en-PK', { day:'numeric',month:'short' })}</span>
            <span class="badge badge--discount" style="font-size:0.6875rem">${deal.discountPercent}% OFF</span>
          </div>
        </div>
        <span class="top-deal-row__stat" style="font-size:0.8125rem">👁️ ${deal.analytics?.views || 0}</span>
      </div>`).join('');
  },

  // ─── Revenue Summary ───────────────────────────────────────────────────────
  _renderRevenueSummary() {
    const el = document.getElementById('revenue-summary');
    if (!el) return;

    const plan = this.business?.subscription;
    if (!plan) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:0.875rem">No billing data available.</p>`;
      return;
    }

    el.innerHTML = `
      <div class="revenue-row">
        <span class="revenue-row__label">Current Plan</span>
        <span class="revenue-row__value" style="color:var(--text-primary)">
          ${plan.plan?.charAt(0).toUpperCase() + plan.plan?.slice(1) || 'Free'}
        </span>
      </div>
      <div class="revenue-row">
        <span class="revenue-row__label">Status</span>
        <span class="revenue-row__value">${plan.status || '—'}</span>
      </div>
      <div class="revenue-row">
        <span class="revenue-row__label">Renews</span>
        <span class="revenue-row__value" style="color:var(--text-secondary)">
          ${plan.currentPeriodEnd
            ? new Date(plan.currentPeriodEnd).toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })
            : '—'}
        </span>
      </div>
      <div class="revenue-row">
        <span class="revenue-row__label">Boost Slots</span>
        <span class="revenue-row__value" style="color:var(--text-secondary)">
          ${plan.boostedSlotsUsed || 0} / ${plan.boostedSlotsLimit || 0}
        </span>
      </div>`;
  },

  // ─── Populate Profile Form ─────────────────────────────────────────────────
  _populateProfileForm() {
    const b = this.business;
    if (!b) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };

    const logoEl = document.getElementById('logo-preview');
    if (logoEl) logoEl.src = b.logo || '';

    set('pf-name',        b.businessName);
    set('pf-category',    b.category);
    set('pf-description', b.description);
    set('pf-phone',       b.phone);
    set('pf-website',     b.website);
    set('pf-city',        b.address?.city);
    set('pf-street',      b.address?.street);
    set('pf-instagram',   b.socialLinks?.instagram);
    set('pf-whatsapp',    b.socialLinks?.whatsapp);

    document.getElementById('save-profile-btn')?.addEventListener('click', () => this.saveProfile());
    document.getElementById('verify-btn')?.addEventListener('click',       () => this.requestVerification());

    document.getElementById('logo-upload')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('logo-preview');
        if (preview) preview.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // ─── Save Profile ──────────────────────────────────────────────────────────
  async saveProfile() {
    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const fd = new FormData();
      fd.append('businessName', document.getElementById('pf-name')?.value || '');
      fd.append('category',     document.getElementById('pf-category')?.value || '');
      fd.append('description',  document.getElementById('pf-description')?.value || '');
      fd.append('phone',        document.getElementById('pf-phone')?.value || '');
      fd.append('website',      document.getElementById('pf-website')?.value || '');
      fd.append('address',      JSON.stringify({
        city:   document.getElementById('pf-city')?.value || '',
        street: document.getElementById('pf-street')?.value || ''
      }));
      fd.append('socialLinks', JSON.stringify({
        instagram: document.getElementById('pf-instagram')?.value || '',
        whatsapp:  document.getElementById('pf-whatsapp')?.value  || ''
      }));

      const logoFile = document.getElementById('logo-upload')?.files[0];
      if (logoFile) fd.append('logo', logoFile);

      await window.NeardisAPI.BusinessAPI.updateMyBusiness(fd);
      window.NeardisAPI.Toast.success('Profile saved! ✅');
    } catch (err) {
      window.NeardisAPI.Toast.error(err.message || 'Failed to save profile.');
    } finally {
      btn.disabled    = false;
      btn.textContent = '💾 Save Changes';
    }
  },

  // ─── Request Verification ──────────────────────────────────────────────────
  async requestVerification() {
    window.NeardisAPI.Toast.info('Verification request submitted. Our team will review within 24h.');
  },

  // ─── Load Plans ───────────────────────────────────────────────────────────
  async loadPlans() {
    try {
      const res   = await window.NeardisAPI.PaymentsAPI.getPlans();
      const plans = res.plans || [];
      const grid  = document.getElementById('plan-cards-grid');
      if (!grid) return;

      const currentPlan = this.business?.subscription?.plan || 'free';

      const currentEl = document.getElementById('current-plan-card');
      if (currentEl) {
        currentEl.className = 'current-plan-card';
        currentEl.innerHTML = `
          <div>
            <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:4px">Current Plan</p>
            <p style="font-family:'Syne',sans-serif;font-size:1.25rem;font-weight:800">
              ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
            </p>
          </div>
          ${currentPlan !== 'free'
            ? `<button class="btn btn--danger btn--sm" onclick="Dashboard.cancelSubscription()">Cancel Plan</button>`
            : '<span class="text-muted text-sm">Upgrade for more features</span>'
          }`;
      }

      grid.innerHTML = plans.map(plan => `
        <div class="plan-card ${plan.id === 'pro' ? 'plan-card--popular' : ''}">
          ${plan.id === 'pro' ? '<span class="badge badge--flash" style="align-self:flex-start">⭐ Popular</span>' : ''}
          <div>
            <div class="plan-card__name">${plan.name}</div>
            <div class="plan-card__price">$${plan.monthlyPrice}<span class="plan-card__price-sub">/mo</span></div>
          </div>
          <div class="plan-card__features">
            <div class="plan-card__feature">✅ ${plan.boostedSlotsLimit} Boosted Slots</div>
            <div class="plan-card__feature">✅ Analytics Dashboard</div>
            <div class="plan-card__feature">✅ Priority Support</div>
          </div>
          <button
            class="btn ${currentPlan === plan.id ? 'btn--ghost' : 'btn--primary'} btn--sm btn--full"
            onclick="Dashboard.subscribe('${plan.id}')"
            ${currentPlan === plan.id ? 'disabled' : ''}
          >
            ${currentPlan === plan.id ? '✓ Current Plan' : 'Upgrade'}
          </button>
        </div>`).join('');
    } catch {}
  },

  // ─── Subscribe ─────────────────────────────────────────────────────────────
  async subscribe(plan) {
    try {
      const res = await window.NeardisAPI.PaymentsAPI.createSubscription({ plan, duration: 'monthly' });
      if (res.checkoutUrl) window.location.href = res.checkoutUrl;
    } catch (err) {
      window.NeardisAPI.Toast.error(err.message || 'Failed to start checkout.');
    }
  },

  // ─── Cancel Subscription ──────────────────────────────────────────────────
  async cancelSubscription() {
    if (!confirm('Cancel your subscription? It will remain active until the end of the billing period.')) return;
    try {
      await window.NeardisAPI.PaymentsAPI.cancelSubscription();
      window.NeardisAPI.Toast.success('Subscription cancelled.');
    } catch (err) {
      window.NeardisAPI.Toast.error(err.message || 'Failed to cancel.');
    }
  },

  // ─── Load Payments ────────────────────────────────────────────────────────
  async loadPayments() {
    try {
      const res      = await window.NeardisAPI.PaymentsAPI.getMyPayments({ limit: 10 });
      const payments = res.payments || [];
      const el       = document.getElementById('payment-history-list');
      if (!el) return;

      if (!payments.length) {
        el.innerHTML = `<p style="color:var(--text-muted);font-size:0.875rem;padding:0.5rem 0">No payments yet.</p>`;
        return;
      }

      el.innerHTML = payments.map(p => `
        <div class="payment-row">
          <div style="flex:1">
            <p style="font-size:0.875rem;font-weight:600">${p.description || p.plan}</p>
            <p style="font-size:0.75rem;color:var(--text-muted)">
              ${new Date(p.createdAt).toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })}
              · ${p.gateway}
            </p>
          </div>
          <span class="payment-row__status payment-row__status--${p.status}">${p.status}</span>
          <span style="font-weight:700;font-size:0.875rem">$${(p.amount / 100).toFixed(2)}</span>
        </div>`).join('');
    } catch {}
  },

  // ─── Bind Tabs ─────────────────────────────────────────────────────────────
  _bindTabs() {
    document.getElementById('dash-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.dash-tab');
      if (!tab) return;
      this.switchTab(tab.dataset.tab);
    });
  },

  switchTab(tabName) {
    document.querySelectorAll('.dash-tab').forEach(t => {
      t.classList.toggle('dash-tab--active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.dash-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');

    this.activeTab = tabName;

    if (tabName === 'deals') this.loadDeals(true);
    if (tabName === 'analytics') {
      setTimeout(() => this._renderHourlyChart(), 50);
    }
  },

  // ─── Bind Occupancy ───────────────────────────────────────────────────────
  _bindOccupancy() {
    const toggle    = document.getElementById('occupancy-toggle');
    const levelBtns = document.querySelectorAll('.occ-btn');

    toggle?.addEventListener('change', async (e) => {
      try {
        await window.NeardisAPI.BusinessAPI.updateOccupancy({ enabled: e.target.checked });
        window.NeardisAPI.Toast.success(`Live status ${e.target.checked ? 'enabled' : 'disabled'}.`);
      } catch {}
    });

    levelBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        levelBtns.forEach(b => b.className = 'occ-btn');
        btn.classList.add(`occ-btn--active-${btn.dataset.level}`);
        try {
          await window.NeardisAPI.BusinessAPI.updateOccupancy({ currentLevel: btn.dataset.level });
          window.NeardisAPI.Toast.success(`Occupancy set to ${btn.dataset.level}.`);
        } catch {}
      });
    });
  },

  // ─── Bind New Deal Modal ──────────────────────────────────────────────────
  _bindNewDeal() {
    const openModal = () => {
      document.getElementById('new-deal-modal')?.classList.add('modal-overlay--open');
      // Set min expiry date
      const expiresInput = document.getElementById('nd-expires');
      if (expiresInput) {
        const min = new Date(Date.now() + 60 * 60 * 1000);
        expiresInput.min = min.toISOString().slice(0, 16);
      }
    };

    document.getElementById('new-deal-btn')?.addEventListener('click',   openModal);
    document.getElementById('new-deal-btn-2')?.addEventListener('click', openModal);
    document.getElementById('new-deal-modal-close')?.addEventListener('click', () => {
      document.getElementById('new-deal-modal')?.classList.remove('modal-overlay--open');
    });

    // Deal type change — show/hide coupon/link fields
    document.getElementById('nd-deal-type')?.addEventListener('change', (e) => {
      const isOnline = e.target.value !== 'local';
      document.getElementById('coupon-field')?.classList.toggle('hidden', !isOnline);
      document.getElementById('link-field')?.classList.toggle('hidden', !isOnline);
    });

    // Limited stock toggle
    document.getElementById('nd-limited')?.addEventListener('change', (e) => {
      document.getElementById('stock-count-field')?.classList.toggle('hidden', !e.target.checked);
    });

    // Image previews
    document.getElementById('nd-images')?.addEventListener('change', (e) => {
      const files   = Array.from(e.target.files).slice(0, 5);
      this.imageFiles = files;
      const preview = document.getElementById('image-previews');
      if (!preview) return;
      preview.innerHTML = files.map((file, i) => {
        const url = URL.createObjectURL(file);
        return `<div class="image-preview-item">
          <img src="${url}" alt="Preview ${i+1}" />
          <button class="image-preview-item__remove" data-index="${i}" type="button">✕</button>
        </div>`;
      }).join('');

      preview.querySelectorAll('.image-preview-item__remove').forEach(btn => {
        btn.addEventListener('click', () => {
          this.imageFiles.splice(parseInt(btn.dataset.index), 1);
          btn.closest('.image-preview-item').remove();
        });
      });
    });

    // Submit deal
    document.getElementById('submit-deal-btn')?.addEventListener('click', () => this.submitDeal());
  },

  // ─── Submit Deal ──────────────────────────────────────────────────────────
  async submitDeal() {
    const btn = document.getElementById('submit-deal-btn');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    try {
      const fd = new FormData();
      fd.append('title',            document.getElementById('nd-title')?.value || '');
      fd.append('category',         document.getElementById('nd-category')?.value || '');
      fd.append('discountPercent',  document.getElementById('nd-discount')?.value || '');
      fd.append('description',      document.getElementById('nd-description')?.value || '');
      fd.append('dealType',         document.getElementById('nd-deal-type')?.value || 'local');
      fd.append('expiresAt',        document.getElementById('nd-expires')?.value || '');
      fd.append('isFlashDeal',      document.getElementById('nd-flash')?.checked || false);
      fd.append('isLimitedStock',   document.getElementById('nd-limited')?.checked || false);

      const originalPrice   = document.getElementById('nd-original-price')?.value;
      const discountedPrice = document.getElementById('nd-discounted-price')?.value;
      const coupon          = document.getElementById('nd-coupon')?.value;
      const link            = document.getElementById('nd-link')?.value;
      const stock           = document.getElementById('nd-stock')?.value;

      if (originalPrice)   fd.append('originalPrice',   originalPrice);
      if (discountedPrice) fd.append('discountedPrice', discountedPrice);
      if (coupon)          fd.append('couponCode',      coupon.toUpperCase());
      if (link)            fd.append('externalLink',    link);
      if (stock)           fd.append('stockCount',      stock);

      this.imageFiles.forEach(file => fd.append('images', file));

      await window.NeardisAPI.DealsAPI.createDeal(fd);
      window.NeardisAPI.Toast.success('Deal submitted for review! ✅');
      document.getElementById('new-deal-modal')?.classList.remove('modal-overlay--open');
      document.getElementById('new-deal-form')?.reset();
      this.imageFiles = [];
      document.getElementById('image-previews').innerHTML = '';

      if (this.activeTab === 'deals') this.loadDeals(true);
    } catch (err) {
      window.NeardisAPI.Toast.error(err.message || 'Failed to submit deal.');
      btn.disabled    = false;
      btn.textContent = 'Submit Deal for Review';
    }
  },

  // ─── Helpers ──────────────────────────────────────────────────────────────
  _fmt(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => Dashboard.init());
window.Dashboard = Dashboard;
