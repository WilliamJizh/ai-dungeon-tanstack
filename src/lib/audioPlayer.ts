/**
 * Singleton Web Audio API player for WAV music files.
 * Uses Web Audio for seamless looping (HTML audio element has loop-gap issues).
 */

let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let sourceNode: AudioBufferSourceNode | null = null;
let currentUrl: string | null = null;
let muted = false;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

async function play(url: string): Promise<void> {
  if (url === currentUrl && sourceNode) return;

  stop();

  const ctx = getContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  sourceNode = ctx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.loop = true;
  sourceNode.connect(gainNode!);
  sourceNode.start();
  currentUrl = url;
}

function stop(): void {
  if (sourceNode) {
    try {
      sourceNode.stop();
    } catch {
      // Already stopped
    }
    sourceNode.disconnect();
    sourceNode = null;
  }
  currentUrl = null;
}

function setMuted(m: boolean): void {
  muted = m;
  if (gainNode) {
    gainNode.gain.value = m ? 0 : 1;
  }
}

function isMuted(): boolean {
  return muted;
}

export const audioPlayer = { play, stop, setMuted, isMuted };
