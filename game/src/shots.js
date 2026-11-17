// The screenshot scenes behind ?shot=start|play|shop|end. Each one plays the real rules
// forward from a fresh world for a fixed time, steered by an autopilot (flee the nearest
// danger, chase the nearest ember, aim at the nearest enemy, fire), so the frame is what a
// real game looks like and the same seed always gives the same frame. The last second of the
// simulation is kept separate, so the particles on the frame are fresh, not stale.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const FRESH_SECONDS = 1;

/** Where the pilot wants to go: away from close danger, else toward the nearest ember. */
function pilotSteer(state, fleeRadius) {
  const p = state.player;
  let danger = null;
  let dangerD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < dangerD) { dangerD = d; danger = e; }
  }
  let ember = null;
  let emberD = Infinity;
  for (const m of state.embers) {
    if (!m.active) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < emberD) { emberD = d; ember = m; }
  }
  // Collect first when the swarm is at arm's length: embers are the shop's currency, and a
  // pilot that only fights arrives at the forge broke. Kills happen at bullet range, so the
  // ember can be anywhere on the field: go and get it whenever nothing is close.
  if (danger && dangerD < 110) {
    const away = Math.atan2(p.y - danger.y, p.x - danger.x);
    return { x: Math.cos(away), y: Math.sin(away) };
  }
  if (ember) {
    const toward = Math.atan2(ember.y - p.y, ember.x - p.x);
    return { x: Math.cos(toward), y: Math.sin(toward) };
  }
  if (danger && dangerD < fleeRadius) {
    const away = Math.atan2(p.y - danger.y, p.x - danger.x);
    return { x: Math.cos(away), y: Math.sin(away) };
  }
  const cx = FIELD.width / 2 - p.x;
  const cy = FIELD.height / 2 - p.y;
  const d = Math.hypot(cx, cy);
  if (d > 120) return { x: cx / d, y: cy / d };
  return { x: 0, y: 0 };
}

/** The pilot's input for one step: steer, aim at the nearest enemy, hold fire, dash out of trouble. */
function pilotInput(state, fleeRadius, dash) {
  const steer = pilotSteer(state, fleeRadius);
  let aimX = state.player.x;
  let aimY = state.player.y - 100;
  let nearest = null;
  let nearestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < nearestD) { nearestD = d; nearest = e; }
  }
  if (nearest) { aimX = nearest.x; aimY = nearest.y; }
  let wantDash = false;
  if (dash && state.player.dashCooldown <= 0 && nearestD < 110) wantDash = true;
  return { steerX: steer.x, steerY: steer.y, aimX, aimY, aimSeen: true, firing: true, dash: wantDash };
}

/** Run the world forward for `seconds`, keeping only the last second's effects fresh. */
function simulate(world, seconds, fleeRadius, dash) {
  world.state.fx.length = 0;
  const total = Math.floor(seconds / STEP);
  const fresh = Math.floor(FRESH_SECONDS / STEP);
  const stale = Math.max(0, total - fresh);
  let events = 0;
  for (let i = 0; i < stale; i += 1) {
    events = world.step(STEP, pilotInput(world.state, fleeRadius, dash));
    world.state.fx.length = 0;
    if (events & (EVENT_OVER | EVENT_WIN)) return events;
  }
  for (let i = 0; i < fresh; i += 1) {
    events = world.step(STEP, pilotInput(world.state, fleeRadius, dash));
    if (events & (EVENT_OVER | EVENT_WIN)) return events;
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play, shop or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'shop' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.demoStep(STEP);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startWave(1);
  if (name === 'play') {
    // Fight until wave 2 is in full swing (several enemies alive), so the frame shows the
    // swarm, the bullets and the embers at once. If the pilot clears a wave on the way, skip
    // the shop and start the next one.
    let seconds = 0;
    while (seconds < 90) {
      simulate(world, 1, 190, true);
      seconds += 1;
      if (world.state.shopOpen) world.startWave(world.state.wave + 1);
      if (world.state.over) break;
      let alive = 0;
      for (const e of world.state.enemies) if (e.active) alive += 1;
      if (world.state.wave >= 2 && alive >= 5) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'shop') {
    // Play until the first wave clears and the forge shop opens, however long that takes.
    let opened = false;
    for (let seconds = 0; seconds < 240 && !opened; seconds += 1) {
      simulate(world, 1, 190, true);
      opened = world.state.shopOpen;
      if (world.state.over) break;
    }
    if (!world.state.shopOpen) {
      // The pilot could not clear the wave in time: force the shop for the screenshot.
      world.openShop();
    }
    return { screen: SCREEN_SHOP, best: world.state.score };
  }
  // end: a good pilot for a while, so the score is real, then a reckless one that rams the
  // nearest enemy instead of shooting it — three hulls, three rams, and the forge falls.
  // (Played in 1 s chunks so a cleared wave's shop is skipped and the next wave starts.)
  let goodSeconds = 0;
  while (goodSeconds < 30) {
    simulate(world, 1, 190, true);
    goodSeconds += 1;
    if (world.state.shopOpen) world.startWave(world.state.wave + 1);
    if (world.state.over) break;
  }
  for (let seconds = 0; seconds < 120; seconds += 1) {
    let events = 0;
    for (let i = 0; i < 1 / STEP; i += 1) {
      // Ram: steer at the nearest enemy, hold no fire, never dash.
      let target = null;
      let targetD = Infinity;
      for (const e of world.state.enemies) {
        if (!e.active) continue;
        const d = Math.hypot(e.x - world.state.player.x, e.y - world.state.player.y);
        if (d < targetD) { targetD = d; target = e; }
      }
      const steer = target
        ? { x: (target.x - world.state.player.x) / (targetD || 1), y: (target.y - world.state.player.y) / (targetD || 1) }
        : { x: 0, y: 0 };
      const aim = target ? { x: target.x, y: target.y } : { x: world.state.player.x, y: world.state.player.y - 100 };
      events = world.step(STEP, { steerX: steer.x, steerY: steer.y, aimX: aim.x, aimY: aim.y, aimSeen: true, firing: false, dash: false });
      if (events & EVENT_OVER) break;
    }
    if (events & EVENT_OVER) break;
    if (world.state.over) break;
    // Keep only the final second's effects fresh: drop the stale ones.
    world.state.fx.length = 0;
    if (world.state.shopOpen) world.startWave(world.state.wave + 1);
  }
  const over = world.state.over;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
