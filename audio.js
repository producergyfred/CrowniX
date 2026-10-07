'use strict';

/* =========================================================
   AUDIO
   ========================================================= */

/*
  One reusable AudioContext, created and resumed by the first real
  user interaction (browsers block audio before that). Every sound is
  synthesised locally with the Web Audio API - no audio files.
*/

const SOUND_LEVEL = .9;

let ac = null;
let master = null;
let noiseBuffer = null;
let audioPrimed = false;


function audio() {

  if (!ac) {

    const Ctx =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    try {

      ac = new Ctx();

      master = ac.createGain();

      master.gain.value =
        set.sound
          ? SOUND_LEVEL
          : 0;

      /* Safety limiter: nothing can become painfully loud. */
      const limiter =
        ac.createDynamicsCompressor();

      limiter.threshold.value = -10;
      limiter.knee.value = 8;
      limiter.ratio.value = 10;
      limiter.attack.value = .002;
      limiter.release.value = .12;

      master.connect(limiter);

      limiter.connect(ac.destination);

    } catch (e) {

      ac = null;
      master = null;

      return null;
    }
  }

  return ac;
}


/* Mute / unmute: fades the master gain, silencing sounds already playing. */
function applySoundState() {

  if (!ac || !master) {
    return;
  }

  const now = ac.currentTime;

  master.gain.cancelScheduledValues(now);

  master.gain.setTargetAtTime(
    set.sound ? SOUND_LEVEL : 0,
    now,
    .015
  );
}


/* Called from real user gestures only. */
function unlockAudio() {

  const a = audio();

  if (!a) {
    return;
  }

  if (a.state !== 'running') {

    a.resume().catch(() => {});
  }

  /* iOS Safari: a silent buffer started inside a gesture unlocks audio. */
  if (!audioPrimed) {

    audioPrimed = true;

    try {

      const source = a.createBufferSource();

      source.buffer = a.createBuffer(1, 1, 22050);

      source.connect(a.destination);

      source.start(0);

    } catch (e) {
      /* ignore */
    }
  }
}


[
  'pointerdown',
  'touchend',
  'keydown',
  'click'
].forEach(
  eventName => {

    document.addEventListener(
      eventName,
      unlockAudio,
      {
        passive: true,
        capture: true
      }
    );
  }
);


document.addEventListener(
  'visibilitychange',
  () => {

    if (
      !document.hidden &&
      ac &&
      ac.state !== 'running'
    ) {

      ac.resume().catch(() => {});
    }
  }
);


/* Returns a running context, or null when sound is off / not yet unlocked. */
function voiceReady() {

  if (!set.sound) {
    return null;
  }

  const a = audio();

  if (!a) {
    return null;
  }

  if (a.state !== 'running') {

    a.resume().catch(() => {});

    return null;
  }

  return a;
}


/* A single soft note with an optional pitch glide. */
function tone(
  frequency,
  duration,
  type = 'sine',
  volume = .2,
  at = 0,
  frequency2
) {

  const a = voiceReady();

  if (!a) {
    return;
  }

  try {

    const oscillator = a.createOscillator();

    const gain = a.createGain();

    const start = a.currentTime + at + .005;

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(frequency, start);

    if (frequency2) {

      oscillator.frequency.exponentialRampToValueAtTime(
        frequency2,
        start + duration
      );
    }

    gain.gain.setValueAtTime(.0001, start);

    gain.gain.linearRampToValueAtTime(volume, start + .006);

    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);

    oscillator.connect(gain);

    gain.connect(master);

    oscillator.start(start);

    oscillator.stop(start + duration + .03);

  } catch (e) {
    /* audio unavailable */
  }
}


/* A short filtered noise burst: the "click" of a disk or a metallic shimmer. */
function hit(
  duration,
  volume,
  filterType,
  frequency,
  q = 1,
  at = 0
) {

  const a = voiceReady();

  if (!a) {
    return;
  }

  try {

    if (!noiseBuffer) {

      noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate);

      const data = noiseBuffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    const source = a.createBufferSource();

    const filter = a.createBiquadFilter();

    const gain = a.createGain();

    const start = a.currentTime + at + .005;

    source.buffer = noiseBuffer;

    filter.type = filterType;

    filter.frequency.value = frequency;

    filter.Q.value = q;

    gain.gain.setValueAtTime(.0001, start);

    gain.gain.linearRampToValueAtTime(volume, start + .002);

    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);

    source.connect(filter);

    filter.connect(gain);

    gain.connect(master);

    source.start(start, Math.random() * .5);

    source.stop(start + duration + .02);

  } catch (e) {
    /* audio unavailable */
  }
}


/* =========================================================
   SOUND EFFECTS
   ========================================================= */

/*
  Voices (loudness order):
  move < capture < king move < king capture, promotion distinct.
  Frequencies stay in the mid range so phone speakers can play them.
*/
const SFX = {

  click: () => {

    tone(1000, .04, 'sine', .14);
  },


  select: () => {

    tone(560, .07, 'triangle', .2);

    tone(840, .09, 'sine', .09, .03);
  },


  /* Soft, slightly woody knock of a polished disk landing. */
  move: () => {

    hit(.035, .26, 'bandpass', 1500, 1.4);

    tone(300, .11, 'sine', .22, 0, 170);

    tone(620, .06, 'triangle', .05, 0, 380);
  },


  /* Sharp wood/metal impact followed by a brief fiery shimmer. */
  cap: () => {

    hit(.05, .8, 'bandpass', 2600, 1);

    tone(250, .18, 'triangle', .5, 0, 110);

    tone(1180, .16, 'sine', .1);

    tone(1770, .12, 'sine', .06);

    hit(.22, .14, 'highpass', 5200, .7, .05);

    tone(2400, .2, 'sine', .025, .05, 1800);
  },


  /* King: deeper and richer, with a short warm metallic tail. */
  kingMove: () => {

    tone(170, .34, 'sine', .32, 0, 120);

    tone(340, .3, 'triangle', .13);

    hit(.03, .2, 'bandpass', 1800, 1.2);

    tone(880, .45, 'sine', .06);

    tone(1320, .38, 'sine', .035);

    tone(2200, .25, 'sine', .014);
  },


  /* King capture: royal impact, then a metallic shimmer. */
  kingCap: () => {

    tone(150, .34, 'sine', .52, 0, 70);

    tone(230, .26, 'triangle', .36, 0, 110);

    hit(.06, .8, 'bandpass', 2200, 1);

    tone(987, .5, 'sine', .11);

    tone(1480, .42, 'sine', .07);

    tone(2217, .3, 'sine', .035);

    hit(.3, .16, 'highpass', 4800, .7, .05);
  },


  /* Promotion: a low resonant note followed by a soft golden chime. */
  promote: () => {

    tone(196, .7, 'sine', .5);

    tone(392, .5, 'triangle', .16);

    hit(.03, .25, 'bandpass', 1200, 1);

    tone(1568, 1.1, 'sine', .15, .2);

    tone(1175, .8, 'sine', .09, .24);

    tone(2349, .9, 'sine', .08, .28);

    tone(3136, .6, 'sine', .03, .34);
  },


  win: () => {

    [523, 659, 784, 1047, 1319].forEach(
      (frequency, index) => {

        tone(frequency, .5, 'sine', .2, index * .13);

        tone(frequency * 2, .4, 'sine', .04, index * .13);
      }
    );
  },


  draw: () => {

    tone(392, .45, 'sine', .22);

    tone(330, .6, 'sine', .2, .22);
  },


  /* Achievement unlocked: two soft rising bell notes. */
  achieve: () => {

    tone(880, .5, 'sine', .14);

    tone(1318, .7, 'sine', .12, .12);

    tone(2637, .5, 'sine', .03, .14);
  },


  invalid: () => {

    tone(230, .14, 'triangle', .22, 0, 170);

    hit(.04, .3, 'lowpass', 600, .7);
  }
};


/*
  One game event = one sound: ignore the same sound requested twice
  within a few milliseconds (duplicate touch/click/callback safety).
*/
const lastPlayed = {};

Object.keys(SFX).forEach(
  name => {

    const voice = SFX[name];

    SFX[name] = () => {

      const now = performance.now();

      if (now - (lastPlayed[name] || -1e9) < 45) {
        return;
      }

      lastPlayed[name] = now;

      voice();
    };
  }
);


const vib =
  pattern => {

    if (
      set.vib &&
      navigator.vibrate
    ) {

      try {

        navigator.vibrate(
          pattern
        );

      } catch (e) {
        /* ignore */
      }
    }
  };
