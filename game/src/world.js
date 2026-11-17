// Emberfall's rules and state, with no drawing and no browser in it: the ship, bullets, the
// Ashen swarm, embers, waves and the upgrade shop. step() advances one fixed step and returns
// what happened as bit flags, and drops visual effects into world.fx for the caller to play.
// Nothing here allocates after createWorld returns.

import { BULLET, EMBER, ENEMY, FIELD, FINAL_WAVE, HERALD_WAVE, ORB, PLAYER, SHOP_DELAY, SHOP_OFFERS, STEP, UPGRADES, WAVE } from './config.js';
import { pick, shuffle } from './random.js';

export const KIND = { drifter: 'drifter', darter: 'darter', spinner: 'spinner', mite: 'mite', splitter: 'splitter', herald: 'herald', maw: 'maw' };

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_PICKUP = 8;
export const EVENT_HURT = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_BOSS = 64;
export const EVENT_WIN = 128;
export const EVENT_OVER = 256;
export const EVENT_DASH = 512;
export const EVENT_BUY = 1024;
export const EVENT_DENIED = 2048;
export const EVENT_WAVE_START = 4096;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function createWorld(random) {
  const player = { x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, hull: PLAYER.hull, fireTimer: 0, dashTimer: 0, dashCooldown: 0, invulnerable: 0, trailTimer: 0 };
  const stats = { speed: PLAYER.speed, fireInterval: PLAYER.fireInterval, bulletDamage: PLAYER.bulletDamage, bulletSpeed: PLAYER.bulletSpeed, shots: 1, pierce: 0, dashCooldown: PLAYER.dashCooldown, pickupRadius: PLAYER.pickupRadius, maxHull: PLAYER.hull };
  const bullets = [];
  for (let i = 0; i < BULLET.max; i += 1) bullets.push({ active: false, id: 0, x: 0, y: 0, vx: 0, vy: 0, damage: 1, pierce: 0, life: 0 });
  const orbs = [];
  for (let i = 0; i < ORB.max; i += 1) orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const enemies = [];
  for (let i = 0; i < 48; i += 1) enemies.push({ active: false, kind: 'drifter', x: 0, y: 0, vx: 0, vy: 0, hull: 1, maxHull: 1, radius: 16, speed: 60, state: 0, t: 0, fireTimer: 0, score: 0, embers: 0, contact: 1, color: '#fff', lastBullet: -1, hitCooldown: 0, flash: 0 });
  const embers = [];
  for (let i = 0; i < 96; i += 1) embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, life: 0 });
  const fx = [];
  let bulletId = 1;

  const state = {
    player, stats, bullets, orbs, enemies, embers, fx,
    score: 0, embersHeld: 0, embersCollected: 0, kills: 0, wave: 0, time: 0,
    queue: [], spawnTimer: 0, intermission: 0, shopOpen: false, offers: [], bought: [],
    waveActive: false, demo: false, boss: null, won: false, over: false,
  };

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.hull = PLAYER.hull;
    player.fireTimer = 0;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnerable = 0;
    stats.speed = PLAYER.speed;
    stats.fireInterval = PLAYER.fireInterval;
    stats.bulletDamage = PLAYER.bulletDamage;
    stats.bulletSpeed = PLAYER.bulletSpeed;
    stats.shots = 1;
    stats.pierce = 0;
    stats.dashCooldown = PLAYER.dashCooldown;
    stats.pickupRadius = PLAYER.pickupRadius;
    stats.maxHull = PLAYER.hull;
    for (const b of bullets) b.active = false;
    for (const o of orbs) o.active = false;
    for (const e of enemies) e.active = false;
    for (const m of embers) m.active = false;
    fx.length = 0;
    state.score = 0;
    state.embersHeld = 0;
    state.embersCollected = 0;
    state.kills = 0;
    state.wave = 0;
    state.time = 0;
    state.queue = [];
    state.spawnTimer = 0;
    state.intermission = 0;
    state.shopOpen = false;
    state.offers = [];
    state.bought = [];
    state.waveActive = false;
    state.boss = null;
    state.won = false;
    state.over = false;
  }

  function freeBullet() {
    for (const b of bullets) if (!b.active) return b;
    return null;
  }

  function freeOrb() {
    for (const o of orbs) if (!o.active) return o;
    return null;
  }

  function freeEnemy() {
    for (const e of enemies) if (!e.active) return e;
    return null;
  }

  function freeEmber() {
    for (const m of embers) if (!m.active) return m;
    return null;
  }

  function spawnEnemy(kind, x, y) {
    const e = freeEnemy();
    if (!e) return null;
    const def = ENEMY[kind];
    e.active = true;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.hull = def.hull;
    e.maxHull = def.hull;
    e.radius = def.radius;
    e.speed = def.speed * (0.9 + random() * 0.2);
    e.state = 0;
    e.t = random() * 2;
    e.fireTimer = 1 + random() * 1.5;
    e.score = def.score;
    e.embers = def.embers;
    e.contact = def.contact;
    e.color = def.color;
    e.lastBullet = -1;
    e.hitCooldown = 0;
    e.flash = 0;
    return e;
  }

  function spawnAtEdge(kind) {
    const side = Math.floor(random() * 4);
    const margin = 40;
    let x;
    let y;
    if (side === 0) { x = random() * FIELD.width; y = -margin; } else if (side === 1) { x = FIELD.width + margin; y = random() * FIELD.height; } else if (side === 2) { x = random() * FIELD.width; y = FIELD.height + margin; } else { x = -margin; y = random() * FIELD.height; }
    return spawnEnemy(kind, x, y);
  }

  function dropEmbers(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const m = freeEmber();
      if (!m) return;
      const angle = random() * TAU;
      const speed = 60 + random() * 140;
      m.active = true;
      m.x = x;
      m.y = y;
      m.vx = Math.cos(angle) * speed;
      m.vy = Math.sin(angle) * speed;
      m.value = EMBER.value;
      m.life = EMBER.life;
    }
  }

  function burst(x, y, color, count, speed) {
    fx.push({ kind: 'burst', x, y, color, count, speed });
  }

  function floatText(x, y, value, color, size) {
    fx.push({ kind: 'text', x, y, value, color, size: size || 18 });
  }

  /** Which kinds a wave may draw from, and how many of each it wants. */
  function buildQueue(wave) {
    const queue = [];
    if (wave === FINAL_WAVE) {
      queue.push(KIND.maw);
      for (let i = 0; i < 8; i += 1) queue.push(KIND.drifter);
      for (let i = 0; i < 4; i += 1) queue.push(KIND.spinner);
      return shuffle(random, queue);
    }
    if (wave === HERALD_WAVE) {
      queue.push(KIND.herald);
      for (let i = 0; i < 6; i += 1) queue.push(KIND.drifter);
      for (let i = 0; i < 4; i += 1) queue.push(KIND.darter);
      return shuffle(random, queue);
    }
    const pool = [KIND.drifter, KIND.drifter, KIND.drifter];
    if (wave >= WAVE.unlock.darter) pool.push(KIND.darter, KIND.darter);
    if (wave >= WAVE.unlock.spinner) pool.push(KIND.spinner);
    if (wave >= WAVE.unlock.splitter) pool.push(KIND.splitter);
    const count = WAVE.baseCount + WAVE.perWave * (wave - 1);
    for (let i = 0; i < count; i += 1) queue.push(pick(random, pool));
    return shuffle(random, queue);
  }

  function startWave(wave) {
    state.wave = wave;
    state.queue = buildQueue(wave);
    state.spawnTimer = 0.5;
    state.waveActive = true;
    state.shopOpen = false;
    state.intermission = 0;
    const bossKind = wave === FINAL_WAVE ? KIND.maw : wave === HERALD_WAVE ? KIND.herald : null;
    if (bossKind) {
      state.boss = null;
      return EVENT_WAVE_START | EVENT_BOSS;
    }
    return EVENT_WAVE_START;
  }

  function openShop() {
    state.shopOpen = true;
    state.waveActive = false;
    const pool = shuffle(random, UPGRADES);
    state.offers = pool.slice(0, SHOP_OFFERS);
    state.bought = state.offers.map(() => false);
  }

  function buy(index) {
    if (!state.shopOpen || index < 0 || index >= state.offers.length || state.bought[index]) return EVENT_DENIED;
    const offer = state.offers[index];
    if (state.embersHeld < offer.cost) return EVENT_DENIED;
    state.embersHeld -= offer.cost;
    offer.apply(stats, player);
    state.bought[index] = true;
    floatText(player.x, player.y - 30, offer.name, '#7bd88a', 20);
    return EVENT_BUY;
  }

  function aliveEnemies() {
    let n = 0;
    for (const e of enemies) if (e.active) n += 1;
    return n;
  }

  function nearestEnemy(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!e.active) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function fireBullets() {
    const n = stats.shots;
    const spread = 0.1;
    for (let i = 0; i < n; i += 1) {
      const b = freeBullet();
      if (!b) break;
      const offset = (i - (n - 1) / 2) * spread;
      const angle = player.angle + offset;
      const nx = player.x + Math.cos(player.angle) * (PLAYER.radius + 6);
      const ny = player.y + Math.sin(player.angle) * (PLAYER.radius + 6);
      b.active = true;
      b.id = bulletId;
      bulletId += 1;
      b.x = nx;
      b.y = ny;
      b.vx = Math.cos(angle) * stats.bulletSpeed;
      b.vy = Math.sin(angle) * stats.bulletSpeed;
      b.damage = stats.bulletDamage;
      b.pierce = stats.pierce;
      b.life = BULLET.life;
    }
    return EVENT_SHOOT;
  }

  function killEnemy(e) {
    e.active = false;
    state.kills += 1;
    state.score += e.score;
    dropEmbers(e.x, e.y, e.embers);
    burst(e.x, e.y, e.color, e.kind === KIND.maw || e.kind === KIND.herald ? 40 : 16, e.kind === KIND.maw ? 380 : 260);
    floatText(e.x, e.y - 10, `+${e.score}`, '#ffd166', 16);
    if (e.kind === KIND.splitter) {
      for (let i = 0; i < 2; i += 1) {
        const mite = spawnEnemy(KIND.mite, e.x + (random() - 0.5) * 30, e.y + (random() - 0.5) * 30);
        if (mite) { mite.vx = (random() - 0.5) * 200; mite.vy = (random() - 0.5) * 200; }
      }
    }
    if (e.kind === KIND.maw) {
      state.won = true;
      state.waveActive = false;
      return EVENT_KILL | EVENT_WIN;
    }
    if (e === state.boss) state.boss = null;
    return EVENT_KILL;
  }

  function hurtPlayer(amount) {
    if (player.invulnerable > 0 || player.dashTimer > 0 || state.over || state.won) return 0;
    player.hull -= amount;
    player.invulnerable = PLAYER.invulnerable;
    burst(player.x, player.y, '#4cc9f0', 18, 300);
    fx.push({ kind: 'shake', amount: 9 });
    if (player.hull <= 0) {
      state.over = true;
      state.waveActive = false;
      burst(player.x, player.y, '#4cc9f0', 46, 420);
      fx.push({ kind: 'shake', amount: 16 });
      return EVENT_HURT | EVENT_OVER;
    }
    return EVENT_HURT;
  }

  function fireOrb(e, angle) {
    const o = freeOrb();
    if (!o) return;
    o.active = true;
    o.x = e.x + Math.cos(angle) * (e.radius + 8);
    o.y = e.y + Math.sin(angle) * (e.radius + 8);
    o.vx = Math.cos(angle) * ENEMY.spinner.orbSpeed;
    o.vy = Math.sin(angle) * ENEMY.spinner.orbSpeed;
    o.life = ORB.life;
  }

  function bossVolley(e, count, speed) {
    const base = random() * TAU;
    for (let i = 0; i < count; i += 1) fireOrbAt(e, base + (i / count) * TAU, speed);
  }

  function fireOrbAt(e, angle, speed) {
    const o = freeOrb();
    if (!o) return;
    o.active = true;
    o.x = e.x + Math.cos(angle) * (e.radius + 8);
    o.y = e.y + Math.sin(angle) * (e.radius + 8);
    o.vx = Math.cos(angle) * speed;
    o.vy = Math.sin(angle) * speed;
    o.life = ORB.life;
  }

  /** One fixed step of the live game. `input` is {steerX, steerY, aimX, aimY, firing, dash}. */
  function step(dt, input) {
    let events = 0;
    state.time += dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.fireTimer > 0) player.fireTimer -= dt;

    // Aim: the mouse when it has moved, else the nearest enemy, else straight up.
    const aim = input;
    if (aim.aimSeen) player.angle = angleTo(player.x, player.y, aim.aimX, aim.aimY);
    else {
      const target = nearestEnemy(player.x, player.y);
      if (target) player.angle = angleTo(player.x, player.y, target.x, target.y);
    }

    // Dash: a burst of speed and a blink of invulnerability.
    if (aim.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      const dx = aim.steerX;
      const dy = aim.steerY;
      const len = Math.hypot(dx, dy);
      const dashAngle = len > 0 ? Math.atan2(dy, dx) : player.angle;
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = stats.dashCooldown;
      player.vx = Math.cos(dashAngle) * PLAYER.dashSpeed;
      player.vy = Math.sin(dashAngle) * PLAYER.dashSpeed;
      player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.08);
      events |= EVENT_DASH;
    }
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
    } else {
      const len = Math.hypot(aim.steerX, aim.steerY) || 1;
      const nx = aim.steerX / len;
      const ny = aim.steerY / len;
      const moving = aim.steerX !== 0 || aim.steerY !== 0;
      player.vx = moving ? nx * stats.speed : 0;
      player.vy = moving ? ny * stats.speed : 0;
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));

    // Thruster trail while moving.
    player.trailTimer -= dt;
    if ((player.vx !== 0 || player.vy !== 0) && player.trailTimer <= 0) {
      player.trailTimer = PLAYER.thrusterTrail;
      const back = player.angle + Math.PI;
      fx.push({ kind: 'trail', x: player.x + Math.cos(back) * PLAYER.radius, y: player.y + Math.sin(back) * PLAYER.radius, color: '#4cc9f0' });
    }

    // Fire.
    if (aim.firing && player.fireTimer <= 0 && !state.over && !state.won) {
      events |= fireBullets();
      player.fireTimer = stats.fireInterval;
    }

    // Spawn the wave's queue, one at a time, up to the alive cap.
    if (state.waveActive && state.queue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && aliveEnemies() < WAVE.maxAlive) {
        const kind = state.queue.shift();
        const e = spawnAtEdge(kind);
        if (e && (kind === KIND.herald || kind === KIND.maw)) state.boss = e;
        state.spawnTimer = Math.max(WAVE.spawnIntervalMin, WAVE.spawnInterval - state.wave * 0.04);
      }
    }

    // Enemies: think, move, shoot.
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.hitCooldown > 0) e.hitCooldown -= dt;
      e.t += dt;
      const d = Math.hypot(player.x - e.x, player.y - e.y) || 1;
      const toward = angleTo(e.x, e.y, player.x, player.y);
      if (e.kind === KIND.drifter || e.kind === KIND.mite || e.kind === KIND.splitter) {
        e.vx = Math.cos(toward) * e.speed;
        e.vy = Math.sin(toward) * e.speed;
      } else if (e.kind === KIND.darter) {
        // state 0: stalk. state 1: wind up, telegraphing. state 2: lunge. state 3: recover.
        if (e.state === 0) {
          e.vx = Math.cos(toward) * e.speed;
          e.vy = Math.sin(toward) * e.speed;
          if (d < 280) { e.state = 1; e.t = 0; }
        } else if (e.state === 1) {
          e.vx = 0;
          e.vy = 0;
          if (e.t >= ENEMY.darter.lungeWindup) {
            e.state = 2;
            e.t = 0;
            const lunge = angleTo(e.x, e.y, player.x, player.y);
            e.vx = Math.cos(lunge) * ENEMY.darter.lungeSpeed;
            e.vy = Math.sin(lunge) * ENEMY.darter.lungeSpeed;
          }
        } else if (e.state === 2) {
          if (e.t >= 0.42) { e.state = 3; e.t = 0; }
        } else {
          e.vx *= 0.9;
          e.vy *= 0.9;
          if (e.t >= ENEMY.darter.lungeCooldown) { e.state = 0; e.t = 0; }
        }
      } else if (e.kind === KIND.spinner) {
        const want = ENEMY.spinner.keepDistance;
        const radial = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
        const tangent = Math.sin(e.t * 0.7) > 0 ? 1 : -1;
        e.vx = Math.cos(toward) * radial * e.speed + Math.cos(toward + Math.PI / 2) * tangent * e.speed * 0.5;
        e.vy = Math.sin(toward) * radial * e.speed + Math.sin(toward + Math.PI / 2) * tangent * e.speed * 0.5;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = ENEMY.spinner.fireInterval;
          fireOrb(e, toward);
        }
      } else if (e.kind === KIND.herald || e.kind === KIND.maw) {
        const bossSpeed = e.speed * (1 + 0.04 * (state.wave - HERALD_WAVE));
        e.vx = Math.cos(toward) * bossSpeed;
        e.vy = Math.sin(toward) * bossSpeed;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = e.kind === KIND.maw ? 2.2 : 3.0;
          bossVolley(e, e.kind === KIND.maw ? 12 : 8, 200);
          if (e.kind === KIND.maw && random() < 0.5) {
            for (let i = 0; i < 2; i += 1) spawnEnemy(KIND.mite, e.x + (random() - 0.5) * 60, e.y + (random() - 0.5) * 60);
          }
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Keep them inside the field once they have entered it.
      if (e.x < -80 || e.x > FIELD.width + 80 || e.y < -80 || e.y > FIELD.height + 80) {
        e.x = Math.min(FIELD.width + 60, Math.max(-60, e.x));
        e.y = Math.min(FIELD.height + 60, Math.max(-60, e.y));
      }
    }

    // Gentle separation so the swarm does not stack on one point.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / d * 0.5;
          a.x -= dx * push * 0.5;
          a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5;
          b.y += dy * push * 0.5;
        }
      }
    }

    // Bullets: move, expire, hit enemies.
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        if (e.lastBullet === b.id && e.hitCooldown > 0) continue;
        const rr = e.radius + 5;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          e.hull -= b.damage;
          e.flash = 0.09;
          e.hitCooldown = 0.08;
          e.lastBullet = b.id;
          burst(b.x, b.y, '#ffd166', 4, 140);
          events |= EVENT_HIT;
          if (e.hull <= 0) {
            events |= killEnemy(e);
          } else if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            b.active = false;
          }
          break;
        }
      }
    }

    // Enemy orbs: move, expire, hit the player.
    for (const o of orbs) {
      if (!o.active) continue;
      o.life -= dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.life <= 0 || o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20) {
        o.active = false;
        continue;
      }
      const rr = PLAYER.radius + ENEMY.spinner.orbRadius - 2;
      if (dist2(o.x, o.y, player.x, player.y) < rr * rr) {
        o.active = false;
        events |= hurtPlayer(1);
      }
    }

    // Contact: an enemy touching the ship hurts it and (unless it is a boss) dies on the hull.
    for (const e of enemies) {
      if (!e.active || state.over || state.won) continue;
      const rr = e.radius + PLAYER.radius - 2;
      if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
        events |= hurtPlayer(e.contact);
        if (e.kind !== KIND.herald && e.kind !== KIND.maw && !state.over) {
          e.active = false;
          burst(e.x, e.y, e.color, 12, 220);
        } else {
          // Shove the boss away so it does not sit on the ship.
          const away = angleTo(player.x, player.y, e.x, e.y);
          e.x = player.x + Math.cos(away) * (rr + 4);
          e.y = player.y + Math.sin(away) * (rr + 4);
        }
      }
    }

    // Embers: drift, get magnetised, get collected.
    for (const m of embers) {
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0) { m.active = false; continue; }
      const d2 = dist2(m.x, m.y, player.x, player.y);
      const pr = stats.pickupRadius;
      if (d2 < pr * pr) {
        const d = Math.sqrt(d2) || 1;
        const pull = EMBER.magnetSpeed * (1 - d / (pr * 1.6));
        m.vx += ((player.x - m.x) / d) * pull * dt * 6;
        m.vy += ((player.y - m.y) / d) * pull * dt * 6;
      } else {
        m.vx *= 0.98;
        m.vy *= 0.98;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const cr = PLAYER.radius + EMBER.radius;
      if (d2 < cr * cr) {
        m.active = false;
        state.embersHeld += m.value;
        state.embersCollected += m.value;
        events |= EVENT_PICKUP;
      }
    }

    // Wave cleared: queue empty, nobody alive, and the player still standing.
    if (state.waveActive && state.queue.length === 0 && aliveEnemies() === 0 && !state.over && !state.won) {
      state.waveActive = false;
      const bonus = WAVE.clearBonus + WAVE.clearBonusPerHull * player.hull;
      state.score += bonus;
      // Clearing a wave patches the hull: a comeback for a battered ship.
      const repaired = player.hull < stats.maxHull ? 1 : 0;
      player.hull = Math.min(stats.maxHull, player.hull + 1);
      floatText(player.x, player.y - 40, `WAVE ${state.wave} CLEAR  +${bonus}${repaired ? '  ·  HULL +1' : ''}`, '#7bd88a', 24);
      events |= EVENT_WAVE_CLEAR;
      if (state.wave >= FINAL_WAVE) {
        // The Maw is gone already (killEnemy set won); this is only a safety net.
        state.won = true;
        events |= EVENT_WIN;
      } else {
        state.intermission = SHOP_DELAY;
      }
    }
    if (state.intermission > 0) {
      state.intermission -= dt;
      if (state.intermission <= 0 && !state.shopOpen && !state.over && !state.won) openShop();
    }

    return events;
  }

  /** The title screen's backdrop: drifters wander the field, nothing fights, nothing scores. */
  function demoStep(dt) {
    state.time += dt;
    if (aliveEnemies() < 7) {
      const kinds = [KIND.drifter, KIND.drifter, KIND.splitter, KIND.spinner];
      spawnAtEdge(pick(random, kinds));
    }
    for (const e of enemies) {
      if (!e.active) continue;
      const toward = angleTo(e.x, e.y, FIELD.width / 2, FIELD.height / 2);
      e.vx = Math.cos(toward) * e.speed * 0.5;
      e.vy = Math.sin(toward) * e.speed * 0.5;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x < -60 || e.x > FIELD.width + 60 || e.y < -60 || e.y > FIELD.height + 60) e.active = false;
    }
    for (const m of embers) {
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0) m.active = false;
    }
    if (random() < dt * 0.5) {
      const m = freeEmber();
      if (m) {
        m.active = true;
        m.x = random() * FIELD.width;
        m.y = random() * FIELD.height;
        m.vx = (random() - 0.5) * 20;
        m.vy = (random() - 0.5) * 20;
        m.value = EMBER.value;
        m.life = EMBER.life;
      }
    }
  }

  reset();
  return { state, reset, step, demoStep, startWave, openShop, buy, nearestEnemy };
}
