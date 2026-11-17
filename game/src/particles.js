// Particles, floating score text and screen shake: the game's feel. One fixed pool, allocated
// once at boot, so a busy fight allocates nothing. A burst is a ring of sparks plus a flash;
// floating texts rise and fade; shake is a decaying offset the renderer applies to the field.

export function createParticles(capacity = 420) {
  const parts = [];
  for (let i = 0; i < capacity; i += 1) {
    parts.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', drag: 0 });
  }
  const texts = [];
  for (let i = 0; i < 24; i += 1) {
    texts.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, value: '', color: '#ffffff', size: 18 });
  }
  let shake = 0;

  function freePart() {
    for (let i = 0; i < parts.length; i += 1) if (!parts[i].active) return parts[i];
    return parts[0];
  }

  function spawn(x, y, vx, vy, life, size, color, drag = 2.2) {
    const p = freePart();
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.drag = drag;
  }

  return {
    parts,
    texts,
    /** A ring of sparks plus a few slow embers, in the given colour. */
    burst(x, y, color, count = 16, speed = 260) {
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const v = speed * (0.35 + Math.random() * 0.75);
        spawn(x, y, Math.cos(angle) * v, Math.sin(angle) * v, 0.35 + Math.random() * 0.4, 1.5 + Math.random() * 2.5, color);
      }
      spawn(x, y, 0, 0, 0.18, 16, '#ffffff', 0);
    },
    /** A short engine trail puff behind the ship. */
    trail(x, y, color) {
      spawn(x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.3, 2.5, color, 1.5);
    },
    /** A rising score label, e.g. "+50" or "WAVE CLEAR +400". */
    floatText(x, y, value, color, size = 18) {
      let slot = null;
      for (let i = 0; i < texts.length; i += 1) if (!texts[i].active) { slot = texts[i]; break; }
      if (!slot) slot = texts[0];
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.life = 0.9;
      slot.maxLife = 0.9;
      slot.value = value;
      slot.color = color;
      slot.size = size;
    },
    /** Kick the camera; bigger kicks for bigger booms. */
    addShake(amount) {
      shake = Math.min(18, shake + amount);
    },
    /** Current shake offset, decaying; call once a frame before drawing. */
    shakeOffset(dt) {
      shake = Math.max(0, shake - dt * 34);
      if (shake === 0) return { x: 0, y: 0 };
      return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
    },
    step(dt) {
      for (let i = 0; i < parts.length; i += 1) {
        const p = parts[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
      }
      for (let i = 0; i < texts.length; i += 1) {
        const t = texts[i];
        if (!t.active) continue;
        t.life -= dt;
        t.y -= 34 * dt;
        if (t.life <= 0) t.active = false;
      }
    },
    clear() {
      for (const p of parts) p.active = false;
      for (const t of texts) t.active = false;
      shake = 0;
    },
  };
}
