// ─── Wait for DOM ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Global.init();
});

const Global = {

  // ─── Init ───────────────────────────────────────────────────────────────────
  init() {
    this.applyTheme();
    this.renderHeader();
    this.renderSidebar();
    this.renderBottomNav();
    this.bindSearch();
    this.highlightActiveNav();
    this.checkAuthRedirects();
  },

  // ─── Theme ──────────────────────────────────────────────────────────────────
  applyTheme() {
    const user  = window.NeardisAPI?.Auth.getUser();
    const saved = localStorage.getItem('neardis_theme') || user?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('neardis_theme', next);

    // Persist to server if logged in
    const user = window.NeardisAPI?.Auth.getUser();
    if (user) {
      window.NeardisAPI.AuthAPI.updateMe((() => {
        const fd = new FormData();
        fd.append('theme', next);
        return fd;
      })()).catch(() => {});
    }

    // Update toggle button icon
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  },

  // ─── Header ─────────────────────────────────────────────────────────────────
  renderHeader() {
    const slot = document.getElementById('header-slot');
    if (!slot) return;

    const { Auth } = window.NeardisAPI || {};
    const user     = Auth?.getUser();
    const isLogged = Auth?.isLoggedIn();
    const theme    = localStorage.getItem('neardis_theme') || 'dark';

    slot.innerHTML = `
      <header class="header">
        <div class="header__left">
          <button class="header__menu-btn" id="sidebar-toggle" aria-label="Menu">
            <span></span><span></span><span></span>
          </button>
          <a href="/client/index.html" class="header__logo">
            <span class="header__logo-icon">🔥</span>
            <span class="header__logo-text">Neardis</span>
          </a>
        </div>

        <div class="header__search" id="header-search-wrap">
          <input
            type="text"
            id="global-search"
            class="header__search-input"
            placeholder="Search deals, shops..."
            autocomplete="off"
            aria-label="Search"
          />
          <button class="header__search-btn" aria-label="Search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
          <div class="header__search-dropdown" id="search-dropdown"></div>
        </div>

        <div class="header__right">
          <button class="header__icon-btn" id="theme-toggle" aria-label="Toggle theme" onclick="Global.toggleTheme()">
            ${theme === 'dark' ? '☀️' : '🌙'}
          </button>

          ${isLogged ? `
            <button class="header__icon-btn" id="notif-btn" aria-label="Notifications">
              🔔
              <span class="header__badge" id="notif-badge" style="display:none">0</span>
            </button>
            <div class="header__avatar-wrap">
              <button class="header__avatar" id="avatar-btn" aria-label="Profile">
                ${user?.avatar
                  ? `<img src="${user.avatar}" alt="${user.name}" />`
                  : `<span>${(user?.name || 'U')[0].toUpperCase()}</span>`
                }
              </button>
              <div class="header__dropdown" id="avatar-dropdown">
                <div class="header__dropdown-user">
                  <strong>${user?.name || 'User'}</strong>
                  <small>${user?.email || ''}</small>
                </div>
                <hr/>
                ${Auth.isBusiness() ? `<a href="/client/pages/dashboard.html">📊 Dashboard</a>` : ''}
                ${Auth.isAdmin()    ? `<a href="/client/pages/admin.html">🛡️ Admin Panel</a>` : ''}
                <a href="#bookmarks">🔖 Bookmarks</a>
                <a href="#" onclick="Global.toggleTheme(); return false;">
                  ${theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
                </a>
                <hr/>
                <a href="#" class="header__dropdown-logout" onclick="window.NeardisAPI.Auth.logout(); return false;">
                  🚪 Logout
                </a>
              </div>
            </div>
          ` : `
            <a href="/client/pages/login.html"    class="btn btn--ghost btn--sm">Login</a>
            <a href="/client/pages/signup.html"   class="btn btn--primary btn--sm">Sign Up</a>
          `}
        </div>
      </header>
    `;

    this._bindHeaderEvents();
  },

  _bindHeaderEvents() {
    // Sidebar toggle
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('sidebar--open');
    });

    // Avatar dropdown
    const avatarBtn = document.getElementById('avatar-btn');
    const dropdown  = document.getElementById('avatar-dropdown');
    avatarBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown?.classList.toggle('header__dropdown--open');
    });
    document.addEventListener('click', () => {
      dropdown?.classList.remove('header__dropdown--open');
    });
  },

  // ─── Sidebar ────────────────────────────────────────────────────────────────
  renderSidebar() {
    const slot = document.getElementById('sidebar-slot');
    if (!slot) return;

    const { Auth } = window.NeardisAPI || {};
    const path     = window.location.pathname;

    const navItems = [
      { href: '/client/index.html',             icon: '🏠', label: 'Feed',       match: 'index'     },
      { href: '/client/pages/map.html',          icon: '🗺️', label: 'Map',        match: 'map'       },
      { href: '/client/pages/category.html',     icon: '🏷️', label: 'Categories', match: 'category'  },
      { href: '/client/pages/online.html',       icon: '🌐', label: 'Online',     match: 'online'    },
      { href: '/client/pages/deal.html',         icon: '🔥', label: 'Deals',      match: 'deal'      },
    ];

    const authItems = Auth?.isLoggedIn() ? `
      <div class="sidebar__section-label">Account</div>
      <a href="#bookmarks" class="sidebar__item">
        <span class="sidebar__icon">🔖</span>
        <span class="sidebar__label">Bookmarks</span>
      </a>
      ${Auth.isBusiness() ? `
        <a href="/client/pages/dashboard.html" class="sidebar__item ${path.includes('dashboard') ? 'sidebar__item--active' : ''}">
          <span class="sidebar__icon">📊</span>
          <span class="sidebar__label">Dashboard</span>
        </a>
      ` : ''}
      ${Auth.isAdmin() ? `
        <a href="/client/pages/admin.html" class="sidebar__item ${path.includes('admin') ? 'sidebar__item--active' : ''}">
          <span class="sidebar__icon">🛡️</span>
          <span class="sidebar__label">Admin</span>
        </a>
      ` : ''}
    ` : `
      <div class="sidebar__auth-cta">
        <a href="/client/pages/login.html"  class="btn btn--primary btn--full">Login</a>
        <a href="/client/pages/signup.html" class="btn btn--ghost   btn--full">Sign Up</a>
      </div>
    `;

    slot.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar__header">
          <a href="/client/index.html" class="sidebar__logo">
            <span>🔥</span> Neardis
          </a>
          <button class="sidebar__close" id="sidebar-close" aria-label="Close">✕</button>
        </div>

        <nav class="sidebar__nav">
          <div class="sidebar__section-label">Discover</div>
          ${navItems.map(item => `
            <a href="${item.href}" class="sidebar__item ${path.includes(item.match) ? 'sidebar__item--active' : ''}">
              <span class="sidebar__icon">${item.icon}</span>
              <span class="sidebar__label">${item.label}</span>
            </a>
          `).join('')}

          ${authItems}
        </nav>

        <div class="sidebar__footer">
          <small>© 2024 Neardis</small>
        </div>
      </aside>
      <div class="sidebar__overlay" id="sidebar-overlay"></div>
    `;

    // Close sidebar
    document.getElementById('sidebar-close')?.addEventListener('click',   () => this.closeSidebar());
    document.getElementById('sidebar-overlay')?.addEventListener('click', () => this.closeSidebar());
  },

  closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('sidebar--open');
  },

  // ─── Bottom Nav (Mobile) ────────────────────────────────────────────────────
  renderBottomNav() {
    const slot = document.getElementById('bottom-nav-slot');
    if (!slot) return;

    const path  = window.location.pathname;
    const items = [
      { href: '/client/index.html',           icon: '🏠', label: 'Feed',     match: 'index'    },
      { href: '/client/pages/map.html',        icon: '🗺️', label: 'Map',      match: 'map'      },
      { href: '/client/pages/category.html',   icon: '🏷️', label: 'Category', match: 'category' },
      { href: '/client/pages/online.html',     icon: '🌐', label: 'Online',   match: 'online'   },
      { href: '/client/pages/dashboard.html',  icon: '👤', label: 'Profile',  match: 'dashboard'},
    ];

    slot.innerHTML = `
      <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
        ${items.map(item => `
          <a href="${item.href}" class="bottom-nav__item ${path.includes(item.match) ? 'bottom-nav__item--active' : ''}">
            <span class="bottom-nav__icon">${item.icon}</span>
            <span class="bottom-nav__label">${item.label}</span>
          </a>
        `).join('')}
      </nav>
    `;
  },

  // ─── Highlight Active Nav ────────────────────────────────────────────────────
  highlightActiveNav() {
    const path = window.location.pathname;
    document.querySelectorAll('[data-nav-href]').forEach(el => {
      if (path.includes(el.dataset.navHref)) {
        el.classList.add('active');
      }
    });
  },

  // ─── Search Binding ──────────────────────────────────────────────────────────
  bindSearch() {
    const input    = document.getElementById('global-search');
    const dropdown = document.getElementById('search-dropdown');
    if (!input || !dropdown) return;

    let debounceTimer;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();

      if (q.length < 2) {
        dropdown.innerHTML = '';
        dropdown.classList.remove('header__search-dropdown--open');
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const res = await window.NeardisAPI.DealsAPI.getDeals({ search: q, limit: 6 });
          this._renderSearchDropdown(res.deals || [], q, dropdown);
        } catch {
          dropdown.innerHTML = '';
        }
      }, 350);
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('header__search-dropdown--open');
      }
    });

    // Navigate on Enter
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) window.location.href = `/client/index.html?search=${encodeURIComponent(q)}`;
      }
    });
  },

  _renderSearchDropdown(deals, query, dropdown) {
    if (!deals.length) {
      dropdown.innerHTML = `<div class="search-dropdown__empty">No results for "${query}"</div>`;
      dropdown.classList.add('header__search-dropdown--open');
      return;
    }

    dropdown.innerHTML = deals.map(deal => `
      <a href="/client/pages/deal.html?id=${deal._id}" class="search-dropdown__item">
        <img
          src="${deal.thumbnail || '/client/assets/placeholder.png'}"
          alt="${deal.title}"
          class="search-dropdown__thumb"
          loading="lazy"
        />
        <div class="search-dropdown__info">
          <span class="search-dropdown__title">${deal.title}</span>
          <span class="search-dropdown__meta">${deal.category} · ${deal.discountPercent}% OFF</span>
        </div>
        <span class="search-dropdown__badge">${deal.discountPercent}%</span>
      </a>
    `).join('') + `
      <a href="/client/index.html?search=${encodeURIComponent(query)}" class="search-dropdown__view-all">
        View all results →
      </a>
    `;
    dropdown.classList.add('header__search-dropdown--open');
  },

  // ─── Auth Redirects ──────────────────────────────────────────────────────────
  checkAuthRedirects() {
    const { Auth } = window.NeardisAPI || {};
    const path     = window.location.pathname;

    const protectedPages  = ['dashboard.html', 'admin.html'];
    const guestOnlyPages  = ['login.html', 'signup.html'];
    const adminOnlyPages  = ['admin.html'];

    const isProtected = protectedPages.some(p => path.includes(p));
    const isGuestOnly = guestOnlyPages.some(p => path.includes(p));
    const isAdminOnly = adminOnlyPages.some(p => path.includes(p));

    if (isProtected && !Auth?.isLoggedIn()) {
      window.location.href = `/client/pages/login.html?redirect=${encodeURIComponent(path)}`;
      return;
    }

    if (isAdminOnly && !Auth?.isAdmin()) {
      window.location.href = '/client/index.html';
      return;
    }

    if (isGuestOnly && Auth?.isLoggedIn()) {
      window.location.href = '/client/index.html';
    }
  },

  // ─── Utility: Format Date ────────────────────────────────────────────────────
  formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-PK', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  },

  // ─── Utility: Format Currency ────────────────────────────────────────────────
  formatCurrency(amount, currency = 'PKR') {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency }).format(amount);
  },

  // ─── Utility: Truncate Text ──────────────────────────────────────────────────
  truncate(text, maxLen = 80) {
    return text?.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  },

  // ─── Utility: Debounce ───────────────────────────────────────────────────────
  debounce(fn, delay = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  },

  // ─── Utility: Lazy Load Images ───────────────────────────────────────────────
  initLazyLoad() {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              observer.unobserve(img);
            }
          }
        });
      }, { rootMargin: '100px' });

      document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
    } else {
      // Fallback
      document.querySelectorAll('img[data-src]').forEach(img => {
        img.src = img.dataset.src;
      });
    }
  }
};

// ─── Expose globally ─────────────────────────────────────────────────────────
window.Global = Global;
