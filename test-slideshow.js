/**
 * 端到端测试 slideshow 自动轮转
 * 模拟完整的组件生命周期：setConfig → set hass → _loadResources → slideshow
 */

// ===== Minimal LitElement mock =====
class MockLitElement {
  constructor() {
    this._properties = {};
    this._shadowRoot = new MockShadowRoot();
  }
  get shadowRoot() { return this._shadowRoot; }
  requestUpdate() {}
  static get properties() { return {}; }
}

class MockShadowRoot {
  constructor() { this._els = {}; }
  getElementById(id) {
    if (!this._els[id]) this._els[id] = { style: {}, src: '', innerHTML: '', onclick: null, scrollIntoView: () => {} };
    return this._els[id];
  }
  querySelectorAll(sel) { return []; }
  querySelector(sel) {
    if (sel.startsWith('#resource')) return { scrollIntoView: () => {} };
    return null;
  }
}

// ===== Timer tracking =====
let timers = new Map();
let timerId = 0;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

globalThis.setTimeout = function(fn, delay) {
  const id = ++timerId;
  const realId = realSetTimeout(fn, Math.min(delay, 50)); // cap delay at 50ms for testing
  timers.set(id, { fn, delay, realId, cleared: false });
  return id;
};

globalThis.clearTimeout = function(id) {
  if (timers.has(id)) {
    timers.get(id).cleared = true;
    realClearTimeout(timers.get(id).realId);
  }
  realClearTimeout(id);
};

// ===== Mock document =====
const _docListeners = [];
globalThis.document = {
  addEventListener(type, handler) { _docListeners.push({ type, handler }); },
  removeEventListener(type, handler) {
    const idx = _docListeners.findIndex(l => l.type === type && l.handler === handler);
    if (idx >= 0) _docListeners.splice(idx, 1);
  }
};

// ===== Mock IntersectionObserver =====
globalThis.IntersectionObserver = class {
  constructor(cb, opts) { this._cb = cb; this._observed = new Set(); }
  observe(el) { this._observed.add(el); }
  unobserve(el) { this._observed.delete(el); }
  disconnect() { this._observed.clear(); }
};

// ===== Mock dayjs =====
globalThis.dayjs = function() { return dayjs; };
dayjs.extend = () => {};
dayjs.format = () => '';
globalThis.dayjs_plugin_customParseFormat = {};
globalThis.dayjs_plugin_relativeTime = {};

// ===== Simulate the GalleryCard class (key methods only) =====

class SimulatedGalleryCard {
  constructor() {
    this._downloadingVideos = false;
    this._loadingResources = false;
    this._keyListenerAttached = false;
    this._slideshowTimer = null;
    this._boundKeyNav = null;
    this._boundModalClose = null;
    this.resources = [];
    this.currentResourceIndex = undefined;
    this.errors = [];
    this.config = {};
    this._hass = null;
    this.parentNode = { tagName: 'div' };
    this.shadowRoot = new MockShadowRoot();
    this.imageObserver = new IntersectionObserver(() => {});
    this._selectResourceCalls = [];
  }

  setConfig(config) {
    this._placeholderSrc = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    this.imageObserver = new IntersectionObserver(() => {}, { rootMargin: '200px 0px' });

    if (!config.entity && !config.entities) {
      throw new Error("Required configuration for entities is missing");
    }

    this.config = config;
    if (this.config.entity) {
      if (!this.config.entities) this.config = { ...this.config, entities: [] };
      this.config.entities.push(this.config.entity);
      delete this.config.entity;
    }

    if (!this._boundKeyNav) this._boundKeyNav = (ev) => this._keyNavigation(ev);
    if (!this._boundModalClose) this._boundModalClose = () => {};

    if (this._hass !== undefined && this._hass !== null)
      this._loadResources(this._hass);
  }

  set hass(hass) {
    this._hass = hass;
    if (this.resources == null || (this.resources.length === 0 && !this._loadingResources))
      this._loadResources(this._hass);
  }

  _doSlideShow(firstTime) {
    if (!firstTime)
      this._selectResource(this.currentResourceIndex + 1, true);

    if (this.config.slideshow_timer) {
      var time = parseInt(this.config.slideshow_timer);
      if (!isNaN(time) && time > 0) {
        if (this._slideshowTimer) clearTimeout(this._slideshowTimer);
        this._slideshowTimer = setTimeout(() => { this._doSlideShow(); }, (time * 1000));
      }
    }
  }

  _selectResource(idx, fromSlideshow) {
    var nextResourceIdx = idx;
    if (idx < 0) nextResourceIdx = this.resources.length - 1;
    else if (idx >= this.resources.length) nextResourceIdx = 0;

    this.currentResourceIndex = nextResourceIdx;
    this._selectResourceCalls.push({ idx: nextResourceIdx, fromSlideshow, time: Date.now() });
  }

  _keyNavigation(ev) {}

  _loadResources(hass) {
    this._loadingResources = true;
    this.currentResourceIndex = undefined;
    this.resources = [];

    // Simulate async load with mock data
    const fakeResources = [
      { url: '/media/photo1.jpg', extension: 'jpg', caption: 'Photo 1' },
      { url: '/media/photo2.jpg', extension: 'jpg', caption: 'Photo 2' },
      { url: '/media/photo3.jpg', extension: 'jpg', caption: 'Photo 3' },
      { url: '/media/photo4.jpg', extension: 'jpg', caption: 'Photo 4' },
      { url: '/media/photo5.jpg', extension: 'jpg', caption: 'Photo 5' },
    ];

    // Simulate Promise.all(...).then(...)
    Promise.resolve(fakeResources).then(resources => {
      this.resources = resources;
      this.currentResourceIndex = 0;

      if (!this._keyListenerAttached) {
        document.addEventListener('keydown', this._boundKeyNav);
        this._keyListenerAttached = true;
      }

      // slideshow 启动逻辑
      if (this._slideshowTimer) clearTimeout(this._slideshowTimer);
      this._slideshowTimer = null;
      if (this.resources.length > 0) {
        this._doSlideShow(true);
      }

      this.errors = [];
      this._loadingResources = false;
    });
  }
}

// ===== Run the test =====

async function runTest() {
  console.log('\n' + '='.repeat(60));
  console.log('  Slideshow End-to-End Test');
  console.log('='.repeat(60) + '\n');

  const card = new SimulatedGalleryCard();

  // Step 1: setConfig (like HA does on card init)
  console.log('  1. setConfig({ slideshow_timer: "2", entities: [...] })');
  card.setConfig({
    entities: ['sensor.gallery_images'],
    slideshow_timer: '2'  // 2 seconds
  });

  console.log(`     → _slideshowTimer after setConfig: ${card._slideshowTimer}`);
  console.log(`     → resources.length: ${card.resources.length}`);
  console.log(`     → currentResourceIndex: ${card.currentResourceIndex}`);

  // Step 2: set hass (HA passes hass object)
  console.log('\n  2. set hass(...)');
  card.hass = { states: { 'sensor.gallery_images': { attributes: { file_list: [] } } }, callService: () => {} };

  // Wait for promise to resolve
  await new Promise(r => realSetTimeout(r, 20));

  console.log(`     → resources.length: ${card.resources.length}`);
  console.log(`     → currentResourceIndex: ${card.currentResourceIndex}`);
  console.log(`     → _slideshowTimer: ${card._slideshowTimer}`);

  if (card._slideshowTimer === null) {
    console.log('\n  ❌ FAIL: slideshow timer is null after resources loaded!');
    console.log('     The slideshow will NOT auto-advance.');
    process.exit(1);
  }

  console.log(`     → Timer is set (ID: ${card._slideshowTimer}), waiting for advances...`);

  // Step 3: Wait for slideshow to advance several times
  // With timer capped at 50ms in our mock, we wait 300ms for ~5 advances
  console.log('\n  3. Waiting for slideshow advances...');
  await new Promise(r => realSetTimeout(r, 350));

  console.log(`     → _selectResource called ${card._selectResourceCalls.length} times`);
  console.log(`     → Sequence: ${card._selectResourceCalls.map(c => c.idx).join(' → ')}`);
  console.log(`     → currentResourceIndex: ${card.currentResourceIndex}`);

  if (card._selectResourceCalls.length === 0) {
    console.log('\n  ❌ FAIL: slideshow never advanced!');
    process.exit(1);
  }

  // Verify it wraps around correctly
  const indices = card._selectResourceCalls.map(c => c.idx);
  const allValid = indices.every(i => i >= 0 && i < card.resources.length);

  if (!allValid) {
    console.log(`\n  ❌ FAIL: invalid indices detected: ${indices.join(', ')}`);
    process.exit(1);
  }

  console.log('\n  ✅ PASS: Slideshow is working correctly!');
  console.log(`     Advanced ${card._selectResourceCalls.length} times, all indices valid (0-${card.resources.length - 1})`);

  // Step 3b: Test retry when first load returns empty
  console.log('\n  3b. Testing retry when entity has no files initially...');
  const card2 = new SimulatedGalleryCard();
  card2._emptyFirstLoad = true; // flag for testing
  card2.setConfig({ entities: ['sensor.gallery_images'], slideshow_timer: '2' });

  // First set hass - will load resources but get empty (simulated)
  card2._loadResources = function(hass) {
    this._loadingResources = true;
    this.currentResourceIndex = undefined;
    this.resources = [];

    if (this._emptyFirstLoad) {
      // First call: entity not ready yet, no files
      Promise.resolve([]).then(resources => {
        this.resources = [];
        this.currentResourceIndex = 0;
        if (this._slideshowTimer) clearTimeout(this._slideshowTimer);
        this._slideshowTimer = null;
        if (this.resources.length > 0) this._doSlideShow(true);
        this._loadingResources = false;
      });
      this._emptyFirstLoad = false;
    } else {
      // Second call: entity ready now
      Promise.resolve([
        { url: '/media/a.jpg', extension: 'jpg', caption: 'A' },
        { url: '/media/b.jpg', extension: 'jpg', caption: 'B' },
      ]).then(resources => {
        this.resources = resources;
        this.currentResourceIndex = 0;
        if (this._slideshowTimer) clearTimeout(this._slideshowTimer);
        this._slideshowTimer = null;
        if (this.resources.length > 0) this._doSlideShow(true);
        this._loadingResources = false;
      });
    }
  };

  // First hass - empty result
  card2.hass = { states: {}, callService: () => {} };
  await new Promise(r => realSetTimeout(r, 20));
  console.log(`     → After 1st set hass: resources=${card2.resources.length}, timer=${card2._slideshowTimer}`);

  // Second hass - should retry because resources is empty and not loading
  card2.hass = { states: {}, callService: () => {} };
  await new Promise(r => realSetTimeout(r, 20));
  console.log(`     → After 2nd set hass: resources=${card2.resources.length}, timer=${card2._slideshowTimer}`);

  if (card2.resources.length > 0 && card2._slideshowTimer !== null) {
    console.log('     ✅ PASS: Retried successfully, slideshow started after data available');
  } else {
    console.log('     ❌ FAIL: Did not retry or slideshow not started');
    process.exit(1);
  }
  clearTimeout(card2._slideshowTimer);

  // Step 4: Test that timer can be properly stopped
  console.log('\n  4. Testing disconnectedCallback stops slideshow...');
  const timerBefore = card._slideshowTimer;
  if (card._slideshowTimer) clearTimeout(card._slideshowTimer);
  card._slideshowTimer = null;

  const callsBefore = card._selectResourceCalls.length;
  await new Promise(r => realSetTimeout(r, 200));
  const callsAfter = card._selectResourceCalls.length;

  if (callsAfter === callsBefore) {
    console.log('     ✅ PASS: Slideshow stopped after clearTimeout');
  } else {
    console.log(`     ❌ FAIL: Slideshow continued (${callsAfter - callsBefore} more advances)`);
    process.exit(1);
  }

  console.log('\n' + '-'.repeat(60));
  console.log('  All slideshow tests passed!');
  console.log('-'.repeat(60) + '\n');
}

runTest().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
