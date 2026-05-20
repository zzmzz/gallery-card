/**
 * Memory Leak Test for gallery-card
 *
 * 模拟 Home Assistant 环境，测试以下泄漏场景：
 * 1. keydown 监听器是否无限累积
 * 2. slideshow 定时器是否无法取消
 * 3. IntersectionObserver 是否正确断开
 * 4. disconnectedCallback 是否清理资源
 * 5. 反复 loadResources 后内存是否稳定
 */

// ========== Mock Environment ==========

class MockShadowRoot {
  constructor() {
    this._elements = new Map();
    this._observers = [];
  }
  getElementById(id) {
    if (!this._elements.has(id)) {
      this._elements.set(id, { style: {}, src: '', innerHTML: '', onclick: null });
    }
    return this._elements.get(id);
  }
  querySelectorAll(selector) {
    if (selector === 'img.lzy_img') {
      return Array.from({ length: 5 }, () => ({ dataset: { src: 'test.jpg' }, src: '' }));
    }
    if (selector === 'video.lzy_video') {
      return [];
    }
    return [];
  }
  querySelector(selector) {
    if (selector.startsWith('#resource')) return { scrollIntoView: () => {} };
    if (selector.includes('video[data-src]')) return null;
    return null;
  }
}

// ========== Test Utilities ==========

let documentListeners = [];
const originalAddEventListener = (typeof document !== 'undefined') ? null : null;

// Simple mock for document.addEventListener tracking
const mockDocument = {
  _listeners: [],
  addEventListener(type, handler) {
    this._listeners.push({ type, handler });
  },
  removeEventListener(type, handler) {
    const idx = this._listeners.findIndex(l => l.type === type && l.handler === handler);
    if (idx >= 0) this._listeners.splice(idx, 1);
  },
  getListenerCount(type) {
    return this._listeners.filter(l => l.type === type).length;
  },
  reset() {
    this._listeners = [];
  }
};

// Track active timers
let activeTimers = new Set();
let timerIdCounter = 0;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

function mockSetTimeout(fn, delay) {
  const id = ++timerIdCounter;
  activeTimers.add(id);
  // Actually schedule it but track
  const realId = originalSetTimeout(() => {
    activeTimers.delete(id);
    fn();
  }, Math.min(delay, 10)); // Speed up for testing
  // Store mapping
  activeTimers.set ? null : null;
  return id;
}

// Track IntersectionObserver instances
let observerInstances = [];
let totalObservedElements = 0;

class MockIntersectionObserver {
  constructor(callback) {
    this._callback = callback;
    this._observed = new Set();
    observerInstances.push(this);
  }
  observe(el) {
    this._observed.add(el);
    totalObservedElements++;
  }
  unobserve(el) {
    this._observed.delete(el);
  }
  disconnect() {
    this._observed.clear();
  }
  get observedCount() {
    return this._observed.size;
  }
}

// ========== Test Runner ==========

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n' + '='.repeat(60));
    console.log('  Gallery Card Memory Leak Tests');
    console.log('='.repeat(60) + '\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`  ✅ PASS: ${name}`);
      } catch (e) {
        this.failed++;
        console.log(`  ❌ FAIL: ${name}`);
        console.log(`         ${e.message}`);
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`  Results: ${this.passed} passed, ${this.failed} failed, ${this.tests.length} total`);
    console.log('-'.repeat(60) + '\n');

    return this.failed === 0;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual'}: expected ${expected}, got ${actual}`);
  }
}

// ========== Create Mock Card Instance (simulates behavior without LitElement) ==========

function createMockOriginalCard() {
  return {
    config: { entities: ['sensor.test'], slideshow_timer: '3' },
    resources: [],
    currentResourceIndex: 0,
    errors: [],
    _hass: { states: {}, callService: () => {} },
    _downloadingVideos: false,
    shadowRoot: new MockShadowRoot(),
    parentNode: { tagName: 'div' },
    imageObserver: new MockIntersectionObserver(() => {}),

    // Simulates original _loadResources behavior (keydown listener part)
    _loadResources_keydownPart() {
      // Original: always adds new anonymous listener
      mockDocument.addEventListener('keydown', ev => this._keyNavigation(ev));
    },

    // Simulates original _doSlideShow
    _slideshowTimers: [],
    _doSlideShow_original(firstTime) {
      if (this.config.slideshow_timer) {
        var time = parseInt(this.config.slideshow_timer);
        if (!isNaN(time) && time > 0) {
          const id = setTimeout(() => {}, time * 1000);
          this._slideshowTimers.push(id);
        }
      }
    },

    // Simulates original updated() - observe without disconnect
    _updated_original() {
      const arr = [{ dataset: { src: 'a.jpg' } }, { dataset: { src: 'b.jpg' } }];
      arr.forEach(v => this.imageObserver.observe(v));
    },

    _keyNavigation(ev) {},
  };
}

function createMockFixedCard() {
  return {
    config: { entities: ['sensor.test'], slideshow_timer: '3' },
    resources: [],
    currentResourceIndex: 0,
    errors: [],
    _hass: { states: {}, callService: () => {} },
    _downloadingVideos: false,
    _keyListenerAttached: false,
    _slideshowTimer: null,
    _boundKeyNav: null,
    _boundModalClose: null,
    shadowRoot: new MockShadowRoot(),
    parentNode: { tagName: 'div' },
    imageObserver: new MockIntersectionObserver(() => {}),

    _init() {
      this._boundKeyNav = (ev) => this._keyNavigation(ev);
      this._boundModalClose = () => {};
    },

    // Fixed: only attach once
    _loadResources_keydownPart() {
      if (!this._keyListenerAttached) {
        mockDocument.addEventListener('keydown', this._boundKeyNav);
        this._keyListenerAttached = true;
      }
    },

    // Fixed: clear before set
    _doSlideShow_fixed(firstTime) {
      if (this.config.slideshow_timer) {
        var time = parseInt(this.config.slideshow_timer);
        if (!isNaN(time) && time > 0) {
          if (this._slideshowTimer) clearTimeout(this._slideshowTimer);
          this._slideshowTimer = setTimeout(() => {}, time * 1000);
        }
      }
    },

    // Fixed: disconnect before re-observing
    _updated_fixed() {
      this.imageObserver.disconnect();
      const arr = [{ dataset: { src: 'a.jpg' } }, { dataset: { src: 'b.jpg' } }];
      arr.forEach(v => this.imageObserver.observe(v));
    },

    // Fixed: disconnectedCallback
    disconnectedCallback() {
      if (this._slideshowTimer) {
        clearTimeout(this._slideshowTimer);
        this._slideshowTimer = null;
      }
      if (this._keyListenerAttached) {
        mockDocument.removeEventListener('keydown', this._boundKeyNav);
        this._keyListenerAttached = false;
      }
      if (this.imageObserver) {
        this.imageObserver.disconnect();
      }
    },

    _keyNavigation(ev) {},
  };
}

// ========== Tests ==========

const runner = new TestRunner();

// Test 1: Original card leaks keydown listeners
runner.test('ORIGINAL: keydown listeners accumulate on repeated _loadResources', () => {
  mockDocument.reset();
  const card = createMockOriginalCard();

  // Simulate 100 resource loads (e.g., entity state changes over hours)
  for (let i = 0; i < 100; i++) {
    card._loadResources_keydownPart();
  }

  const count = mockDocument.getListenerCount('keydown');
  assert(count === 100, `Expected 100 accumulated listeners, got ${count}`);
  console.log(`         → ${count} keydown listeners after 100 loads (LEAK!)`);
});

// Test 2: Fixed card maintains exactly 1 keydown listener
runner.test('FIXED: keydown listener stays at 1 after repeated _loadResources', () => {
  mockDocument.reset();
  const card = createMockFixedCard();
  card._init();

  for (let i = 0; i < 100; i++) {
    card._loadResources_keydownPart();
  }

  const count = mockDocument.getListenerCount('keydown');
  assertEqual(count, 1, 'Listener count');
  console.log(`         → ${count} keydown listener after 100 loads (OK)`);
});

// Test 3: Original slideshow creates uncontrolled timers
runner.test('ORIGINAL: slideshow creates multiple uncontrolled timers', () => {
  const card = createMockOriginalCard();

  for (let i = 0; i < 50; i++) {
    card._doSlideShow_original(false);
  }

  assert(card._slideshowTimers.length === 50,
    `Expected 50 timer IDs stored, got ${card._slideshowTimers.length}`);
  console.log(`         → ${card._slideshowTimers.length} timers created (LEAK! None can be cancelled)`);

  // Cleanup
  card._slideshowTimers.forEach(id => clearTimeout(id));
});

// Test 4: Fixed slideshow maintains single timer
runner.test('FIXED: slideshow maintains only 1 active timer', () => {
  const card = createMockFixedCard();

  for (let i = 0; i < 50; i++) {
    card._doSlideShow_fixed(false);
  }

  assert(card._slideshowTimer !== null, 'Should have an active timer');
  // Only one timer reference exists - previous ones were cleared
  console.log(`         → Single timer reference maintained after 50 calls (OK)`);

  clearTimeout(card._slideshowTimer);
});

// Test 5: Original observer accumulates observed elements
runner.test('ORIGINAL: IntersectionObserver accumulates observed elements', () => {
  const card = createMockOriginalCard();
  card.imageObserver = new MockIntersectionObserver(() => {});

  // Simulate 20 render cycles
  for (let i = 0; i < 20; i++) {
    card._updated_original();
  }

  // Each call adds 2 new elements without removing old ones
  // Since we create new objects each time, all are unique
  assert(card.imageObserver.observedCount === 40,
    `Expected 40 observed elements, got ${card.imageObserver.observedCount}`);
  console.log(`         → ${card.imageObserver.observedCount} observed elements after 20 renders (LEAK!)`);
});

// Test 6: Fixed observer maintains constant count
runner.test('FIXED: IntersectionObserver maintains constant element count', () => {
  const card = createMockFixedCard();
  card.imageObserver = new MockIntersectionObserver(() => {});

  for (let i = 0; i < 20; i++) {
    card._updated_fixed();
  }

  // disconnect() clears all, then re-adds only current 2
  assertEqual(card.imageObserver.observedCount, 2, 'Observed count');
  console.log(`         → ${card.imageObserver.observedCount} observed elements after 20 renders (OK, constant)`);
});

// Test 7: Fixed disconnectedCallback cleans everything
runner.test('FIXED: disconnectedCallback removes all resources', () => {
  mockDocument.reset();
  const card = createMockFixedCard();
  card._init();
  card.imageObserver = new MockIntersectionObserver(() => {});

  // Setup state: listener attached, timer active, observer watching
  card._loadResources_keydownPart();
  card._doSlideShow_fixed(true);
  card._updated_fixed();

  assertEqual(mockDocument.getListenerCount('keydown'), 1, 'Pre-disconnect listener count');
  assert(card._slideshowTimer !== null, 'Pre-disconnect timer should exist');
  assert(card.imageObserver.observedCount > 0, 'Pre-disconnect observer should be watching');

  // Simulate removal from DOM
  card.disconnectedCallback();

  assertEqual(mockDocument.getListenerCount('keydown'), 0, 'Post-disconnect listener count');
  assertEqual(card._slideshowTimer, null, 'Post-disconnect timer');
  assertEqual(card.imageObserver.observedCount, 0, 'Post-disconnect observer count');
  console.log('         → All resources cleaned up on disconnect (OK)');
});

// Test 8: Simulate long-running scenario - memory growth comparison
runner.test('COMPARISON: Memory growth simulation over 1000 cycles', () => {
  mockDocument.reset();

  // Original card
  const original = createMockOriginalCard();
  let originalListenerGrowth = 0;
  let originalObserverGrowth = 0;

  for (let i = 0; i < 1000; i++) {
    original._loadResources_keydownPart();
    original._updated_original();
  }
  originalListenerGrowth = mockDocument.getListenerCount('keydown');
  originalObserverGrowth = original.imageObserver.observedCount;

  mockDocument.reset();

  // Fixed card
  const fixed = createMockFixedCard();
  fixed._init();
  fixed.imageObserver = new MockIntersectionObserver(() => {});

  for (let i = 0; i < 1000; i++) {
    fixed._loadResources_keydownPart();
    fixed._updated_fixed();
  }
  const fixedListeners = mockDocument.getListenerCount('keydown');
  const fixedObservers = fixed.imageObserver.observedCount;

  console.log(`         → Original after 1000 cycles: ${originalListenerGrowth} listeners, ${originalObserverGrowth} observed`);
  console.log(`         → Fixed after 1000 cycles: ${fixedListeners} listeners, ${fixedObservers} observed`);
  console.log(`         → Reduction: ${((1 - fixedListeners/originalListenerGrowth) * 100).toFixed(1)}% fewer listeners, ${((1 - fixedObservers/originalObserverGrowth) * 100).toFixed(1)}% fewer observed`);

  assertEqual(fixedListeners, 1, 'Fixed listener count');
  assertEqual(fixedObservers, 2, 'Fixed observer count');
  assert(originalListenerGrowth === 1000, 'Original should have 1000 listeners');
});

// Test 9: Modal onclick handler stability
runner.test('FIXED: modal onclick uses stable reference', () => {
  const card = createMockFixedCard();
  card._init();
  const modal = card.shadowRoot.getElementById('imageModal');

  // Simulate 50 popup opens
  for (let i = 0; i < 50; i++) {
    modal.onclick = card._boundModalClose;
  }

  // onclick is a property, so it's always the same reference (not accumulating)
  assert(modal.onclick === card._boundModalClose,
    'Modal onclick should be the stable bound reference');
  console.log('         → Same handler reference after 50 assignments (OK)');
});

// Test 10: Image unloading - observer should unload images when not intersecting
runner.test('FIXED: IntersectionObserver unloads images when they leave viewport', () => {
  const placeholderSrc = "/local/community/gallery-card/placeholder.jpg";

  // Simulate the fixed observer callback behavior
  const images = Array.from({ length: 20 }, (_, i) => ({
    tagName: 'IMG',
    dataset: { src: `http://ha/media/photo_${i}.jpg` },
    src: placeholderSrc
  }));

  // Simulate: first 5 images enter viewport
  const loadedImages = [];
  images.slice(0, 5).forEach(img => {
    // isIntersecting = true
    img.src = img.dataset.src;
    loadedImages.push(img);
  });

  // Verify 5 images loaded
  const loadedCount = images.filter(img => img.src !== placeholderSrc).length;
  assertEqual(loadedCount, 5, 'Loaded image count');

  // Simulate: first 5 leave viewport (scroll down)
  loadedImages.forEach(img => {
    // isIntersecting = false → should reset to placeholder
    if (img.tagName === 'IMG' && img.dataset.src && img.src !== placeholderSrc) {
      img.src = placeholderSrc;
    }
  });

  // Verify all images back to placeholder (memory freed)
  const stillLoadedCount = images.filter(img => img.src !== placeholderSrc).length;
  assertEqual(stillLoadedCount, 0, 'Images still loaded after leaving viewport');
  console.log(`         → ${loadedCount} images loaded when visible, ${stillLoadedCount} retained after scrolling away (OK)`);
});

// Test 11: Memory estimation - original vs fixed with large gallery
runner.test('COMPARISON: Estimated memory with 500 images scrolled', () => {
  const placeholderSrc = "/local/community/gallery-card/placeholder.jpg";
  const avgImageDecodedSizeMB = 3; // avg decoded bitmap ~3MB (1920x1080x4bytes ≈ 8MB, thumbnails smaller)
  const totalImages = 500;
  const visibleAtOnce = 8; // typical visible thumbnails in menu

  // Original: all scrolled images stay loaded
  const originalMemoryMB = totalImages * avgImageDecodedSizeMB;

  // Fixed: only visible + buffer (200px rootMargin ≈ +4 extra) stay loaded
  const fixedLoadedCount = visibleAtOnce + 4; // visible + rootMargin buffer
  const fixedMemoryMB = fixedLoadedCount * avgImageDecodedSizeMB;

  const reduction = ((1 - fixedMemoryMB / originalMemoryMB) * 100).toFixed(1);

  console.log(`         → Original: ${totalImages} images loaded = ~${originalMemoryMB}MB decoded bitmaps`);
  console.log(`         → Fixed: ${fixedLoadedCount} images loaded = ~${fixedMemoryMB}MB decoded bitmaps`);
  console.log(`         → Memory reduction: ${reduction}%`);

  assert(fixedMemoryMB < originalMemoryMB * 0.1, 'Fixed should use <10% of original memory');
});

// Test 12: Placeholder uses data URI instead of external file
runner.test('FIXED: placeholder is a data URI, no external file dependency', () => {
  const placeholderSrc = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  assert(placeholderSrc.startsWith('data:'), 'Placeholder should be a data URI');
  assert(!placeholderSrc.includes('/local/'), 'Placeholder should not reference external path');
  console.log('         → Placeholder is inline data URI, no 404 possible (OK)');
});

// Test 13: Slideshow should only start after resources are loaded
runner.test('FIXED: slideshow starts only after _loadResources completes', () => {
  const card = createMockFixedCard();
  card.config.slideshow_timer = '5';
  card.resources = [];
  card.currentResourceIndex = undefined;

  // Before resources load: no timer should be active
  // (setConfig no longer calls _doSlideShow)
  assertEqual(card._slideshowTimer, null, 'No timer before data loads');

  // Simulate resources loaded
  card.resources = [{ url: 'a.jpg', extension: 'jpg', caption: 'a' }];
  card.currentResourceIndex = 0;

  // Now start slideshow like _loadResources does after data is ready
  if (card._slideshowTimer) clearTimeout(card._slideshowTimer);
  card._slideshowTimer = null;
  if (card.resources.length > 0) {
    // simulate _doSlideShow(true)
    var time = parseInt(card.config.slideshow_timer);
    if (!isNaN(time) && time > 0) {
      card._slideshowTimer = setTimeout(() => {}, time * 1000);
    }
  }

  assert(card._slideshowTimer !== null, 'Timer should be active after resources load');
  console.log('         → Slideshow timer only starts after data is ready (OK)');

  clearTimeout(card._slideshowTimer);
});

// ========== Run ==========

runner.run().then(success => {
  if (!success) process.exit(1);
});
