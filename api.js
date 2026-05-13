// ─── Base Configuration ───────────────────────────────────────────────────────
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:5000/api';

// ─── Token Management ─────────────────────────────────────────────────────────
const Auth = {
  getToken:    ()        => localStorage.getItem('neardis_token'),
  setToken:    (token)   => localStorage.setItem('neardis_token', token),
  removeToken: ()        => localStorage.removeItem('neardis_token'),
  getUser:     ()        => JSON.parse(localStorage.getItem('neardis_user') || 'null'),
  setUser:     (user)    => localStorage.setItem('neardis_user', JSON.stringify(user)),
  removeUser:  ()        => localStorage.removeItem('neardis_user'),
  isLoggedIn:  ()        => !!localStorage.getItem('neardis_token'),
  isAdmin:     ()        => Auth.getUser()?.role === 'admin',
  isBusiness:  ()        => ['business', 'admin'].includes(Auth.getUser()?.role),
  logout: () => {
    localStorage.removeItem('neardis_token');
    localStorage.removeItem('neardis_user');
    window.location.href = '/client/pages/login.html';
  }
};

// ─── Core Fetch Wrapper ───────────────────────────────────────────────────────
const request = async (endpoint, options = {}) => {
  const token = Auth.getToken();

  const headers = {
    ...(options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const config = {
    method:  options.method  || 'GET',
    headers,
    body: options.body instanceof FormData
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined
  };

  try {
    const res  = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await res.json();

    if (res.status === 401) {
      Auth.removeToken();
      Auth.removeUser();
      if (!window.location.pathname.includes('login')) {
        window.location.href = '/client/pages/login.html?expired=1';
      }
      throw { status: 401, message: data.message || 'Session expired.' };
    }

    if (!res.ok) {
      throw { status: res.status, message: data.message || 'Request failed.', errors: data.errors };
    }

    return data;
  } catch (err) {
    if (err.status) throw err;
    throw { status: 0, message: 'Network error. Please check your connection.' };
  }
};

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────
const get    = (url, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`${url}${qs ? '?' + qs : ''}`);
};
const post   = (url, body)        => request(url, { method: 'POST',   body });
const put    = (url, body)        => request(url, { method: 'PUT',    body });
const patch  = (url, body)        => request(url, { method: 'PATCH',  body });
const del    = (url)              => request(url, { method: 'DELETE' });
const upload = (url, formData, method = 'POST') =>
  request(url, { method, body: formData });

// ─── Auth API ─────────────────────────────────────────────────────────────────
const AuthAPI = {
  register:     (data)    => post('/auth/register', data),
  login:        (data)    => post('/auth/login', data),
  logout:       ()        => post('/auth/logout'),
  getMe:        ()        => get('/auth/me'),
  updateMe:     (form)    => upload('/auth/me', form, 'PUT'),
  forgotPassword: (email) => post('/auth/forgot-password', { email }),
  resetPassword:  (token, password) => put(`/auth/reset-password/${token}`, { password }),
  changePassword: (data)  => put('/auth/change-password', data),
  addSavedLocation:    (data)  => post('/auth/saved-locations', data),
  removeSavedLocation: (label) => del(`/auth/saved-locations/${label}`),
  updateFcmToken: (fcmToken)   => put('/auth/fcm-token', { fcmToken })
};

// ─── Deals API ────────────────────────────────────────────────────────────────
const DealsAPI = {
  getDeals:      (params) => get('/deals', params),
  getNearby:     (params) => get('/deals/nearby', params),
  getFlash:      (params) => get('/deals/flash', params),
  getOnline:     (params) => get('/deals/online', params),
  getSurprise:   (params) => get('/deals/surprise', params),
  getForMap:     (params) => get('/deals/map', params),
  getDeal:       (id)     => get(`/deals/${id}`),
  createDeal:    (form)   => upload('/deals', form),
  updateDeal:    (id, form) => upload(`/deals/${id}`, form, 'PUT'),
  deleteDeal:    (id)     => del(`/deals/${id}`),
  reportSighting:(id, note) => post(`/deals/${id}/sighting`, { note }),
  trackClick:    (id)     => post(`/deals/${id}/click`),
  trackShare:    (id)     => post(`/deals/${id}/share`)
};

// ─── Reviews API ──────────────────────────────────────────────────────────────
const ReviewsAPI = {
  getDealReviews: (dealId, params) => get(`/reviews/deal/${dealId}`, params),
  getMyReviews:   (params)         => get('/reviews/my', params),
  createReview:   (dealId, form)   => upload(`/reviews/deal/${dealId}`, form),
  updateReview:   (id, form)       => upload(`/reviews/${id}`, form, 'PUT'),
  deleteReview:   (id)             => del(`/reviews/${id}`),
  toggleHelpful:  (id)             => post(`/reviews/${id}/helpful`),
  flagReview:     (id, reason)     => post(`/reviews/${id}/flag`, { reason }),
  replyToReview:  (id, text)       => post(`/reviews/${id}/reply`, { text })
};

// ─── Bookmarks API ────────────────────────────────────────────────────────────
const BookmarksAPI = {
  getBookmarks:   (params) => get('/bookmarks', params),
  addBookmark:    (dealId) => post(`/bookmarks/${dealId}`),
  removeBookmark: (dealId) => del(`/bookmarks/${dealId}`),
  checkBookmark:  (dealId) => get(`/bookmarks/check/${dealId}`),
  clearBookmarks: ()       => del('/bookmarks')
};

// ─── Businesses API ───────────────────────────────────────────────────────────
const BusinessAPI = {
  getBusinesses:    (params)    => get('/businesses', params),
  getBusiness:      (id)        => get(`/businesses/${id}`),
  getBusinessDeals: (id, params)=> get(`/businesses/${id}/deals`, params),
  getMyBusiness:    ()          => get('/businesses/me/profile'),
  updateMyBusiness: (form)      => upload('/businesses/me/profile', form, 'PUT'),
  updateCover:      (form)      => upload('/businesses/me/cover', form, 'PUT'),
  updateOccupancy:  (data)      => put('/businesses/me/occupancy', data),
  getAnalytics:     ()          => get('/businesses/me/analytics'),
  getMyDeals:       (params)    => get('/businesses/me/deals', params),
  submitVerification: (form)    => upload('/businesses/me/verify', form)
};

// ─── Payments API ─────────────────────────────────────────────────────────────
const PaymentsAPI = {
  getPlans:            ()        => get('/payments/plans'),
  createSubscription:  (data)    => post('/payments/subscribe', data),
  boostDeal:           (data)    => post('/payments/boost', data),
  localPayment:        (data)    => post('/payments/local', data),
  getMyPayments:       (params)  => get('/payments/my', params),
  cancelSubscription:  ()        => post('/payments/cancel-subscription')
};

// ─── Admin API ────────────────────────────────────────────────────────────────
const AdminAPI = {
  getDashboard:     ()         => get('/admin/dashboard'),
  getAllDeals:       (params)   => get('/admin/deals', params),
  approveDeal:      (id)       => put(`/admin/deals/${id}/approve`),
  rejectDeal:       (id, reason) => put(`/admin/deals/${id}/reject`, { reason }),
  deleteDeal:       (id)       => del(`/admin/deals/${id}`),
  getAllUsers:       (params)   => get('/admin/users', params),
  banUser:          (id, reason) => put(`/admin/users/${id}/ban`, { reason }),
  unbanUser:        (id)       => put(`/admin/users/${id}/unban`),
  changeUserRole:   (id, role) => put(`/admin/users/${id}/role`, { role }),
  getAllBusinesses:  (params)   => get('/admin/businesses', params),
  verifyBusiness:   (id)       => put(`/admin/businesses/${id}/verify`),
  rejectBusiness:   (id)       => put(`/admin/businesses/${id}/reject`),
  banBusiness:      (id, reason) => put(`/admin/businesses/${id}/ban`, { reason }),
  getFlaggedReviews:(params)   => get('/admin/reviews/flagged', params),
  approveReview:    (id)       => put(`/admin/reviews/${id}/approve`),
  deleteReview:     (id)       => del(`/admin/reviews/${id}`),
  getAllPayments:    (params)   => get('/admin/payments', params)
};

// ─── Geolocation Helper ───────────────────────────────────────────────────────
const Geo = {
  getCurrentPosition: (options = {}) =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000, ...options }
      );
    }),

  // Cached position
  cachedPosition: null,
  getPosition: async (forceRefresh = false) => {
    if (!forceRefresh && Geo.cachedPosition) return Geo.cachedPosition;
    const pos = await Geo.getCurrentPosition();
    Geo.cachedPosition = pos;
    return pos;
  },

  // Default fallback (Lahore, Pakistan)
  fallback: { lat: 31.5204, lng: 74.3587 }
};

// ─── Toast Notification Helper ────────────────────────────────────────────────
const Toast = {
  show: (message, type = 'info', duration = 3500) => {
    const existing = document.getElementById('neardis-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'neardis-toast';
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span class="toast__icon">${
        type === 'success' ? '✅' :
        type === 'error'   ? '❌' :
        type === 'warning' ? '⚠️' : 'ℹ️'
      }</span>
      <span class="toast__message">${message}</span>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast--visible'));

    setTimeout(() => {
      toast.classList.remove('toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success: (msg) => Toast.show(msg, 'success'),
  error:   (msg) => Toast.show(msg, 'error'),
  warning: (msg) => Toast.show(msg, 'warning'),
  info:    (msg) => Toast.show(msg, 'info')
};

// ─── Clipboard Helper ─────────────────────────────────────────────────────────
const Clipboard = {
  copy: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      Toast.success('Copied to clipboard!');
      return true;
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      Toast.success('Copied!');
      return true;
    }
  }
};

// ─── Share Helper ─────────────────────────────────────────────────────────────
const Share = {
  deal: async (deal) => {
    const url  = `${window.location.origin}/client/pages/deal.html?id=${deal._id}`;
    const text = `🔥 ${deal.title} — ${deal.discountPercent}% OFF! Check it out on Neardis`;

    if (navigator.share) {
      try {
        await navigator.share({ title: deal.title, text, url });
        DealsAPI.trackShare(deal._id).catch(() => {});
        return;
      } catch {}
    }

    // WhatsApp fallback
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`;
    window.open(waUrl, '_blank');
    DealsAPI.trackShare(deal._id).catch(() => {});
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────
window.NeardisAPI = {
  Auth,
  AuthAPI,
  DealsAPI,
  ReviewsAPI,
  BookmarksAPI,
  BusinessAPI,
  PaymentsAPI,
  AdminAPI,
  Geo,
  Toast,
  Clipboard,
  Share
};
