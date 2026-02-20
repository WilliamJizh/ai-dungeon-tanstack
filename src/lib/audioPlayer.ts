/**
 * Singleton Web Audio API player for raw PCM music files.
 * PCM format: 24kHz, 1 channel (mono), 16-bit signed little-endian.
 */

let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let sourceNode: AudioBufferSourceNode | null = null;
let currentUrl: string | null = null;
let muted = false;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: 24000 });
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
  const int16 = new Int16Array(arrayBuffer);
  const numSamples = int16.length;

  const audioBuffer = ctx.createBuffer(1, numSamples, 24000);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < numSamples; i++) {
    channelData[i] = int16[i] / 32768;
  }

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
