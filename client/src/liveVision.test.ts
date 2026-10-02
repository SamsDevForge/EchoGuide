import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_LABELS, MODEL_LABELS, LiveVision, liveCandidates, type LiveRequest, type LiveResponse } from './liveVision';
import type { GatePrediction } from './gates';
import type { ProviderFrame } from './contracts';

const box = (label: string, score: number, xmin: number, ymin: number, xmax: number, ymax: number): GatePrediction =>
  ({ label, score, box: { xmin, ymin, xmax, ymax } });

class FakeWorker {
  onmessage: ((event: MessageEvent<LiveResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: LiveRequest[] = [];
  postMessage = vi.fn((request: LiveRequest) => { this.sent.push(request); });
  terminate = vi.fn();
  emit(response: LiveResponse) { this.onmessage?.({ data: response } as MessageEvent<LiveResponse>); }
}
let workers: FakeWorker[];
beforeEach(() => {
  workers = [];
  vi.stubGlobal('Worker', class extends FakeWorker { constructor() { super(); workers.push(this); } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('live detections', () => {
  it('keeps openings in a crowded frame before applying the eight-object limit', () => {
    const people = Array.from({length:10}, (_, index) => {
      const x = .02 + (index % 5) * .19, y = .02 + Math.floor(index / 5) * .35;
      return box('person', .9, x, y, x + .12, y + .25);
    });
    const result = liveCandidates([...people, box('gate', .3, .05, .05, .95, .95)], 1);
    expect(result).toHaveLength(8);
    expect(result[0].label).toBe('gate');
  });
  it('maps all five supported classes to image directions without a distance claim', () => {
    expect(LIVE_LABELS).toEqual(['person', 'chair', 'backpack', 'gate', 'door']);
    expect(MODEL_LABELS).toEqual([...LIVE_LABELS, 'fence', 'window', 'wall', 'gate', 'gate', 'door']);
    const result = liveCandidates([
      box('person', .75, .05, .1, .25, .6),
      box('chair', .7, .4, .1, .6, .6),
      box('backpack', .65, .75, .1, .95, .6),
      box('gate', .6, .05, .7, .25, .95),
      box('door', .55, .4, .7, .6, .95),
    ], 12_345);
    expect(result.map(item => item.label)).toEqual(['gate', 'door', 'person', 'chair', 'backpack']);
    expect(result.map(item => item.direction)).toEqual(['left', 'centre', 'left', 'centre', 'right']);
    expect(result.every(item => item.timestamp === 12_345 && item.distanceMetres === null && item.depthSource === 'none' && item.depthState === 'unavailable')).toBe(true);
    expect(result.every(item => !('trackId' in item))).toBe(true);
  });

  it('uses higher-scoring negative classes to suppress overlapping gates and doors, then caps output at eight', () => {
    const negatives = [
      box('fence', .95, .02, .02, .22, .25),
      box('window', .94, .35, .02, .55, .25),
      box('wall', .93, .68, .02, .88, .25),
    ];
    const suppressed = [
      box('gate', .6, .02, .02, .22, .25),
      box('door', .6, .35, .02, .55, .25),
      box('gate', .6, .68, .02, .88, .25),
    ];
    expect(liveCandidates([...suppressed, ...negatives], 1)).toEqual([]);
    const positives = Array.from({ length: 10 }, (_, index) => {
      const column = index % 5, row = Math.floor(index / 5);
      const x = .02 + column * .19, y = .4 + row * .27;
      return box(index % 2 ? 'door' : 'gate', .9 - index * .04, x, y, x + .12, y + .15);
    });
    const result = liveCandidates([...positives].reverse(), 2);
    expect(result).toHaveLength(8);
    expect(result.map(item => item.score)).toEqual(positives.slice(0, 8).map(item => item.score));
    expect(result.every(item => item.label === 'gate' || item.label === 'door')).toBe(true);
  });
});

describe('live worker lifecycle', () => {
  it('rejects pending load on Stop, ignores late readiness, and allows retry with a fresh instance', async () => {
    const status = vi.fn();
    const first = new LiveVision(status);
    const loading = first.load();
    const cancelled = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    const oldWorker = workers[0];
    const oldId = oldWorker.sent[0].id;
    oldWorker.emit({ id: oldId, type: 'status', message: 'Loading local model', progress: 40 });
    expect(status).toHaveBeenCalledWith('Loading local model', 40);
    first.stop();
    await cancelled;
    oldWorker.emit({ id: oldId, type: 'ready', device: 'webgpu' });
    expect(first.device).toBeNull();
    expect(oldWorker.terminate).toHaveBeenCalledTimes(1);
    await expect(first.load()).rejects.toMatchObject({ name: 'AbortError' });

    const retry = new LiveVision();
    const retryLoad = retry.load();
    workers[1].emit({ id: workers[1].sent[0].id, type: 'ready', device: 'wasm' });
    await retryLoad;
    expect(retry.device).toBe('wasm');
    retry.stop();
  });

  it('never queues a second frame while inference is pending and rejects cancelled inference', async () => {
    const vision = new LiveVision();
    const loading = vision.load();
    workers[0].emit({ id: workers[0].sent[0].id, type: 'ready', device: 'webgpu' });
    await loading;
    const pixels = new Uint8ClampedArray([10, 20, 30, 255]);
    const pending = vision.detectPixels(pixels, 1, 1);
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].sent).toHaveLength(2);
    await expect(vision.detectPixels(pixels, 1, 1)).rejects.toThrow('already being checked');
    expect(workers[0].sent).toHaveLength(2);
    const request = workers[0].sent[1];
    expect(request.type).toBe('detect');
    if (request.type === 'detect') expect(request.pixels).not.toBe(pixels);
    vision.stop();
    await cancelled;
    workers[0].emit({ id: request.id, type: 'result', predictions: [box('gate', .9, .1, .1, .4, .8)], inferenceMs: 1 });
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    await expect(vision.detectPixels(pixels, 1, 1)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps the captured frame timestamp when worker results arrive later', async () => {
    const vision = new LiveVision();
    const loading = vision.load();
    workers[0].emit({ id: workers[0].sent[0].id, type: 'ready', device: 'wasm' });
    await loading;
    const pixels = new Uint8ClampedArray([1, 2, 3, 255]);
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage, getImageData: () => ({ data: pixels }) }) };
    vi.stubGlobal('document', { createElement: () => canvas });
    const frame: ProviderFrame = { image: {} as HTMLVideoElement, width: 4, height: 2, timestamp: 5678, depthSource: 'none' };
    const detecting = vision.detect(frame);
    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(2);
    expect(drawImage).toHaveBeenCalled();
    const request = workers[0].sent[1];
    expect(request.type).toBe('detect');
    workers[0].emit({ id: request.id, type: 'result', predictions: [box('gate', .8, .05, .1, .3, .8)], inferenceMs: 145 });
    const result = await detecting;
    expect(result.inferenceMs).toBe(145);
    expect(result.candidates).toMatchObject([{ label: 'gate', timestamp: 5678, direction: 'left', distanceMetres: null, depthState: 'unavailable' }]);
    vision.stop();
  });
});
