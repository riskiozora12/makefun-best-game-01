// Sound, synthesized live with WebAudio: no audio files, nothing to download. Every effect is
// a few oscillators or a burst of filtered noise, so the game stays one small download and
// offline. The context is created on the first user gesture; in screenshot mode it never is.

const MASTER = 0.35;

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  /** Call from any user gesture (start, click) so the browser lets sound play. */
  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(freq, endFreq, duration, type, volume, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noise(duration, filterFreq, volume, delay = 0, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : MASTER;
      return muted;
    },
    shoot() { tone(880, 320, 0.08, 'square', 0.10); },
    hit() { noise(0.08, 2400, 0.12, 0, 'highpass'); },
    explode() { noise(0.45, 900, 0.5); tone(160, 40, 0.4, 'sine', 0.4); },
    bigExplode() { noise(0.8, 700, 0.6); tone(120, 30, 0.7, 'sine', 0.5); },
    pickup() { tone(1320, 1760, 0.09, 'sine', 0.16); },
    hurt() { tone(220, 70, 0.3, 'sawtooth', 0.3); noise(0.2, 500, 0.3); },
    dash() { noise(0.18, 1800, 0.16, 0, 'bandpass'); },
    horn() { tone(196, 196, 0.5, 'sawtooth', 0.16); tone(294, 294, 0.5, 'sawtooth', 0.12, 0.05); },
    alarm() { tone(660, 660, 0.16, 'square', 0.14); tone(660, 660, 0.16, 'square', 0.14, 0.22); },
    buy() { tone(660, 660, 0.08, 'sine', 0.18); tone(990, 990, 0.12, 'sine', 0.18, 0.08); },
    denied() { tone(180, 140, 0.15, 'square', 0.14); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.28, 'triangle', 0.2, i * 0.13));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.94, 0.32, 'triangle', 0.18, i * 0.16));
    },
  };
}
