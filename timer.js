// ─── Neardis Countdown Timer ──────────────────────────────────────────────────
// Manages expiry countdown timers for deal cards and detail pages

const Timer = {

  // ─── Active Timers Registry ──────────────────────────────────────────────────
  _timers: new Map(), // key: elementId → intervalId

  // ─── Start a Countdown Timer ─────────────────────────────────────────────────
  /**
   * Start a live countdown on a DOM element
   * @param {string|Element} target  - Element ID or DOM element
   * @param {string|Date}    expiresAt - ISO date string or Date object
   * @param {Object}         options
   *   @param {Function} onExpire    - Callback when timer hits 0
   *   @param {boolean}  compact     - Show compact format (e.g. "2h 30m")
   *   @param {boolean}  showSeconds - Include seconds in display
   *   @param {string}   expiredText - Text to show when expired
   */
  start(target, expiresAt, options = {}) {
    const el = typeof target === 'string'
      ? document.getElementById(target)
      : target;

    if (!el) return null;

    const {
      onExpire    = null,
      compact     = false,
      showSeconds = true,
      expiredText = 'Expired'
    } = options;

    const expiry = new Date(expiresAt);
    const id     = el.id || `timer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    el.id        = id;

    // Clear any existing timer on this element
    this.stop(id);

    const tick = () => {
      const remaining = expiry - Date.now();

      if (remaining <= 0) {
        el.textContent   = expiredText;
        el.dataset.expired = 'true';
        el.classList.add('timer--expired');
        el.classList.remove('timer--urgent', 'timer--warning');
        this.stop(id);
        if (typeof onExpire === 'function') onExpire(el);
        return;
      }

      const formatted = compact
        ? this.formatCompact(remaining, showSeconds)
        : this.formatFull(remaining, showSeconds);

      el.textContent = formatted;

      // Apply urgency classes
      el.classList.remove('timer--urgent', 'timer--warning', 'timer--normal');
      if      (remaining < 60 * 60 * 1000)        el.classList.add('timer--urgent');  // < 1 hour
      else if (remaining < 3 * 60 * 60 * 1000)    el.classList.add('timer--warning'); // < 3 hours
      else                                         el.classList.add('timer--normal');
    };

    tick(); // Run immediately
    const intervalId = setInterval(tick, 1000);
    this._timers.set(id, intervalId);

    return id;
  },

  // ─── Stop a Timer ────────────────────────────────────────────────────────────
  stop(id) {
    if (this._timers.has(id)) {
      clearInterval(this._timers.get(id));
      this._timers.delete(id);
    }
  },

  // ─── Stop All Timers ─────────────────────────────────────────────────────────
  stopAll() {
    this._timers.forEach((intervalId) => clearInterval(intervalId));
    this._timers.clear();
  },

  // ─── Format: Full (e.g. "2d 14h 30m 45s") ───────────────────────────────────
  formatFull(ms, showSeconds = true) {
    const { days, hours, minutes, seconds } = this._breakdown(ms);

    if (days > 0) {
      return showSeconds
        ? `${days}d ${hours}h ${minutes}m ${seconds}s`
        : `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return showSeconds
        ? `${hours}h ${minutes}m ${seconds}s`
        : `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return showSeconds
        ? `${minutes}m ${seconds}s`
        : `${minutes}m`;
    }
    return `${seconds}s`;
  },

  // ─── Format: Compact (e.g. "2h 30m", "45m", "3d") ───────────────────────────
  formatCompact(ms, showSeconds = false) {
    const { days, hours, minutes, seconds } = this._breakdown(ms);

    if (days >= 7)    return `${Math.floor(days / 7)}w`;
    if (days > 0)     return `${days}d ${hours}h`;
    if (hours > 0)    return `${hours}h ${minutes}m`;
    if (minutes > 0)  return showSeconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    return `${seconds}s`;
  },

  // ─── Format: Clock Style (e.g. "02:30:45") ───────────────────────────────────
  formatClock(ms) {
    const { hours, minutes, seconds } = this._breakdown(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  },

  // ─── Static: Get Remaining from ISO String ────────────────────────────────────
  /**
   * Get remaining milliseconds from an expiry date
   * @param {string|Date} expiresAt
   * @returns {number} ms remaining (0 if expired)
   */
  remaining(expiresAt) {
    return Math.max(0, new Date(expiresAt) - Date.now());
  },

  // ─── Static: Is Expired ──────────────────────────────────────────────────────
  isExpired(expiresAt) {
    return new Date(expiresAt) <= new Date();
  },

  // ─── Static: Urgency Level ───────────────────────────────────────────────────
  /**
   * Returns urgency level based on remaining time
   * @returns {'expired'|'urgent'|'warning'|'normal'}
   */
  urgencyLevel(expiresAt) {
    const ms = this.remaining(expiresAt);
    if (ms === 0)                        return 'expired';
    if (ms < 60 * 60 * 1000)            return 'urgent';   // < 1h
    if (ms < 3 * 60 * 60 * 1000)        return 'warning';  // < 3h
    return 'normal';
  },

  // ─── Static: Human-readable "Expires In" ────────────────────────────────────
  /**
   * Returns a phrase like "Expires in 2 hours", "Expires today", "Expired"
   */
  expiresInLabel(expiresAt) {
    const ms = this.remaining(expiresAt);
    if (ms === 0) return 'Expired';

    const { days, hours, minutes } = this._breakdown(ms);

    if (days >= 7)   return `Expires in ${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''}`;
    if (days > 1)    return `Expires in ${days} days`;
    if (days === 1)  return 'Expires tomorrow';
    if (hours > 1)   return `Expires in ${hours} hours`;
    if (hours === 1) return 'Expires in 1 hour';
    if (minutes > 1) return `Expires in ${minutes} minutes`;
    return 'Expiring soon!';
  },

  // ─── Init All Timers on Page ─────────────────────────────────────────────────
  /**
   * Auto-initialize all elements with data-expires attribute
   * Usage: <span class="timer" data-expires="2024-12-31T23:59:59Z"></span>
   */
  initAll(options = {}) {
    document.querySelectorAll('[data-expires]').forEach(el => {
      const expiresAt = el.dataset.expires;
      if (!expiresAt) return;

      this.start(el, expiresAt, {
        compact:     el.dataset.compact     === 'true',
        showSeconds: el.dataset.showSeconds !== 'false',
        expiredText: el.dataset.expiredText || 'Expired',
        ...options
      });
    });
  },

  // ─── Cleanup on Page Unload ──────────────────────────────────────────────────
  bindCleanup() {
    window.addEventListener('beforeunload', () => this.stopAll());
    // Also stop timers for removed elements (MutationObserver)
    if ('MutationObserver' in window) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.removedNodes.forEach(node => {
            if (node.id && this._timers.has(node.id)) {
              this.stop(node.id);
            }
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  },

  // ─── Private: Break ms into time units ───────────────────────────────────────
  _breakdown(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    return {
      days:    Math.floor(totalSeconds / 86400),
      hours:   Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600)  / 60),
      seconds: totalSeconds % 60
    };
  }
};

// ─── Auto-init on DOM ready ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Timer.initAll();
  Timer.bindCleanup();
});

// ─── Export ───────────────────────────────────────────────────────────────────
window.Timer = Timer;
