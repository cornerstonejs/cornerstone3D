import { describe, it, expect, afterEach } from '@jest/globals';
import {
  getGpuMemoryByKind,
  getGpuMemoryTotal,
  removeGpuMemoryEntry,
  resetGpuMemoryLedger,
  setGpuMemoryEntry,
} from '../src/utilities/gpuMemoryLedger';

afterEach(() => {
  resetGpuMemoryLedger();
});

describe('the GPU memory ledger', () => {
  it('totals the page, and leaves out the textures of one volume', () => {
    const textureA = {};
    const textureB = {};

    setGpuMemoryEntry(textureA, { kind: 'texture', bytes: 100, volumeId: 'a' });
    setGpuMemoryEntry(textureB, { kind: 'texture', bytes: 200, volumeId: 'b' });
    setGpuMemoryEntry('canvas:1', { kind: 'canvas', bytes: 40 });
    setGpuMemoryEntry('context:1', { kind: 'context', bytes: 8 });

    expect(getGpuMemoryTotal()).toBe(348);
    expect(getGpuMemoryTotal('a')).toBe(248);
    expect(getGpuMemoryByKind()).toEqual({
      texture: 300,
      canvas: 40,
      renderBuffer: 0,
      context: 8,
    });

    // A new upload replaces the entry of its owner, and a release removes it.
    setGpuMemoryEntry(textureA, { kind: 'texture', bytes: 50, volumeId: 'a' });
    removeGpuMemoryEntry(textureB);

    expect(getGpuMemoryTotal()).toBe(98);
  });
});
