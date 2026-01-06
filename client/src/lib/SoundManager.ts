import { Howl, Howler } from "howler";

type SoundKey = 
  | "orbit_whoosh"
  | "event_horizon_hum"
  | "countdown_tick"
  | "singularity_pulse"
  | "reveal_burst";

interface SoundConfig {
  src: string[];
  volume: number;
  loop: boolean;
  preload: boolean;
}

const SOUND_CONFIGS: Record<SoundKey, SoundConfig> = {
  orbit_whoosh: {
    src: ["/sounds/sfx_orbit_soft_whoosh.mp3"],
    volume: 0.15,
    loop: true,
    preload: false,
  },
  event_horizon_hum: {
    src: ["/sounds/sfx_event_horizon_deep_hum.mp3"],
    volume: 0.25,
    loop: true,
    preload: false,
  },
  countdown_tick: {
    src: ["/sounds/sfx_tick.mp3"],
    volume: 0.35,
    loop: false,
    preload: false,
  },
  singularity_pulse: {
    src: ["/sounds/sfx_singularity_pulse.mp3"],
    volume: 0.3,
    loop: false,
    preload: false,
  },
  reveal_burst: {
    src: ["/sounds/sfx_reveal_burst.mp3"],
    volume: 0.35,
    loop: false,
    preload: false,
  },
};

class SoundManagerClass {
  private sounds: Map<SoundKey, Howl> = new Map();
  private muted: boolean = false;
  private initialized: boolean = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Howler.volume(0.5);
  }

  private getOrLoadSound(key: SoundKey): Howl {
    if (!this.sounds.has(key)) {
      const config = SOUND_CONFIGS[key];
      const sound = new Howl({
        src: config.src,
        volume: config.volume,
        loop: config.loop,
        preload: config.preload,
        onloaderror: (_id, error) => {
          console.warn(`[SoundManager] Failed to load ${key}:`, error);
        },
      });
      this.sounds.set(key, sound);
    }
    return this.sounds.get(key)!;
  }

  play(key: SoundKey): number | null {
    if (this.muted) return null;
    this.init();
    const sound = this.getOrLoadSound(key);
    return sound.play();
  }

  stop(key: SoundKey) {
    const sound = this.sounds.get(key);
    if (sound) {
      sound.stop();
    }
  }

  fadeIn(key: SoundKey, duration: number = 1000): number | null {
    if (this.muted) return null;
    this.init();
    const sound = this.getOrLoadSound(key);
    const config = SOUND_CONFIGS[key];
    sound.volume(0);
    const id = sound.play();
    sound.fade(0, config.volume, duration, id);
    return id;
  }

  fadeOut(key: SoundKey, duration: number = 1000) {
    const sound = this.sounds.get(key);
    if (sound && sound.playing()) {
      sound.fade(sound.volume(), 0, duration);
      setTimeout(() => sound.stop(), duration);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.sounds.forEach(sound => sound.stop());
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  stopAll() {
    this.sounds.forEach(sound => sound.stop());
  }
}

export const SoundManager = new SoundManagerClass();
