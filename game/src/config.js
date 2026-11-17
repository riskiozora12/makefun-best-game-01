// Emberfall — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window, so no
// rule below depends on the screen size. You are Cinder, the last ember-ship, holding the
// star-forge against the Ashen swarm. Survive 10 waves, kill the Maw, win. Lose your hull, lose.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Waves in all; wave 5 brings the Herald, wave 10 the Maw. Kill the Maw and the game is won. */
export const FINAL_WAVE = 10;
export const HERALD_WAVE = 5;

/** Seconds between the last kill of a wave and the shop opening; seconds the shop waits. */
export const SHOP_DELAY = 1.2;

export const PLAYER = {
  radius: 14,
  speed: 300,
  hull: 3,
  fireInterval: 0.22,
  bulletSpeed: 720,
  bulletDamage: 1,
  bulletRadius: 5,
  dashSpeed: 900,
  dashTime: 0.16,
  dashCooldown: 2.2,
  invulnerable: 1.2,
  pickupRadius: 90,
  thrusterTrail: 0.03,
};

export const EMBER = {
  radius: 7,
  value: 1,
  magnetSpeed: 420,
  driftSpeed: 26,
  life: 20,
};

/** Enemy kinds: what they are, what they do, what they are worth. */
export const ENEMY = {
  drifter: { radius: 16, hull: 2, speed: 62, score: 50, embers: 1, contact: 1, color: '#ef476f' },
  darter: { radius: 12, hull: 1, speed: 95, lungeSpeed: 380, lungeWindup: 0.7, lungeCooldown: 2.6, score: 80, embers: 1, contact: 1, color: '#f78c6b' },
  spinner: { radius: 15, hull: 2, speed: 78, keepDistance: 300, fireInterval: 2.8, orbSpeed: 185, orbRadius: 6, score: 120, embers: 2, contact: 1, color: '#b5179e' },
  mite: { radius: 8, hull: 1, speed: 165, score: 30, embers: 0, contact: 1, color: '#ff5d8f' },
  splitter: { radius: 20, hull: 3, speed: 54, score: 150, embers: 2, contact: 1, color: '#9d4edd' },
  herald: { radius: 34, hull: 46, speed: 44, score: 1500, embers: 12, contact: 2, color: '#ff5964' },
  maw: { radius: 52, hull: 120, speed: 34, score: 5000, embers: 30, contact: 2, color: '#ff2e63' },
};

/** How a wave is built: base count plus per-wave growth, and which kinds may appear. */
export const WAVE = {
  baseCount: 6,
  perWave: 3,
  maxAlive: 26,
  spawnInterval: 0.9,
  spawnIntervalMin: 0.3,
  unlock: { darter: 2, spinner: 3, splitter: 4, herald: 5, maw: 10 },
  /** Wave clear bonus: flat plus per hull left. */
  clearBonus: 250,
  clearBonusPerHull: 150,
};

export const BULLET = { max: 220, life: 1.4 };
export const ORB = { max: 120, life: 6 };

/** The shop: three offers a wave, each from this list, at these ember prices. */
export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Cycler', cost: 6, desc: 'Fire 30% faster.', apply: (p) => { p.fireInterval *= 0.77; } },
  { id: 'heavy', name: 'Heavy Shells', cost: 8, desc: '+1 bullet damage.', apply: (p) => { p.bulletDamage += 1; } },
  { id: 'thrust', name: 'Ion Thrusters', cost: 5, desc: '+18% move speed.', apply: (p) => { p.speed *= 1.18; } },
  { id: 'plating', name: 'Hull Plating', cost: 7, desc: '+1 max hull, repair 1.', apply: (p, pl) => { p.maxHull += 1; pl.hull = Math.min(p.maxHull, pl.hull + 1); } },
  { id: 'magnet', name: 'Ember Magnet', cost: 5, desc: '+70% pickup radius.', apply: (p) => { p.pickupRadius *= 1.7; } },
  { id: 'coil', name: 'Dash Coil', cost: 6, desc: 'Dash recharges 35% faster.', apply: (p) => { p.dashCooldown *= 0.65; } },
  { id: 'split', name: 'Split Shot', cost: 12, desc: '+1 bullet, spread wider.', apply: (p) => { p.shots += 1; } },
  { id: 'pierce', name: 'Overcharge', cost: 10, desc: 'Bullets pierce +1 enemy.', apply: (p) => { p.pierce += 1; } },
];
export const SHOP_OFFERS = 3;

export const PALETTE = {
  backdrop: '#070a18',
  nebulaA: 'rgba(64, 32, 120, 0.55)',
  nebulaB: 'rgba(16, 80, 110, 0.45)',
  nebulaC: 'rgba(120, 30, 60, 0.35)',
  star: '#cdd6ff',
  player: '#4cc9f0',
  playerCore: '#e8fbff',
  bullet: '#ffd166',
  ember: '#ff8c42',
  emberCore: '#ffe3b3',
  panel: '#12172b',
  panelEdge: '#2a3357',
  text: '#eef1f5',
  muted: '#9aa3bd',
  danger: '#ff5964',
  gold: '#ffd166',
  green: '#7bd88a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';
