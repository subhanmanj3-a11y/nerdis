// ─── Admin Page State ─────────────────────────────────────────────────────────
const AdminPage = {
  activeTab:    'overview',
  pages:        { deals: 1, users: 1, businesses: 1, payments: 1 },
  filters:      { deals: '', users: '', businesses: '', payments: '' },
  searches:     { deals: '', users: '' },
  confirmCb:    null,

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    const { Auth } = window.NeardisAPI;

    if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
      window.location.href = '/client/index.html';
      return;
    }

    this._bindTabs();
    this._bindConfirmModal();
    this._bindSearches();
    document.getElementById('refresh-btn')?.addEventListener('click', () => this._refreshActiveTab());

    await this.loadOverview();
  },

  // ─── Load Overview ─────────────────────────────────────────────────────────
  async loadOverview() {
    try {
      const res   = await window.NeardisAPI.AdminAPI.getDashboard();
      const stats = res.stats;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };

      set('s-users',        this._fmt(stats.totalUsers));
      set('s-users-new',    `+${stats.newUsersThisMonth} this month`);
      set('s-businesses',   this._fmt(stats.totalBusinesses));
      set('s-pending-verify', `${stats.pendingVerifications} pending`);
      set('s-deals',        this._fmt(stats.totalDeals));
      set('s-active-deals', `${stats.activeDeals} active`);
      set('s-pending',      stats.pendingDeals);
      set('s-flagged',      stats.flaggedReviews);
      set('s-revenue',      `$${(stats.totalRevenue / 100).toFixed(0)}`);

      this._renderCategoryBreakdown(stats.categoryBreakdown || []);
    } catch (err) {
      console.error('Overview load error:', err);
      window.NeardisAPI.Toast.error('Failed to load dashboard stats.');
    }
  },

  // ─── Category Breakdown ────────────────────────────────────────────────────
  _renderCategoryBreakdown(data) {
    const el  = document.getElementById('category-breakdown');
    if (!el || !data.length) return;

    const max = Math.max(...data.map(d => d.count), 1);

    el.innerHTML = data.map(item => `
      <div class="cat-bar-row">
        <span class="cat-bar-row__label">${item._id}</span>
        <div class="cat-bar-wrap">
          <div class="cat-bar-fill" style="width:${Math.round((item.count / max) * 100)}%"></div>
        </div>
        <span class="cat-bar-row__count">${item.count}</span>
      </div>`).join('');
  },

  // ─── Load Deals ────────────────────────────────────────────────────────────
  async loadDeals() {
    const tbody = document.getElementById('deals-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="admin-table__loading"><div class="spinner"></div> Loading…</td></tr>`;

    try {
      const res   = await window.NeardisAPI.AdminAPI.getAllDeals({
        page:   this.pages.deals,
        limit:  20,
        status: this.filters.deals,
        search: this.searches.deals
      });
      const deals = res.deals || [];

      if (!deals.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">No deals found.</td></tr>`;
        return;
      }

      tbody.innerHTML = deals.map(deal => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <img src="${deal.thumbnail || ''}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;background:var(--bg-elevated)" onerror="this.style.display='none'" />
              <span style="font-weight:600;font-size:0.8125rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${deal.title}</span>
            </div>
          </td>
          <td><span style="font-size:0.8125rem">${deal.business?.businessName || '—'}</span></td>
          <td><span class="badge badge--category" style="font-size:0.6875rem">${deal.category}</span></td>
          <td><span class="badge badge--discount" style="font-size:0.75rem">${deal.discountPercent}%</span></td>
          <td><span class="admin-status admin-status--${deal.status}">${deal.status}</span></td>
          <td style="font-size:0.8125rem;color:var(--text-muted)">${new Date(deal.expiresAt).toLocaleDateString('en-PK', {day:'numeric',month:'short'})}</td>
          <td>
            <div class="admin-actions">
              ${deal.status === 'pending' ? `
                <button class="admin-action-btn admin-action-btn--approve" data-action="approve-deal" data-id="${deal._id}">✅ Approve</button>
                <button class="admin-action-btn admin-action-btn--reject"  data-action="reject-deal"  data-id="${deal._id}">❌ Reject</button>
              ` : ''}
              <a href="/client/pages/deal.html?id=${deal._id}" class="admin-action-btn admin-action-btn--view" target="_blank">👁️</a>
              <button class="admin-action-btn admin-action-btn--delete" data-action="delete-deal" data-id="${deal._id}">🗑️</button>
            </div>
          </td>
        </tr>`).join('');

      this._renderPagination('deals-pagination', res.pages || 1, this.pages.deals, (p) => {
        this.pages.deals = p;
        this.loadDeals();
      });

      this._bindTableActions();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--accent-red)">Failed to load deals.</td></tr>`;
    }
  },

  // ─── Load Users ────────────────────────────────────────────────────────────
  async loadUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="admin-table__loading"><div class="spinner"></div> Loading…</td></tr>`;

    try {
      const res   = await window.NeardisAPI.AdminAPI.getAllUsers({
        page:   this.pages.users,
        limit:  20,
        role:   this.filters.users,
        search: this.searches.users
      });
      const users = res.users || [];

      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No users found.</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map(user => `
        <tr>
          <td>
            <div class="admin-cell-user">
              <div class="admin-cell-avatar">
                ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}" />` : user.name[0].toUpperCase()}
              </div>
              <div>
                <div class="admin-cell-name">${user.name}</div>
                <div class="admin-cell-email">${user.email}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge--category" style="font-size:0.6875rem">${user.role}</span></td>
          <td style="font-size:0.8125rem;color:var(--text-muted)">${new Date(user.createdAt).toLocaleDateString('en-PK', {day:'numeric',month:'short',year:'numeric'})}</td>
          <td>
            <span class="admin-status ${user.isBanned ? 'admin-status--banned' : 'admin-status--active'}">
              ${user.isBanned ? '🚫 Banned' : '✅ Active'}
            </span>
          </td>
          <td>
            <div class="admin-actions">
              ${user.isBanned
                ? `<button class="admin-action-btn admin-action-btn--unban"  data-action="unban-user" data-id="${user._id}">✅ Unban</button>`
                : `<button class="admin-action-btn admin-action-btn--ban"    data-action="ban-user"   data-id="${user._id}">🚫 Ban</button>`
              }
            </div>
          </td>
        </tr>`).join('');

      this._renderPagination('users-pagination', res.pages || 1, this.pages.users, (p) => {
        this.pages.users = p;
        this.loadUsers();
      });

      this._bindTableActions();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--accent-red)">Failed to load users.</td></tr>`;
    }
  },

  // ─── Load Businesses ───────────────────────────────────────────────────────
  async loadBusinesses() {
    const tbody = document.getElementById('businesses-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="admin-table__loading"><div class="spinner"></div> Loading…</td></tr>`;

    try {
      const res   = await window.NeardisAPI.AdminAPI.getAllBusinesses({
        page:   this.pages.businesses,
        limit:  20,
        status: this.filters.businesses
      });
      const bizs  = res.businesses || [];

      if (!bizs.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">No businesses found.</td></tr>`;
        return;
      }

      tbody.innerHTML = bizs.map(b => `
        <tr>
          <td>
            <div class="admin-cell-user">
              <div class="admin-cell-avatar">${b.logo ? `<img src="${b.logo}" alt="${b.businessName}" />` : '🏪'}</div>
              <div>
                <div class="admin-cell-name">${b.businessName}</div>
                <div class="admin-cell-email">${b.address?.city || ''}</div>
              </div>
            </div>
          </td>
          <td style="font-size:0.8125rem">${b.owner?.name || '—'}<br/><span style="color:var(--text-muted);font-size:0.75rem">${b.owner?.email || ''}</span></td>
          <td><span class="badge badge--category" style="font-size:0.6875rem">${b.category}</span></td>
          <td style="font-size:0.8125rem;font-weight:600">${b.subscription?.plan || 'free'}</td>
          <td>
            <span class="admin-status ${b.isVerified ? 'admin-status--verified' : b.isBanned ? 'admin-status--banned' : 'admin-status--pending'}">
              ${b.isVerified ? '✓ Verified' : b.isBanned ? '🚫 Banned' : '⏳ Pending'}
            </span>
          </td>
          <td>
            <div class="admin-actions">
              ${!b.isVerified && !b.isBanned ? `
                <button class="admin-action-btn admin-action-btn--approve" data-action="verify-biz"  data-id="${b._id}">✅ Verify</button>
                <button class="admin-action-btn admin-action-btn--reject"  data-action="reject-biz"  data-id="${b._id}">❌ Reject</button>
              ` : ''}
              ${!b.isBanned ? `<button class="admin-action-btn admin-action-btn--ban" data-action="ban-biz" data-id="${b._id}">🚫 Ban</button>` : ''}
            </div>
          </td>
        </tr>`).join('');

      this._renderPagination('businesses-pagination', res.pages || 1, this.pages.businesses, (p) => {
        this.pages.businesses = p;
        this.loadBusinesses();
      });

      this._bindTableActions();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--accent-red)">Failed to load businesses.</td></tr>`;
    }
  },

  // ─── Load Flagged Reviews ──────────────────────────────────────────────────
  async loadReviews() {
    const el = document.getElementById('flagged-reviews-list');
    el.innerHTML = `<div class="flex items-center gap-3" style="padding:1rem 0"><div class="spinner"></div><span>Loading…</span></div>`;

    try {
      const res     = await window.NeardisAPI.AdminAPI.getFlaggedReviews({ limit: 20 });
      const reviews = res.reviews || [];

      if (!reviews.length) {
        el.innerHTML = `<div class="empty-state" style="padding:1.5rem 0"><div class="empty-state__icon">🎉</div><p class="empty-state__text">No flagged reviews. All clear!</p></div>`;
        return;
      }

      el.innerHTML = reviews.map(r => `
        <div class="flagged-review-card" data-review-id="${r._id}">
          <div class="flagged-review-card__header">
            <div class="flagged-review-card__user">
              <span>${r.user?.name || 'Unknown'}</span>
              <span class="badge badge--category" style="font-size:0.6875rem">${'⭐'.repeat(r.rating)}</span>
            </div>
            <div class="flagged-review-card__meta">
              <span>🏪 ${r.business?.businessName || '—'}</span>
              <span>🗓️ ${new Date(r.createdAt).toLocaleDateString('en-PK', {day:'numeric',month:'short'})}</span>
            </div>
          </div>
          ${r.comment ? `<div class="flagged-review-card__comment">${r.comment}</div>` : ''}
          <div class="flagged-review-card__reason">🚩 Flagged: ${r.flagReason || 'No reason'}</div>
          <div class="flagged-review-card__actions">
            <button class="admin-action-btn admin-action-btn--approve" data-action="approve-review" data-id="${r._id}">✅ Keep Review</button>
            <button class="admin-action-btn admin-action-btn--delete"  data-action="delete-review"  data-id="${r._id}">🗑️ Delete Review</button>
          </div>
        </div>`).join('');

      this._bindTableActions();
    } catch (err) {
      el.innerHTML = `<p style="color:var(--accent-red);padding:1rem 0">Failed to load flagged reviews.</p>`;
    }
  },

  // ─── Load Payments ─────────────────────────────────────────────────────────
  async loadPayments() {
    const tbody = document.getElementById('payments-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="admin-table__loading"><div class="spinner"></div> Loading…</td></tr>`;

    try {
      const res      = await window.NeardisAPI.AdminAPI.getAllPayments({
        page:   this.pages.payments,
        limit:  20,
        status: this.filters.payments
      });
      const payments = res.payments || [];

      if (!payments.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">No payments found.</td></tr>`;
        return;
      }

      tbody.innerHTML = payments.map(p => `
        <tr>
          <td style="font-size:0.8125rem;font-weight:600">${p.business?.businessName || '—'}</td>
          <td><span class="badge badge--category" style="font-size:0.6875rem">${p.type}</span></td>
          <td style="font-size:0.8125rem">${p.plan}</td>
          <td style="font-weight:700;color:var(--accent-green)">$${(p.amount / 100).toFixed(2)}</td>
          <td style="font-size:0.8125rem">${p.gateway}</td>
          <td><span class="admin-status admin-status--${p.status}">${p.status}</span></td>
          <td style="font-size:0.8125rem;color:var(--text-muted)">${new Date(p.createdAt).toLocaleDateString('en-PK', {day:'numeric',month:'short',year:'numeric'})}</td>
        </tr>`).join('');

      this._renderPagination('payments-pagination', res.pages || 1, this.pages.payments, (p) => {
        this.pages.payments = p;
        this.loadPayments();
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--accent-red)">Failed to load payments.</td></tr>`;
    }
  },

  // ─── Bind Table Action Buttons ─────────────────────────────────────────────
  _bindTableActions() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      // Clone to remove old listeners
      const clone = btn.cloneNode(true);
      btn.parentNode?.replaceChild(clone, btn);

      clone.addEventListener('click', () => {
        const { action, id } = clone.dataset;
        this._handleAction(action, id);
      });
    });
  },

  // ─── Handle Action ─────────────────────────────────────────────────────────
  _handleAction(action, id) {
    const actions = {
      'approve-deal':  () => this._confirm('Approve this deal?', false, async (reason) => {
        await window.NeardisAPI.AdminAPI.approveDeal(id);
        window.NeardisAPI.Toast.success('Deal approved ✅');
        this.loadDeals();
      }),
      'reject-deal':   () => this._confirm('Reject this deal?', true, async (reason) => {
        await window.NeardisAPI.AdminAPI.rejectDeal(id, reason);
        window.NeardisAPI.Toast.success('Deal rejected.');
        this.loadDeals();
      }),
      'delete-deal':   () => this._confirm('Permanently delete this deal?', false, async () => {
        await window.NeardisAPI.AdminAPI.deleteDeal(id);
        window.NeardisAPI.Toast.success('Deal deleted.');
        this.loadDeals();
      }),
      'ban-user':      () => this._confirm('Ban this user?', true, async (reason) => {
        await window.NeardisAPI.AdminAPI.banUser(id, reason);
        window.NeardisAPI.Toast.success('User banned.');
        this.loadUsers();
      }),
      'unban-user':    () => this._confirm('Unban this user?', false, async () => {
        await window.NeardisAPI.AdminAPI.unbanUser(id);
        window.NeardisAPI.Toast.success('User unbanned.');
        this.loadUsers();
      }),
      'verify-biz':    () => this._confirm('Verify this business?', false, async () => {
        await window.NeardisAPI.AdminAPI.verifyBusiness(id);
        window.NeardisAPI.Toast.success('Business verified ✅');
        this.loadBusinesses();
      }),
      'reject-biz':    () => this._confirm('Reject this business verification?', true, async (reason) => {
        await window.NeardisAPI.AdminAPI.rejectBusiness(id);
        window.NeardisAPI.Toast.success('Verification rejected.');
        this.loadBusinesses();
      }),
      'ban-biz':       () => this._confirm('Ban this business?', true, async (reason) => {
        await window.NeardisAPI.AdminAPI.banBusiness(id, reason);
        window.NeardisAPI.Toast.success('Business banned.');
        this.loadBusinesses();
      }),
      'approve-review':() => this._confirm('Keep this review (unflag it)?', false, async () => {
        await window.NeardisAPI.AdminAPI.approveReview(id);
        window.NeardisAPI.Toast.success('Review approved.');
        this.loadReviews();
      }),
      'delete-review': () => this._confirm('Delete this review?', false, async () => {
        await window.NeardisAPI.AdminAPI.deleteReview(id);
        window.NeardisAPI.Toast.success('Review deleted.');
        this.loadReviews();
      }),
    };

    if (actions[action]) actions[action]();
  },

  // ─── Confirm Modal ─────────────────────────────────────────────────────────
  _confirm(message, showReason, callback) {
    const modal   = document.getElementById('confirm-modal');
    const msgEl   = document.getElementById('confirm-modal-message');
    const reasonG = document.getElementById('confirm-reason-group');
    const reasonI = document.getElementById('confirm-reason');

    if (msgEl)   msgEl.textContent = message;
    if (reasonG) reasonG.classList.toggle('hidden', !showReason);
    if (reasonI) reasonI.value = '';

    modal?.classList.add('modal-overlay--open');
    this.confirmCb = callback;
  },

  _bindConfirmModal() {
    document.getElementById('confirm-yes-btn')?.addEventListener('click', async () => {
      const reason = document.getElementById('confirm-reason')?.value.trim();
      document.getElementById('confirm-modal')?.classList.remove('modal-overlay--open');
      if (typeof this.confirmCb === 'function') {
        try {
          await this.confirmCb(reason);
        } catch (err) {
          window.NeardisAPI.Toast.error(err.message || 'Action failed.');
        }
        this.confirmCb = null;
      }
    });

    document.getElementById('confirm-no-btn')?.addEventListener('click', () => {
      document.getElementById('confirm-modal')?.classList.remove('modal-overlay--open');
      this.confirmCb = null;
    });

    document.getElementById('confirm-modal-close')?.addEventListener('click', () => {
      document.getElementById('confirm-modal')?.classList.remove('modal-overlay--open');
      this.confirmCb = null;
    });
  },

  // ─── Bind Tabs ─────────────────────────────────────────────────────────────
  _bindTabs() {
    document.getElementById('admin-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.dash-tab');
      if (!tab) return;
      this._switchTab(tab.dataset.tab);
    });

    // Status/role filter tabs
    ['deal-status-filter', 'user-role-filter', 'biz-verify-filter', 'payment-status-filter'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        document.querySelectorAll(`#${id} .tab`).forEach(t => t.classList.remove('tab--active'));
        tab.classList.add('tab--active');

        if (id === 'deal-status-filter')    { this.filters.deals       = tab.dataset.status || ''; this.pages.deals       = 1; this.loadDeals(); }
        if (id === 'user-role-filter')      { this.filters.users       = tab.dataset.role   || ''; this.pages.users       = 1; this.loadUsers(); }
        if (id === 'biz-verify-filter')     { this.filters.businesses  = tab.dataset.status || ''; this.pages.businesses  = 1; this.loadBusinesses(); }
        if (id === 'payment-status-filter') { this.filters.payments    = tab.dataset.status || ''; this.pages.payments    = 1; this.loadPayments(); }
      });
    });
  },

  _switchTab(tabName) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.toggle('dash-tab--active', t.dataset.tab === tabName));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
    this.activeTab = tabName;

    if (tabName === 'deals')      this.loadDeals();
    if (tabName === 'users')      this.loadUsers();
    if (tabName === 'businesses') this.loadBusinesses();
    if (tabName === 'reviews')    this.loadReviews();
    if (tabName === 'payments')   this.loadPayments();
  },

  _refreshActiveTab() {
    const loaders = { overview: () => this.loadOverview(), deals: () => this.loadDeals(), users: () => this.loadUsers(), businesses: () => this.loadBusinesses(), reviews: () => this.loadReviews(), payments: () => this.loadPayments() };
    loaders[this.activeTab]?.();
  },

  // ─── Search Debounce ───────────────────────────────────────────────────────
  _bindSearches() {
    const debouncedDeal = this._debounce((v) => { this.searches.deals = v; this.pages.deals = 1; this.loadDeals(); }, 400);
    const debouncedUser = this._debounce((v) => { this.searches.users = v; this.pages.users = 1; this.loadUsers(); }, 400);
    document.getElementById('deal-search')?.addEventListener('input', e => debouncedDeal(e.target.value));
    document.getElementById('user-search')?.addEventListener('input', e => debouncedUser(e.target.value));
  },

  // ─── Pagination ────────────────────────────────────────────────────────────
  _renderPagination(elId, totalPages, currentPage, onPageChange) {
    const el = document.getElementById(elId);
    if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }

    const pages = [];
    for (let i = 1; i <= Math.min(totalPages, 7); i++) pages.push(i);

    el.innerHTML = `
      <button class="admin-page-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="(${onPageChange.toString()})(${currentPage - 1})">‹</button>
      ${pages.map(p => `
        <button class="admin-page-btn ${p === currentPage ? 'admin-page-btn--active' : ''}"
          onclick="(${onPageChange.toString()})(${p})">${p}</button>`).join('')}
      <button class="admin-page-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="(${onPageChange.toString()})(${currentPage + 1})">›</button>
    `;
  },

  // ─── Helpers ──────────────────────────────────────────────────────────────
  _fmt(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n ?? 0);
  },

  _debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }
};

document.addEventListener('DOMContentLoaded', () => AdminPage.init());
window.AdminPage = AdminPage;
