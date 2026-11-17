// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between six screens: title, play, shop, paused, game over and victory.
//
// ?seed=N fixes the waves. ?shot=start|play|shop|end (with &seed=N) stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_BUY_1, ACTION_BUY_2, ACTION_BUY_3, ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_NEXT, ACTION_PAUSE, createInput } from './input.js';
import { createParticles } from './particles.js';
import { EVENT_BOSS, EVENT_BUY, EVENT_DASH, EVENT_DENIED, EVENT_HIT, EVENT_HURT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_WAVE_CLEAR, EVENT_WAVE_START, EVENT_WIN, createWorld } from './world.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE, SCREEN_WIN, shopCardAt } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const particles = createParticles();
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Drain the world's visual effects into the particle system, one frame's worth. */
function playFx() {
  const fx = world.state.fx;
  for (const effect of fx) {
    if (effect.kind === 'burst') particles.burst(effect.x, effect.y, effect.color, effect.count, effect.speed);
    else if (effect.kind === 'text') particles.floatText(effect.x, effect.y, effect.value, effect.color, effect.size);
    else if (effect.kind === 'trail') particles.trail(effect.x, effect.y, effect.color);
    else if (effect.kind === 'shake') particles.addShake(effect.amount);
  }
  fx.length = 0;
}

function runShot(name) {
  const scene = stageShot(name, world);
  playFx();
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, particles);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    particles.clear();
    accumulator = 0;
    screen = SCREEN_PLAY;
    const events = world.startWave(1);
    if (events & EVENT_BOSS) audio.alarm();
    else audio.horn();
    announce('Wave 1. Hold the forge.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Victory. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  /** A CSS-pixel point over the canvas, in playfield coordinates. */
  function toField(cssX, cssY) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    return { x: (cssX - ox) / scale, y: (cssY - oy) / scale };
  }

  /** The mouse position, in playfield coordinates, from its CSS pixels over the canvas. */
  function fieldAim() {
    const aim = input.aim();
    const field = toField(aim.x, aim.y);
    return { x: field.x, y: field.y, seen: aim.seen };
  }

  function react(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_KILL) audio.explode();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HURT) audio.hurt();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_BUY) audio.buy();
    if (events & EVENT_DENIED) audio.denied();
    if (events & EVENT_WAVE_CLEAR) audio.horn();
    if (events & EVENT_BOSS) audio.alarm();
    if (events & EVENT_WAVE_START) audio.horn();
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if ((actions & ACTION_CONFIRM) || click) {
        audio.unlock();
        startGame();
      }
      return actions;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if ((actions & ACTION_CONFIRM) || click) startGame();
      return actions;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return actions;
    }
    if (screen === SCREEN_SHOP) {
      if (actions & ACTION_BUY_1) react(world.buy(0));
      else if (actions & ACTION_BUY_2) react(world.buy(1));
      else if (actions & ACTION_BUY_3) react(world.buy(2));
      else if (actions & (ACTION_NEXT | ACTION_CONFIRM)) {
        const events = world.startWave(world.state.wave + 1);
        react(events);
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}.`);
      } else if (click) {
        const field = toField(click.x, click.y);
        const card = shopCardAt(field.x, field.y);
        if (card >= 0) react(world.buy(card));
      }
      return actions;
    }
    // SCREEN_PLAY
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
    return actions;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.demoStep(STEP);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const steer = input.steer();
    const aim = fieldAim();
    const events = world.step(STEP, {
      steerX: steer.x,
      steerY: steer.y,
      aimX: aim.x,
      aimY: aim.y,
      aimSeen: aim.seen,
      firing: input.firing,
      dash: Boolean(actions & ACTION_DASH),
    });
    react(events);
    if (world.state.shopOpen && screen === SCREEN_PLAY) {
      screen = SCREEN_SHOP;
      announce(`Wave ${world.state.wave} clear. Forge shop open.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    playFx();
    particles.step(STEP);
    renderer.draw(world.state, screen, best, particles);
  }

  // Leaving the tab pauses a running game rather than letting the swarm in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberfall. Click or press Space to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
