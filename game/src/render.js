// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Neon-on-dark vector art: every shape is drawn twice, a wide translucent stroke for
// the glow and a narrow bright one for the edge. The nebula and the stars are painted once to
// offscreen canvases at boot, so a frame costs no gradients.

import { FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { KIND } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_SHOP = 'shop';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, top: 150, line: 32, bottom: 76 };
const SHOP_CARD_COUNT = 3;
/** The forge shop's geometry, shared by the drawing and the click hit-test. */
const SHOP = {
  width: 980, height: 470, cardW: 280, cardH: 220, gap: 26,
  get x() { return (FIELD.width - this.width) / 2; },
  get y() { return (FIELD.height - this.height) / 2; },
  get startX() { return (FIELD.width - (SHOP_CARD_COUNT * this.cardW + (SHOP_CARD_COUNT - 1) * this.gap)) / 2; },
  get cardY() { return this.y + 130; },
};

/** Which shop card (0, 1, 2) a playfield point falls on, or -1 for none. */
export function shopCardAt(fx, fy) {
  for (let i = 0; i < SHOP_CARD_COUNT; i += 1) {
    const cx = SHOP.startX + i * (SHOP.cardW + SHOP.gap);
    if (fx >= cx && fx <= cx + SHOP.cardW && fy >= SHOP.cardY && fy <= SHOP.cardY + SHOP.cardH) return i;
  }
  return -1;
}

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const emberLabel = cachedLabel('');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const bossLabel = cachedLabel('');

  // The nebula: three soft radial glows and a dark vignette, painted once.
  const nebula = document.createElement('canvas');
  nebula.width = FIELD.width;
  nebula.height = FIELD.height;
  {
    const n = nebula.getContext('2d');
    n.fillStyle = PALETTE.backdrop;
    n.fillRect(0, 0, FIELD.width, FIELD.height);
    const blobs = [
      [300, 180, 420, PALETTE.nebulaA],
      [1020, 520, 460, PALETTE.nebulaB],
      [900, 120, 300, PALETTE.nebulaC],
      [180, 560, 320, PALETTE.nebulaB],
    ];
    for (const [x, y, r, color] of blobs) {
      const g = n.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = g;
      n.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const v = n.createRadialGradient(640, 360, 240, 640, 360, 780);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    n.fillStyle = v;
    n.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  // The stars: fixed points with a twinkle phase, drawn over the nebula.
  const stars = [];
  for (let i = 0; i < 150; i += 1) {
    stars.push({ x: Math.random() * FIELD.width, y: Math.random() * FIELD.height, r: 0.6 + Math.random() * 1.4, phase: Math.random() * Math.PI * 2 });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function glowCircle(x, y, r, color, core) {
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.globalAlpha = 0.35;
    context.lineWidth = 6;
    context.stroke();
    context.globalAlpha = 1;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = core;
    context.fill();
  }

  function drawBackground(time) {
    context.drawImage(nebula, 0, 0);
    for (const s of stars) {
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.7 + s.phase));
      context.globalAlpha = twinkle;
      context.fillStyle = PALETTE.star;
      context.fillRect(s.x, s.y, s.r, s.r);
    }
    context.globalAlpha = 1;
  }

  function drawEmbers(state) {
    for (const m of state.embers) {
      if (!m.active) continue;
      const pulse = 1 + 0.15 * Math.sin(state.time * 6 + m.x);
      const r = 7 * pulse;
      context.save();
      context.translate(m.x, m.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.ember;
      context.globalAlpha = 0.35;
      context.fillRect(-r - 3, -r - 3, (r + 3) * 2, (r + 3) * 2);
      context.globalAlpha = 1;
      context.fillRect(-r, -r, r * 2, r * 2);
      context.fillStyle = PALETTE.emberCore;
      context.fillRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9);
      context.restore();
    }
  }

  function drawBullets(state) {
    context.lineCap = 'round';
    for (const b of state.bullets) {
      if (!b.active) continue;
      const len = Math.hypot(b.vx, b.vy) || 1;
      const tx = b.x - (b.vx / len) * 14;
      const ty = b.y - (b.vy / len) * 14;
      context.beginPath();
      context.moveTo(tx, ty);
      context.lineTo(b.x, b.y);
      context.strokeStyle = PALETTE.bullet;
      context.globalAlpha = 0.4;
      context.lineWidth = 7;
      context.stroke();
      context.globalAlpha = 1;
      context.lineWidth = 3;
      context.stroke();
    }
  }

  function drawOrbs(state) {
    for (const o of state.orbs) {
      if (!o.active) continue;
      glowCircle(o.x, o.y, 6, '#b5179e', '#ff5d8f');
    }
  }

  function spikyPath(x, y, r, spikes, wobble) {
    context.beginPath();
    for (let i = 0; i <= spikes * 2; i += 1) {
      const angle = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * wobble;
      const px = x + Math.cos(angle) * rr;
      const py = y + Math.sin(angle) * rr;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  }

  function drawEnemy(e, time, player) {
    const flash = e.flash > 0;
    const body = flash ? '#ffffff' : e.color;
    if (e.kind === KIND.drifter) {
      spikyPath(e.x, e.y, e.radius, 8, 0.72);
      context.fillStyle = body;
      context.globalAlpha = 0.25;
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = body;
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = '#2b0a12';
      context.beginPath();
      context.arc(e.x, e.y, e.radius * 0.45, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === KIND.darter) {
      // Telegraph: blink a ring while winding up the lunge.
      if (e.state === 1 && Math.floor(time * 12) % 2 === 0) {
        context.beginPath();
        context.arc(e.x, e.y, e.radius + 8, 0, Math.PI * 2);
        context.strokeStyle = '#ffb703';
        context.lineWidth = 2;
        context.stroke();
      }
      const angle = Math.atan2(player.y - e.y, player.x - e.x);
      context.save();
      context.translate(e.x, e.y);
      context.rotate(angle);
      context.beginPath();
      context.moveTo(e.radius + 6, 0);
      context.lineTo(-e.radius, e.radius * 0.8);
      context.lineTo(-e.radius * 0.4, 0);
      context.lineTo(-e.radius, -e.radius * 0.8);
      context.closePath();
      context.fillStyle = body;
      context.fill();
      context.strokeStyle = body;
      context.lineWidth = 2;
      context.stroke();
      context.restore();
    } else if (e.kind === KIND.spinner) {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(time * 1.5);
      context.strokeStyle = body;
      context.lineWidth = 2;
      context.strokeRect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
      context.rotate(-time * 3);
      context.fillStyle = body;
      context.fillRect(-e.radius * 0.35, -e.radius * 0.35, e.radius * 0.7, e.radius * 0.7);
      context.restore();
    } else if (e.kind === KIND.mite) {
      glowCircle(e.x, e.y, e.radius, body, flash ? '#ffffff' : '#ff8fab');
    } else if (e.kind === KIND.splitter) {
      context.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + time * 0.4;
        const px = e.x + Math.cos(angle) * e.radius;
        const py = e.y + Math.sin(angle) * e.radius;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fillStyle = body;
      context.globalAlpha = 0.3;
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = body;
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = '#2b0a3d';
      context.beginPath();
      context.arc(e.x, e.y, e.radius * 0.4, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === KIND.herald || e.kind === KIND.maw) {
      const big = e.kind === KIND.maw;
      spikyPath(e.x, e.y, e.radius, big ? 14 : 10, 0.86);
      context.fillStyle = body;
      context.globalAlpha = 0.3;
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = body;
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = '#1a0508';
      context.beginPath();
      context.arc(e.x, e.y, e.radius * 0.62, 0, Math.PI * 2);
      context.fill();
      // The maw's mouth: a dark arc that opens and closes.
      const mouth = big ? 0.5 + 0.35 * Math.sin(time * 2.2) : 0.3;
      context.fillStyle = '#ff2e63';
      context.beginPath();
      context.arc(e.x, e.y, e.radius * 0.5, -mouth, mouth);
      context.lineTo(e.x, e.y);
      context.closePath();
      context.fill();
      context.fillStyle = '#ffd166';
      context.beginPath();
      context.arc(e.x - e.radius * 0.3, e.y - e.radius * 0.28, 4, 0, Math.PI * 2);
      context.arc(e.x + e.radius * 0.3, e.y - e.radius * 0.28, 4, 0, Math.PI * 2);
      context.fill();
    }
    // A thin health bar over anything hurt and bigger than a mite.
    if (e.hull < e.maxHull && e.maxHull > 1) {
      const w = e.radius * 2;
      const y = e.y - e.radius - 10;
      context.fillStyle = 'rgba(0,0,0,0.6)';
      context.fillRect(e.x - w / 2, y, w, 5);
      context.fillStyle = PALETTE.danger;
      context.fillRect(e.x - w / 2, y, w * (e.hull / e.maxHull), 5);
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    const blink = p.invulnerable > 0 && Math.floor(time * 14) % 2 === 0;
    if (blink || state.over) return;
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.angle);
    // Engine flame, flickering.
    const flame = 10 + Math.random() * 8;
    context.beginPath();
    context.moveTo(-PLAYER.radius, 5);
    context.lineTo(-PLAYER.radius - flame, 0);
    context.lineTo(-PLAYER.radius, -5);
    context.closePath();
    context.fillStyle = PALETTE.ember;
    context.fill();
    // Hull: a dart with a bright edge and a pale core.
    context.beginPath();
    context.moveTo(PLAYER.radius + 6, 0);
    context.lineTo(-PLAYER.radius, PLAYER.radius * 0.85);
    context.lineTo(-PLAYER.radius * 0.45, 0);
    context.lineTo(-PLAYER.radius, -PLAYER.radius * 0.85);
    context.closePath();
    context.fillStyle = PALETTE.player;
    context.globalAlpha = 0.35;
    context.lineWidth = 8;
    context.strokeStyle = PALETTE.player;
    context.stroke();
    context.globalAlpha = 1;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = PALETTE.playerCore;
    context.stroke();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(2, 0, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // Dash ready ring, faint under the ship.
    if (p.dashCooldown <= 0) {
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius + 10, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(76, 201, 240, 0.35)';
      context.lineWidth = 2;
      context.stroke();
    }
  }

  function drawParticles(particles) {
    for (const p of particles.parts) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.85;
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const t of particles.texts) {
      if (!t.active) continue;
      context.globalAlpha = Math.max(0, t.life / t.maxLife);
      text(t.value, t.x, t.y, t.size, t.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, best) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left');
    text(waveLabel(state.wave > 0 ? `${state.wave} / 10` : '—'), FIELD.width / 2, 18, 28, PALETTE.text, 'center');
    // Hull: little ships, lit or dark.
    const label = 'HULL';
    text(label, FIELD.width - 24 - state.stats.maxHull * 26 - 8, 18, 28, PALETTE.text, 'right');
    for (let i = 0; i < state.stats.maxHull; i += 1) {
      const cx = FIELD.width - 24 - i * 26 - 13;
      const cy = 30;
      context.save();
      context.translate(cx, cy);
      context.beginPath();
      context.moveTo(9, 0);
      context.lineTo(-7, 6);
      context.lineTo(-3, 0);
      context.lineTo(-7, -6);
      context.closePath();
      context.fillStyle = i < state.player.hull ? PALETTE.player : 'rgba(255,255,255,0.14)';
      context.fill();
      context.restore();
    }
    // Embers held, with a diamond.
    const ex = FIELD.width - 24;
    const ey = 62;
    context.save();
    context.translate(ex - 70, ey);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.ember;
    context.fillRect(-6, -6, 12, 12);
    context.restore();
    text(emberLabel(state.embersHeld), ex, ey - 14, 24, PALETTE.gold, 'right', 'top');
    // Dash cooldown, bottom left.
    const dashReady = state.player.dashCooldown <= 0;
    const dashFrac = dashReady ? 1 : 1 - state.player.dashCooldown / state.stats.dashCooldown;
    text('DASH', 24, FIELD.height - 34, 16, PALETTE.muted, 'left', 'top');
    context.fillStyle = 'rgba(255,255,255,0.14)';
    context.fillRect(80, FIELD.height - 28, 110, 8);
    context.fillStyle = dashReady ? PALETTE.player : PALETTE.muted;
    context.fillRect(80, FIELD.height - 28, 110 * dashFrac, 8);
    // Boss bar, top centre under the wave.
    const boss = state.boss;
    if (boss && boss.active) {
      const w = 420;
      const x = (FIELD.width - w) / 2;
      const y = 56;
      text(bossLabel(boss.kind === KIND.maw ? 'THE MAW' : 'THE HERALD'), FIELD.width / 2, y, 20, PALETTE.danger, 'center', 'top');
      context.fillStyle = 'rgba(0,0,0,0.6)';
      context.fillRect(x, y + 24, w, 10);
      context.fillStyle = PALETTE.danger;
      context.fillRect(x, y + 24, w * Math.max(0, boss.hull / boss.maxHull), 10);
    }
    text(`BEST ${best}`, 24, 52, 16, PALETTE.muted, 'left', 'top');
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(4, 6, 16, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 46, accent || PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.gold, 'center');
  }

  function drawShop(state) {
    const x = SHOP.x;
    const y = SHOP.y;
    const width = SHOP.width;
    const height = SHOP.height;
    context.fillStyle = 'rgba(4, 6, 16, 0.78)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(`WAVE ${state.wave} CLEAR — FORGE UPGRADES`, FIELD.width / 2, y + 58, 34, PALETTE.text, 'center');
    text(`Embers: ${state.embersHeld}   ·   Next: wave ${state.wave + 1}`, FIELD.width / 2, y + 92, 21, PALETTE.gold, 'center');
    const cardW = SHOP.cardW;
    const cardH = SHOP.cardH;
    const gap = SHOP.gap;
    const startX = SHOP.startX;
    const cardY = SHOP.cardY;
    for (let i = 0; i < state.offers.length; i += 1) {
      const offer = state.offers[i];
      const bought = state.bought[i];
      const afford = state.embersHeld >= offer.cost;
      const cx = startX + i * (cardW + gap);
      context.fillStyle = bought ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.07)';
      context.fillRect(cx, cardY, cardW, cardH);
      context.strokeStyle = bought ? PALETTE.green : afford ? PALETTE.panelEdge : 'rgba(255,89,100,0.5)';
      context.lineWidth = 2;
      context.strokeRect(cx, cardY, cardW, cardH);
      text(`[${i + 1}]`, cx + cardW / 2, cardY + 40, 22, PALETTE.muted, 'center');
      text(offer.name, cx + cardW / 2, cardY + 84, 24, bought ? PALETTE.muted : PALETTE.text, 'center');
      // Word-wrap the description to the card.
      const words = offer.desc.split(' ');
      let line = '';
      let ly = cardY + 122;
      for (const word of words) {
        if ((line + ' ' + word).trim().length > 22 && line) {
          text(line, cx + cardW / 2, ly, 19, PALETTE.muted, 'center');
          ly += 26;
          line = word;
        } else line = (line + ' ' + word).trim();
      }
      if (line) text(line, cx + cardW / 2, ly, 19, PALETTE.muted, 'center');
      const costColor = bought ? PALETTE.green : afford ? PALETTE.gold : PALETTE.danger;
      text(bought ? 'OWNED' : `◆ ${offer.cost} embers`, cx + cardW / 2, cardY + cardH - 26, 22, costColor, 'center');
    }
    text('Press 1 / 2 / 3 to buy, or N for the next wave', FIELD.width / 2, y + height - 34, 22, PALETTE.gold, 'center');
  }

  const TITLE_LINES = [
    'Hold the star-forge. Survive 10 waves. Kill the Maw.',
    'WASD or arrows to fly · Mouse to aim · Hold click or Space to fire',
    'Shift or right-click to dash · P to pause · M to mute',
    'Kill the Ashen, gather their embers, spend them in the forge shop.',
    'Clearing a wave repairs 1 hull.',
    '',
  ];
  const PAUSED_LINES = ['The swarm waits for no one — except now.'];
  const OVER_LINES = ['', '', ''];
  const WIN_LINES = ['', '', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, particles) {
    const time = state.time;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shake = particles ? particles.shakeOffset(1 / 60) : { x: 0, y: 0 };
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shake.x * view.scale, view.y + shake.y * view.scale);
    drawBackground(time);
    drawEmbers(state);
    if (screen !== SCREEN_TITLE) {
      drawBullets(state);
      drawOrbs(state);
      for (const e of state.enemies) if (e.active) drawEnemy(e, time, state.player);
      drawPlayer(state, time);
      if (particles) drawParticles(particles);
    } else {
      for (const e of state.enemies) if (e.active) drawEnemy(e, time, state.player);
      if (particles) drawParticles(particles);
    }
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = bestLabel(best);
      drawPanel('EMBERFALL', TITLE_LINES, 'Click or press Space to start');
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_SHOP) drawShop(state);
    else if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = `Wave ${state.wave} · ${state.kills} kills`;
      OVER_LINES[2] = bestLabel(best);
      drawPanel('THE FORGE FALLS', OVER_LINES, 'Press Space to try again', PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = `All 10 waves · ${state.kills} kills · ${state.embersCollected} embers`;
      WIN_LINES[2] = bestLabel(best);
      drawPanel('THE MAW IS ASH', WIN_LINES, 'Press Space to play again', PALETTE.gold);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
