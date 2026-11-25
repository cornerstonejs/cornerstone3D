import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { createGpuMemoryStress } from '../src/utilities/gpuMemoryStress';

const MEGABYTE = 1024 * 1024;

/**
 * A fake WebGL2 context that holds `capacity` bytes of textures. Beyond it,
 * `texStorage3D` queues `OUT_OF_MEMORY`, or loses the context when
 * `loseOnFailure` is set.
 */
function fakeCanvas({ capacity, loseOnFailure = false }) {
  const listeners = {};
  const state = { bytes: 0, lost: false, errors: [], draws: 0, deleted: 0 };
  const gl = {
    NO_ERROR: 0,
    OUT_OF_MEMORY: 0x0505,
    TEXTURE_3D: 1,
    TEXTURE0: 2,
    R8: 3,
    NEAREST: 4,
    TEXTURE_MIN_FILTER: 5,
    TEXTURE_MAG_FILTER: 6,
    POINTS: 7,
    VERTEX_SHADER: 8,
    FRAGMENT_SHADER: 9,
    LINK_STATUS: 10,
    MAX_3D_TEXTURE_SIZE: 11,
    getParameter: () => 2048,
    createProgram: () => ({}),
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    useProgram: () => undefined,
    uniform1i: () => undefined,
    getUniformLocation: () => ({}),
    activeTexture: () => undefined,
    createTexture: () => ({}),
    bindTexture: () => undefined,
    texParameteri: () => undefined,
    texStorage3D: (_target, _levels, _format, width, height, depth) => {
      state.bytes += width * height * depth;

      if (state.bytes > capacity) {
        if (loseOnFailure) {
          state.lost = true;
          listeners.webglcontextlost?.();
        } else {
          state.errors.push(0x0505);
        }
      }
    },
    drawArrays: () => {
      state.draws++;
    },
    finish: () => undefined,
    isContextLost: () => state.lost,
    getError: () => state.errors.shift() ?? 0,
    deleteTexture: () => {
      state.deleted++;
    },
    getExtension: () => ({ loseContext: () => undefined }),
  };
  const canvas = {
    width: 0,
    height: 0,
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    getContext: () => gl,
  };

  return { canvas, state };
}

describe('the raw allocations of a run', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Grows the run and lets the wait for a context loss pass. */
  async function grow(stress, bytes) {
    const done = stress.growTo(bytes);

    await jest.runAllTimersAsync();

    return done;
  }

  it('holds the memory in textures of at most 256 MB, and samples each one', async () => {
    const { canvas, state } = fakeCanvas({ capacity: Infinity });
    const stress = createGpuMemoryStress(() => canvas);

    expect(await grow(stress, 600 * MEGABYTE)).toBe(true);
    expect(stress.allocatedBytes()).toBe(600 * MEGABYTE);
    expect(state.draws).toBe(3);

    stress.release();

    expect(state.deleted).toBe(3);
    expect(stress.allocatedBytes()).toBe(0);
  });

  it('fails at OUT_OF_MEMORY', async () => {
    const { canvas } = fakeCanvas({ capacity: 500 * MEGABYTE });
    const stress = createGpuMemoryStress(() => canvas);

    expect(await grow(stress, 400 * MEGABYTE)).toBe(true);
    expect(await grow(stress, 600 * MEGABYTE)).toBe(false);
  });

  it('fails at a lost context', async () => {
    const { canvas } = fakeCanvas({
      capacity: 300 * MEGABYTE,
      loseOnFailure: true,
    });
    const stress = createGpuMemoryStress(() => canvas);

    expect(await grow(stress, 512 * MEGABYTE)).toBe(false);
  });

  it('gives no run without WebGL2', () => {
    const canvas = {
      addEventListener: () => undefined,
      getContext: () => null,
    };

    expect(createGpuMemoryStress(() => canvas)).toBeUndefined();
  });
});
