/**
 * 音響出力の入り口 (仕様 §6.1)。
 *
 * 最初のタッチで AudioContext を生成・resume し、無音を 1 サンプル鳴らして
 * モバイルブラウザの自動再生制限 (ミュート) を解除する。
 * 音響合成本体 (§8) はこの AudioContext を使って実装する。
 */

let audioContext: AudioContext | null = null;

export const ensureAudioReady = (): void => {
  if (audioContext === null) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  const source = audioContext.createBufferSource();
  source.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
  source.connect(audioContext.destination);
  source.start();
};

export const getAudioContext = (): AudioContext | null => audioContext;
