/* Loaded first on every page when the dev server runs with --parity.
 * Makes page behaviour independent of whether the tab is visible, so two runs
 * of the same scenario give the same result:
 *   - requestAnimationFrame callbacks run from a timer (a hidden tab gets no frames)
 *   - ResizeObserver is a small polling stand-in (the real one needs rendering)
 *   - confirm() answers yes; fetches in flight are counted; script errors are collected
 * window.__parity.flush() runs everything that is pending right now. */
(function () {
  "use strict";
  var frames = new Map(), nextId = 1, timer = 0, observers = [];

  function runFrames() {
    timer = 0;
    var batch = Array.from(frames.values());
    frames.clear();
    batch.forEach(function (cb) { try { cb(performance.now()); } catch (e) { setTimeout(function () { throw e; }, 0); } });
  }
  window.requestAnimationFrame = function (cb) {
    var id = nextId++;
    frames.set(id, cb);
    if (!timer) timer = setTimeout(runFrames, 16);
    return id;
  };
  window.cancelAnimationFrame = function (id) { frames.delete(id); };

  function FakeResizeObserver(callback) { this.callback = callback; this.sizes = new Map(); observers.push(this); }
  FakeResizeObserver.prototype.observe = function (el) { this.sizes.set(el, ""); };          // "" -> reported on the next check
  FakeResizeObserver.prototype.unobserve = function (el) { this.sizes.delete(el); };
  FakeResizeObserver.prototype.disconnect = function () { this.sizes.clear(); };
  function checkSizes() {
    observers.forEach(function (ro) {
      var changed = [];
      ro.sizes.forEach(function (size, el) {
        var now = el.offsetWidth + "x" + el.offsetHeight;
        if (now !== size) { ro.sizes.set(el, now); changed.push({ target: el }); }
      });
      if (changed.length) ro.callback(changed, ro);
    });
  }
  window.ResizeObserver = FakeResizeObserver;
  setInterval(checkSizes, 50);

  var pending = 0, realFetch = window.fetch;
  window.fetch = function () {
    pending++;
    var done = function () { pending--; };
    var p = realFetch.apply(this, arguments);
    p.then(done, done);
    return p;
  };
  window.confirm = function () { return true; };

  var errors = [];
  window.addEventListener("error", function (e) { errors.push(String(e.message || e)); });
  window.addEventListener("unhandledrejection", function (e) { errors.push("rejection: " + String((e.reason && e.reason.message) || e.reason)); });

  window.__parity = {
    errors: errors,
    pending: function () { return pending; },
    flush: function () {
      checkSizes();
      if (timer) { clearTimeout(timer); timer = 0; }
      runFrames();
    }
  };
})();
