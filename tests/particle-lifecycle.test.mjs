import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Runs the real manager with isolated actor/settings doubles, never GSettings or
// a live Shell. The ease double models Shell 45–50's inline callback(true) when
// an implicit transition is skipped; ordinary transitions finish explicitly.
// Run with Node >=16: node tests/particle-lifecycle.test.mjs
// The synchronous runner avoids node:test (only added in 16.17) and subprocesses.
// For a baseline comparison, pipe git show into PARTICLE_MANAGER_SOURCE=- and
// set PARTICLE_TEST_FILTER to select the focused regression test.
const tests = [];
function test(name, run) { tests.push({ name, run }); }
const sourcePath = process.env.PARTICLE_MANAGER_SOURCE;
const source = readFileSync(
  sourcePath === "-" ? 0 : sourcePath ?? new URL("../src/lib/ParticleManager.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function fixture({ enabled = true, mapped = true, skip = false } = {}) {
  class Signals {
    handlers = new Map();
    nextId = 1;
    connect(name, callback) {
      const id = this.nextId++;
      this.handlers.set(id, { name, callback });
      return id;
    }
    disconnect(id) {
      assert(this.handlers.delete(id), "handler must have exactly one owner");
    }
    emit(name) {
      for (const [id, handler] of [...this.handlers]) {
        if (handler.name === name && this.handlers.has(id)) {
          handler.callback(this);
        }
      }
    }
  }

  const animationSettings = new Signals();
  animationSettings.enable_animations = enabled;
  animationSettings.slow_down_factor = 1;
  const settings = { active: true, get_boolean() { return this.active; } };
  const calls = [];
  let skipTransitions = skip;
  let depth = 0;
  let maximumDepth = 0;
  let beforeSynchronousCompletion = null;

  class Widget extends Signals {
    x = 0;
    y = 0;
    visible = false;
    show_on_set_parent = true;
    parent = null;
    mapped = false;
    children = [];
    transitions = new Map();
    nativeDestroyed = false;
    destroying = false;
    constructor(props = {}) {
      super();
      Object.assign(this, props);
    }
    alive() {
      assert(!this.nativeDestroyed, "native use after destruction");
      assert(!this.destroying, "native use from a destroying actor's handler");
    }
    disconnect(id) { this.alive(); super.disconnect(id); }
    show() {
      this.alive();
      this.visible = true;
      if (this.parent?.mapped) this.setMapped(true);
    }
    add_child(child) {
      this.alive();
      this.children.push(child);
      child.parent = this;
      // Clutter's default show-on-set-parent makes newly added actors visible.
      if (child.show_on_set_parent) child.show();
    }
    setMapped(value) {
      this.alive();
      if (this.mapped !== value) {
        this.mapped = value;
        this.emit("notify::mapped");
      }
    }
    get_transition(name) { this.alive(); return this.transitions.get(name) ?? null; }
    remove_transition(name) {
      this.alive();
      const transition = this.transitions.get(name);
      this.transitions.delete(name);
      transition?.onStopped(false);
    }
    remove_all_transitions() {
      this.alive();
      for (const name of [...this.transitions.keys()]) this.remove_transition(name);
    }
    ease(params) {
      this.alive();
      depth++;
      maximumDepth = Math.max(maximumDepth, depth);
      try {
        assert(depth < 30, "recursive synchronous completion");
        calls.push({ actor: this, ...params });
        // Mirrors native millisecond conversion and Shell's animation policy.
        const duration = animationSettings.enable_animations
          ? Math.floor(params.duration * animationSettings.slow_down_factor)
          : 0;
        this.remove_transition("y");
        if (skipTransitions || !this.mapped || duration === 0) {
          this.y = params.y;
          beforeSynchronousCompletion?.(this);
          params.onStopped(true);
        } else {
          this.transitions.set("y", params);
        }
      } finally {
        depth--;
      }
    }
    finish() {
      this.alive();
      const transition = this.transitions.get("y");
      assert(transition, "expected a running transition");
      this.transitions.delete("y");
      this.y = transition.y;
      transition.onStopped(true);
    }
    destroy() {
      this.alive();
      this.remove_all_transitions();
      this.destroying = true;
      this.emit("destroy");
      for (const child of this.children) {
        if (!child.nativeDestroyed) child.destroy();
      }
      this.nativeDestroyed = true;
      // GObject owns connections on itself and clears them on disposal.
      this.handlers.clear();
    }
  }
  class Label extends Widget {}

  const math = Object.create(Math);
  let seed = 17;
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const context = {
    exports: {},
    Math: math,
    require(name) {
      if (name === "gi://St") return { default: {
        Widget, Label, Settings: { get: () => animationSettings },
      } };
      if (name === "gi://Clutter") return { default: { AnimationMode: { LINEAR: 1 } } };
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
    // Any attempted timer is a test failure, rather than a deferred busy loop.
    setTimeout() { assert.fail("particle timers are forbidden"); },
    setInterval() { assert.fail("particle polling is forbidden"); },
  };
  vm.runInNewContext(compiled, context);
  const manager = new context.exports.ParticleManager(settings);
  function monitor(isMapped = mapped) {
    const actor = new Widget({ mapped: isMapped, _weatherDestroyed: false });
    const record = { actor, monitor: { width: 1920, height: 1080 } };
    actor.connect("destroy", () => {
      actor._weatherDestroyed = true;
      record.actor = null;
    });
    return record;
  }
  const layer = monitor();
  const target = {
    monitorActor: layer, type: "snow", count: 5, size: 4,
    speed: 1, emoji: null, color: "white",
  };
  return {
    manager, settings, animationSettings, layer, target, monitor, calls, Label,
    createManager() { return new context.exports.ParticleManager(settings); },
    start() { manager.reconcile([layer], [target]); },
    particles() { return [...manager.monitorStates.get(layer).particles]; },
    enable(value) {
      animationSettings.enable_animations = value;
      animationSettings.emit("notify::enable-animations");
    },
    scale(value) {
      animationSettings.slow_down_factor = value;
      animationSettings.emit("notify::slow-down-factor");
    },
    skip(value) { skipTransitions = value; },
    beforeSynchronousCompletion(callback) { beforeSynchronousCompletion = callback; },
    depth() { return maximumDepth; },
  };
}

function positions(particles) { return particles.map(({ x, y }) => [x, y]); }

test("show-on-set-parent maps new particles without starting duplicate transitions", () => {
  const f = fixture();
  f.start();
  const particles = f.particles();
  assert(particles.every(p => p.show_on_set_parent && p.visible && p.mapped));
  assert.equal(f.calls.length, 5, "early mapping must wait for collection membership");
  particles.forEach(p => p.emit("notify::mapped"));
  f.enable(true);
  f.scale(1);
  assert.equal(f.calls.length, 5, "existing transitions must survive duplicate notifications");
  f.manager.destroy();
});

test("synchronous successful completion is bounded and resumes on availability", () => {
  const f = fixture({ skip: true });
  f.start();
  assert.equal(f.particles().length, 5);
  assert.equal(f.depth(), 1);
  assert.equal(f.calls.length, 10, "at most two attempts per particle");
  assert(f.particles().every(p => !p.get_transition("y")));
  f.skip(false);
  f.enable(false);
  f.enable(true);
  assert(f.particles().every(p => p.get_transition("y")));
  f.manager.destroy();
});

test("disabled animations at creation preserve random positions and resume", () => {
  const f = fixture({ enabled: false });
  f.start();
  const particles = f.particles();
  const initial = positions(particles);
  assert.equal(f.calls.length, 0);
  assert(particles.every(p => p.y >= -20 && p.y < 1060));
  assert(new Set(particles.map(p => p.y)).size > 1);
  f.enable(true);
  assert.deepEqual(positions(particles), initial);
  assert(particles.every(p => p.get_transition("y")));
  const before = f.calls.length;
  particles.forEach(p => p.emit("notify::mapped"));
  assert.equal(f.calls.length, before);
  f.manager.destroy();
});

test("disable cancels only y, re-enable resumes from current positions and speed", () => {
  const f = fixture();
  f.start();
  const particles = f.particles();
  particles.forEach((p, i) => { p.y = 100 + i * 120; });
  particles[0].transitions.set("opacity", { onStopped() {} });
  const initial = positions(particles);
  const before = f.calls.length;
  f.enable(false);
  assert.equal(f.calls.length, before, "cancellation must not restart");
  assert(particles[0].get_transition("opacity"));
  assert(particles.every(p => !p.get_transition("y")));
  f.manager.retimeSpeed(3);
  assert.equal(f.calls.length, before);
  f.enable(true);
  assert.deepEqual(positions(particles), initial);
  for (const p of particles) {
    const t = p.get_transition("y");
    const fraction = (1100 - p.y) / 1120;
    assert(t.duration >= 500 * fraction && t.duration < 1000 * fraction);
  }
  const resumed = f.calls.length;
  f.enable(true);
  assert.equal(f.calls.length, resumed, "notifications must not duplicate transitions");
  f.manager.destroy();
});

test("unmapped creation and child remapping resume independently of parent notification order", () => {
  const f = fixture({ mapped: false });
  f.start();
  const particles = f.particles();
  const initial = positions(particles);
  assert.equal(f.calls.length, 0);
  f.layer.actor.setMapped(true); // Parent first: children are still unmapped.
  assert.equal(f.calls.length, 0);
  for (const p of particles) p.setMapped(true);
  assert.deepEqual(positions(particles), initial);
  assert(particles.every(p => p.get_transition("y")));
  for (const p of particles) p.setMapped(false); // Children first on unmap.
  f.layer.actor.setMapped(false);
  assert(particles.every(p => !p.get_transition("y")));
  f.enable(false);
  f.layer.actor.setMapped(true);
  for (const p of particles) p.setMapped(true);
  assert(particles.every(p => !p.get_transition("y")));
  f.enable(true);
  assert.deepEqual(positions(particles), initial);
  assert(particles.every(p => p.get_transition("y")));
  f.manager.destroy();
});

test("ordinary completion restarts exactly once and speed retiming preserves positions", () => {
  const f = fixture();
  f.start();
  const particles = f.particles();
  const initial = positions(particles);
  f.manager.retimeSpeed(0);
  assert.deepEqual(positions(particles), initial);
  assert.equal(f.calls.length, 10);
  const before = f.calls.length;
  particles[0].finish();
  assert.equal(f.calls.length, before + 1);
  assert.equal(particles[0].y, -20);
  assert.equal(particles[0].get_transition("y").mode, 1);
  assert(particles[0].get_transition("y").duration >= 3500);
  f.manager.destroy();
});

test("submillisecond successful tail retries a full cycle without recursion or stranding", () => {
  const f = fixture();
  f.start();
  f.particles().forEach(p => { p.y = 1099.9; });
  const before = f.calls.length;
  f.manager.retimeSpeed(3);
  assert.equal(f.calls.length, before + 10);
  assert.equal(f.depth(), 1);
  assert(f.particles().every(p => p.get_transition("y") && p.y === -20));
  f.manager.destroy();
});

test("zero or tiny slowdown cannot spin and a timing notification resumes particles", () => {
  const f = fixture();
  f.start();
  const initial = positions(f.particles());
  f.scale(0);
  assert(f.particles().every(p => !p.get_transition("y")));
  assert.deepEqual(positions(f.particles()), initial);
  f.scale(0.000001); // Even a full cycle converts to zero native milliseconds.
  assert.equal(f.depth(), 1);
  assert(f.particles().every(p => !p.get_transition("y")));
  f.scale(1);
  assert(f.particles().every(p => p.get_transition("y")));
  f.manager.destroy();
});

test("paused profile replacement and count changes preserve survivors and retire handlers", () => {
  const f = fixture();
  f.start();
  const old = f.particles();
  const initial = positions(old);
  const stale = old.map(p => p.get_transition("y"));
  f.enable(false);
  const next = { ...f.target, type: "rain", speed: 2, emoji: "🌢", size: 12, count: 8 };
  f.manager.reconcile([f.layer], [next]);
  const replaced = f.particles();
  assert.equal(replaced.length, 8);
  assert(replaced.every(p => p instanceof f.Label));
  assert(initial.every(([x, y]) => replaced.some(p => p.x === x && p.y === y)));
  assert(old.every(p => p.nativeDestroyed));
  assert(old.every(p => ![...p.handlers.values()].some(h => h.name === "notify::mapped")));
  const before = f.calls.length;
  stale.forEach(t => t.onStopped(true));
  assert.equal(f.calls.length, before);
  f.manager.reconcile([f.layer], [{ ...next, count: 5 }]);
  assert.equal(f.particles().length, 5);
  f.enable(true);
  assert(f.particles().every(p => p.get_transition("y")));
  f.manager.destroy();
});

test("blocked and retired monitors cannot resume on global animation notifications", () => {
  const f = fixture();
  const second = f.monitor();
  f.manager.reconcile([f.layer, second], [f.target, { ...f.target, monitorActor: second }]);
  f.manager.reconcile([f.layer, second], [{ ...f.target, monitorActor: second }]);
  assert.equal(f.particles().length, 0);
  f.enable(false);
  f.enable(true);
  assert.equal(f.particles().length, 0);
  assert(f.manager.monitorStates.get(second).particles.every(p => p.get_transition("y")));
  f.manager.reconcile([f.layer], [f.target]);
  assert.equal(f.particles().length, 5);
  assert(!f.manager.monitorStates.has(second));
  f.manager.destroy();
});

test("particle destruction needs no explicit disconnect and cannot later resume", () => {
  const f = fixture();
  f.start();
  const particle = f.particles()[0];
  const staleTransition = particle.get_transition("y");
  const mappedCallback = [...particle.handlers.values()].find(h => h.name === "notify::mapped").callback;
  particle.disconnect = () => assert.fail("particle destruction must not explicitly disconnect");
  particle.destroy();
  assert(particle._weatherDestroyed);
  assert(!f.particles().includes(particle));
  assert.equal(particle.handlers.size, 0);
  const before = f.calls.length;
  particle.emit("notify::mapped");
  mappedCallback(particle); // Even a retained stale callback must be harmless.
  staleTransition.onStopped(true);
  f.enable(false);
  f.enable(true);
  assert.equal(f.calls.length, before + 4, "only surviving particles resume");
  assert(!f.calls.slice(before).some(call => call.actor === particle));
  f.manager.destroy();
});

test("teardown during synchronous ease and stale successful completion are harmless", () => {
  const f = fixture({ skip: true });
  f.beforeSynchronousCompletion(() => { f.manager.destroy(); });
  f.start();
  assert.equal(f.manager.monitorStates.size, 0);
  assert.equal(f.depth(), 1);
  f.calls.forEach(t => t.onStopped(true));
  f.manager.destroy();
});

for (const shellFirst of [false, true]) {
  test(`teardown disconnects availability signals (${shellFirst ? "Shell" : "manager"} first)`, () => {
    const f = fixture();
    f.start();
    const particles = f.particles();
    const stale = particles.map(p => p.get_transition("y"));
    if (shellFirst) f.layer.actor.destroy();
    f.manager.destroy();
    f.manager.destroy();
    assert.equal(f.animationSettings.handlers.size, 0);
    assert.equal(f.manager.monitorStates.size, 0);
    const before = f.calls.length;
    stale.forEach(t => t.onStopped(true));
    particles.forEach(p => p.emit("notify::mapped"));
    f.enable(false);
    f.enable(true);
    f.scale(2);
    assert.equal(f.calls.length, before);
    assert(particles.every(p => p.nativeDestroyed));
  });
}

test("repeated manager enable/disable releases singleton and actor signal ownership", () => {
  const f = fixture();
  f.manager.destroy();
  for (let cycle = 0; cycle < 10; cycle++) {
    const manager = f.createManager();
    assert.equal(f.animationSettings.handlers.size, 2);
    manager.reconcile([f.layer], [f.target]);
    const particles = [...manager.monitorStates.get(f.layer).particles];
    f.enable(false);
    f.enable(true);
    assert(particles.every(p => p.get_transition("y")));
    manager.destroy();
    assert.equal(f.animationSettings.handlers.size, 0);
    assert.equal(f.layer.actor.handlers.size, 1, "only the layer's own destroy handler remains");
    assert(particles.every(p => ![...p.handlers.values()].some(h => h.name === "notify::mapped")));
    const before = f.calls.length;
    f.enable(false);
    f.enable(true);
    particles.forEach(p => p.emit("notify::mapped"));
    assert.equal(f.calls.length, before);
  }
});

const selected = tests.filter(t => !process.env.PARTICLE_TEST_FILTER || t.name.includes(process.env.PARTICLE_TEST_FILTER));
assert(selected.length > 0, "test filter must select at least one test");
let failures = 0;
for (const { name, run } of selected) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}
console.log(`${selected.length - failures}/${selected.length} isolated tests passed`);
if (failures) process.exitCode = 1;
