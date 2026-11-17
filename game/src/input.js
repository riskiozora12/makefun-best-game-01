// Keyboard and mouse input. Held keys give a steering direction; one-shot presses (start,
// restart, pause, dash, shop buys) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. The mouse aims the ship and
// holding its button fires; the keyboard alone can play too (Space fires toward the mouse, or
// toward the nearest enemy when the mouse never moved).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_BUY_1 = 8;
export const ACTION_BUY_2 = 16;
export const ACTION_BUY_3 = 32;
export const ACTION_NEXT = 64;
export const ACTION_MUTE = 128;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const BUY = { Digit1: ACTION_BUY_1, Digit2: ACTION_BUY_2, Digit3: ACTION_BUY_3, Numpad1: ACTION_BUY_1, Numpad2: ACTION_BUY_2, Numpad3: ACTION_BUY_3 };

export function createInput(canvas) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let actions = 0;
  let firing = false;
  let space = false;
  let click = null;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      if (event.code === 'Space') space = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (event.code in BUY) {
      if (!event.repeat) actions |= BUY[event.code];
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyN') {
      if (!event.repeat) actions |= ACTION_NEXT;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (event.code === 'Space') space = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    firing = false;
  });

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
  }
  canvas.addEventListener('pointermove', trackMouse);
  canvas.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    if (event.button === 0) {
      firing = true;
      click = { x: mouseX, y: mouseY };
    } else if (event.button === 2) actions |= ACTION_DASH;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.button === 0) firing = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Steering: -1, 0 or 1 on each axis (left/right, up/down). */
    steer() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    /** The mouse position in CSS pixels over the canvas, and whether it ever moved. */
    aim() {
      return { x: mouseX, y: mouseY, seen: mouseSeen };
    },
    /** True while the fire button (or Space) is held. */
    get firing() {
      return firing || space;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last primary click's position in CSS pixels, if any since the last call. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
  };
}
