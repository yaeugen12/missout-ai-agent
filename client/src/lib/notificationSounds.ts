import { NotificationType } from '@/types/notification';

// Procedural sound generation using Web Audio API
// All sounds are cyberpunk/sci-fi themed

class NotificationSoundGenerator {
  private context: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.context;
  }

  // WIN - Epic victory sound with rising synth
  generateWinSound(volume: number): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Main synth lead
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.3);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.6);
    gain1.gain.setValueAtTime(volume * 0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.8);

    // Bass hit
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(110, now);
    gain2.gain.setValueAtTime(volume * 0.5, now);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.4);

    // High sparkle
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(2640, now + 0.1);
    gain3.gain.setValueAtTime(volume * 0.2, now + 0.1);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc3.connect(gain3).connect(ctx.destination);
    osc3.start(now + 0.1);
    osc3.stop(now + 0.5);
  }

  // JOIN - Short digital blip
  generateJoinSound(volume: number): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Digital blip
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);

    // Second blip
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1200, now + 0.08);
    gain2.gain.setValueAtTime(volume * 0.2, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.2);
  }

  // CANCEL - Descending error tone
  generateCancelSound(volume: number): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Main descending tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
    gain.gain.setValueAtTime(volume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.1;
    }
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(volume * 0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    noise.connect(noiseGain).connect(ctx.destination);
    noise.start(now);
  }

  // LOCKED - Deep mechanical lock sound
  generateLockedSound(volume: number): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Bass thump
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(80, now);
    osc1.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    gain1.gain.setValueAtTime(volume * 0.6, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Metallic click
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(300, now + 0.1);
    gain2.gain.setValueAtTime(volume * 0.3, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.15);

    // High frequency shimmer
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1500, now + 0.12);
    gain3.gain.setValueAtTime(volume * 0.15, now + 0.12);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc3.connect(gain3).connect(ctx.destination);
    osc3.start(now + 0.12);
    osc3.stop(now + 0.3);
  }

  // UNLOCKED - Rising unlock sound with sparkle
  generateUnlockedSound(volume: number): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Rising tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(200, now);
    osc1.frequency.exponentialRampToValueAtTime(800, now + 0.25);
    gain1.gain.setValueAtTime(volume * 0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Sparkle sequence
    [0, 0.08, 0.16].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 + i * 400, now + delay);
      gain.gain.setValueAtTime(volume * 0.2, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.15);
    });

    // Final high ping
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2400, now + 0.25);
    gain2.gain.setValueAtTime(volume * 0.25, now + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.25);
    osc2.stop(now + 0.45);
  }

  // RANDOMNESS - Mysterious digital sparkle cascade
  generateRandomnessSound(volume: number): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Multiple cascading tones for "randomness" feel
    [0, 0.05, 0.1, 0.15, 0.2].forEach((delay, i) => {
      const freq = [880, 1320, 660, 1100, 1760][i];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(volume * 0.15, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    });

    // Underlying pulse
    const pulse = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    pulse.type = 'triangle';
    pulse.frequency.setValueAtTime(110, now);
    pulseGain.gain.setValueAtTime(volume * 0.25, now);
    pulseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    pulse.connect(pulseGain).connect(ctx.destination);
    pulse.start(now);
    pulse.stop(now + 0.4);
  }

  playSound(type: NotificationType, volume: number): void {
    try {
      switch (type) {
        case NotificationType.WIN:
          this.generateWinSound(volume);
          break;
        case NotificationType.JOIN:
          this.generateJoinSound(volume);
          break;
        case NotificationType.CANCEL:
          this.generateCancelSound(volume);
          break;
        case NotificationType.LOCKED:
          this.generateLockedSound(volume);
          break;
        case NotificationType.UNLOCKED:
          this.generateUnlockedSound(volume);
          break;
        case NotificationType.RANDOMNESS:
          this.generateRandomnessSound(volume);
          break;
      }
    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  }
}

export const notificationSoundGenerator = new NotificationSoundGenerator();
