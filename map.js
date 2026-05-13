// ─── Map State ────────────────────────────────────────────────────────────────
const MapPage = {
  map:          null,
  clusterGroup: null,
  heatLayer:    null,
  deals:        [],
  userMarker:   null,
  radiusCircle: null,
  userLat:      null,
  userLng:      null,
  radius:       5000,
  category:     '',
  viewMode:     'clusters', // 'clusters' | 'heatmap'
  selectedDeal: null,

  // ─── Init ──────────────────────────────────────────────────────────────────
  async init() {
    this._initMap();
    this._bindControls();
    await this._locateUser();
    await this.loadDeals();
  },

  // ─── Init Leaflet Map ──────────────────────────────────────────────────────
  _initMap() {
    // Default center: Lahore, Pakistan
    this.map = L.map('map-container', {
      center:          [31.5204, 74.3587],
      zoom:            13,
      zoomControl:     false,
      attributionControl: true
    });

    // Zoom control (top-right)
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(this.map);

    // Cluster group
    this.clusterGroup = L.markerClusterGroup({
      chunkedLoading:   true,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="neardis-marker" style="width:36px;height:36px">
                   <div class="neardis-marker-inner">${count}</div>
                 </div>`,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 36]
        });
      }
    });
    this.map.addLayer(this.clusterGroup);

    // Map move end: reload deals for new area
    this.map.on('moveend', () => {
      const center = this.map.getCenter();
      this.userLat = center.lat;
      this.userLng = center.lng;
      this.loadDeals();
    });
  },

  // ─── Locate User ──────────────────────────────────────────────────────────
  async _locateUser() {
    try {
      const pos = await window.NeardisAPI.Geo.getPosition();
      this.userLat = pos.lat;
      this.userLng = pos.lng;
      this._setUserMarker(pos.lat, pos.lng);
      this.map.setView([pos.lat, pos.lng], 14);
    } catch {
      // Keep default center
      this.userLat = 31.5204;
      this.userLng = 74.3587;
    }
  },

  // ─── Set User Location Marker ──────────────────────────────────────────────
  _setUserMarker(lat, lng) {
    if (this.userMarker) this.map.removeLayer(this.userMarker);
    if (this.radiusCircle) this.map.removeLayer(this.radiusCircle);

    this.userMarker = L.circleMarker([lat, lng], {
      radius:      10,
      fillColor:   '#0a84ff',
      fillOpacity: 0.9,
      color:       '#fff',
      weight:      3,
      interactive: false
    }).addTo(this.map);

    // Outer pulse ring
    this.radiusCircle = L.circle([lat, lng], {
      radius:      this.radius,
      fillColor:   'rgba(255,45,85,0.05)',
      fillOpacity: 1,
      color:       'rgba(255,45,85,0.3)',
      weight:      1.5,
      dashArray:   '6,4',
      interactive: false
    }).addTo(this.map);
  },

  // ─── Load Deals from API ───────────────────────────────────────────────────
  async loadDeals() {
    this._setLoading(true);

    try {
      const params = {
        lat:    this.userLat  || 31.5204,
        lng:    this.userLng  || 74.3587,
        radius: this.radius,
        limit:  200
      };
      if (this.category) params.category = this.category;

      const res   = await window.NeardisAPI.DealsAPI.getForMap(params);
      this.deals  = res.deals || [];

      this._renderMarkers();
      this._updateCount();

    } catch (err) {
      console.error('Map load error:', err);
      window.NeardisAPI.Toast.error('Failed to load map deals.');
    } finally {
      this._setLoading(false);
    }
  },

  // ─── Render Markers ───────────────────────────────────────────────────────
  _renderMarkers() {
    this.clusterGroup.clearLayers();
    if (this.heatLayer) {
      this.map.removeLayer(this.heatLayer);
      this.heatLayer = null;
    }

    if (this.viewMode === 'heatmap') {
      this._renderHeatmap();
      return;
    }

    const markers = [];

    this.deals.forEach(deal => {
      if (!deal.location?.coordinates?.length) return;
      const [lng, lat] = deal.location.coordinates;

      const isFlash = deal.isFlashDeal;
      const icon    = L.divIcon({
        html: `<div class="neardis-marker ${isFlash ? 'neardis-marker--flash' : ''}"
                    style="width:32px;height:32px">
                 <div class="neardis-marker-inner">
                   ${deal.discountPercent}%
                 </div>
               </div>`,
        className:  '',
        iconSize:   [32, 32],
        iconAnchor: [16, 32],
        popupAnchor:[0, -34]
      });

      const marker = L.marker([lat, lng], { icon });

      // Popup content
      marker.bindPopup(this._buildPopup(deal), {
        maxWidth:   240,
        minWidth:   220,
        className:  'neardis-popup',
        closeButton: true
      });

      marker.on('click', () => {
        this.selectedDeal = deal;
        this._openPanel([deal]);
      });

      markers.push(marker);
    });

    this.clusterGroup.addLayers(markers);

    // On cluster click — show deals in panel
    this.clusterGroup.on('clusterclick', (e) => {
      const clusterDeals = e.layer.getAllChildMarkers().map(m => {
        return this.deals.find(d => {
          if (!d.location?.coordinates) return false;
          const [lng, lat] = d.location.coordinates;
          return Math.abs(m.getLatLng().lat - lat) < 0.0001 &&
                 Math.abs(m.getLatLng().lng - lng) < 0.0001;
        });
      }).filter(Boolean);

      this._openPanel(clusterDeals);
    });
  },

  // ─── Render Heatmap ───────────────────────────────────────────────────────
  _renderHeatmap() {
    const points = this.deals
      .filter(d => d.location?.coordinates?.length === 2)
      .map(d => {
        const [lng, lat] = d.location.coordinates;
        const intensity  = d.discountPercent / 100; // 0–1
        return [lat, lng, intensity];
      });

    if (window.L.heatLayer) {
      this.heatLayer = L.heatLayer(points, {
        radius:   25,
        blur:     20,
        maxZoom:  17,
        gradient: { 0.2: '#0a84ff', 0.5: '#ff6b35', 0.8: '#ff2d55', 1.0: '#ff2d55' }
      });
      this.heatLayer.addTo(this.map);
    }
  },

  // ─── Build Popup HTML ──────────────────────────────────────────────────────
  _buildPopup(deal) {
    const dist = this.userLat
      ? window.Haversine.dealDistance(deal, this.userLat, this.userLng)
      : '';
    const timerLabel = window.Timer.expiresInLabel(deal.expiresAt);

    return `
      <div class="map-popup">
        <img
          src="${deal.thumbnail || ''}"
          alt="${deal.title}"
          class="map-popup__img"
          onerror="this.style.display='none'"
        />
        <div class="map-popup__body">
          <div class="map-popup__discount">${deal.discountPercent}% OFF</div>
          <p class="map-popup__title">${deal.title}</p>
          <div class="map-popup__meta">
            <span>🏪 ${deal.business?.businessName || 'Shop'}</span>
            ${dist ? `<span>📍 ${dist}</span>` : ''}
            <span>⏰ ${timerLabel}</span>
          </div>
          <a href="/client/pages/deal.html?id=${deal._id}" class="map-popup__cta">
            View Deal 🔥
          </a>
        </div>
      </div>`;
  },

  // ─── Open Side Panel ──────────────────────────────────────────────────────
  _openPanel(deals) {
    const panel = document.getElementById('map-panel');
    const body  = document.getElementById('map-panel-body');
    const title = document.getElementById('map-panel-title');

    title.textContent = deals.length === 1
      ? deals[0].business?.businessName || 'Deal'
      : `${deals.length} Deals Here`;

    body.innerHTML = deals.map(deal => {
      const dist = this.userLat
        ? window.Haversine.dealDistance(deal, this.userLat, this.userLng)
        : '';

      return `
        <a href="/client/pages/deal.html?id=${deal._id}" class="map-deal-card">
          <img
            src="${deal.thumbnail || ''}"
            alt="${deal.title}"
            class="map-deal-card__img"
            onerror="this.src='/client/assets/placeholder.png'"
          />
          <div class="map-deal-card__info">
            <p class="map-deal-card__title">${deal.title}</p>
            <p class="map-deal-card__meta">
              ${deal.category}${dist ? ` · ${dist}` : ''}
            </p>
            <div style="display:flex;gap:0.375rem;flex-wrap:wrap;margin-top:3px">
              ${deal.isFlashDeal ? '<span class="badge badge--flash" style="font-size:0.625rem">⚡ FLASH</span>' : ''}
            </div>
          </div>
          <span class="map-deal-card__discount">${deal.discountPercent}%</span>
        </a>`;
    }).join('');

    panel.classList.add('map-panel--open');
  },

  // ─── Bind Controls ────────────────────────────────────────────────────────
  _bindControls() {
    // Radius tabs
    document.getElementById('radius-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      document.querySelectorAll('#radius-tabs .tab').forEach(t => t.classList.remove('tab--active'));
      tab.classList.add('tab--active');
      this.radius = parseInt(tab.dataset.radius) || 5000;

      // Update radius circle
      if (this.radiusCircle && this.userLat) {
        this.map.removeLayer(this.radiusCircle);
        this.radiusCircle = L.circle([this.userLat, this.userLng], {
          radius:      this.radius,
          fillColor:   'rgba(255,45,85,0.05)',
          fillOpacity: 1,
          color:       'rgba(255,45,85,0.3)',
          weight:      1.5,
          dashArray:   '6,4',
          interactive: false
        }).addTo(this.map);
      }

      this.loadDeals();
    });

    // Category select
    document.getElementById('map-category')?.addEventListener('change', (e) => {
      this.category = e.target.value;
      this.loadDeals();
    });

    // View toggles
    document.getElementById('toggle-clusters')?.addEventListener('click', () => {
      this.viewMode = 'clusters';
      document.getElementById('toggle-clusters')?.classList.add('map-toggle-btn--active');
      document.getElementById('toggle-heatmap')?.classList.remove('map-toggle-btn--active');
      this._renderMarkers();
    });

    document.getElementById('toggle-heatmap')?.addEventListener('click', () => {
      this.viewMode = 'heatmap';
      document.getElementById('toggle-heatmap')?.classList.add('map-toggle-btn--active');
      document.getElementById('toggle-clusters')?.classList.remove('map-toggle-btn--active');
      this._renderMarkers();
    });

    // Locate me
    document.getElementById('locate-me-btn')?.addEventListener('click', async () => {
      window.NeardisAPI.Geo.cachedPosition = null;
      await this._locateUser();
      this.loadDeals();
    });

    // Panel close
    document.getElementById('map-panel-close')?.addEventListener('click', () => {
      document.getElementById('map-panel')?.classList.remove('map-panel--open');
    });
  },

  // ─── Update Count Badge ───────────────────────────────────────────────────
  _updateCount() {
    const el = document.getElementById('map-count-text');
    if (el) el.textContent = `${this.deals.length} deal${this.deals.length !== 1 ? 's' : ''} in view`;
  },

  // ─── Loading State ────────────────────────────────────────────────────────
  _setLoading(state) {
    const spinner  = document.getElementById('map-spinner');
    const text     = document.getElementById('map-count-text');
    if (spinner)   spinner.style.display = state ? 'block' : 'none';
    if (text && state) text.textContent  = 'Loading deals…';
  }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => MapPage.init());
window.MapPage = MapPage;
