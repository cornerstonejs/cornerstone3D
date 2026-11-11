import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { VolumeTextureStore } from '../src/cache/volumeTextureStore';

// The global store of the named texture sets. A set is the unit of storage, of
// cost and of eviction, and a selection reads the stored sets instead of
// building anything.
//
// None of these tests needs a GPU. A fake texture object stands in for the real
// one, because the store builds a texture only through the factory that the
// caller states.

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function makeGrid(dimensions, spacing = [1, 1, 1], origin = [0, 0, 0]) {
  return { dimensions, spacing, origin, direction: identityDirection };
}

const volumeGrid = makeGrid([64, 64, 16]);

function makeStore() {
  const store = new VolumeTextureStore();
  const built = [];
  const destroyed = [];
  const applied = [];

  const options = (overrides) => ({
    volumeId: 'volume-1',
    name: 'full-resolution/full-extent',
    volumeGrid,
    grids: [volumeGrid],
    dataType: 'Float32Array',
    createTexture: (request) => {
      const texture = { id: request.id, setName: request.setName, grid: null };

      built.push(texture);

      return texture;
    },
    destroyTexture: (texture) => destroyed.push(texture),
    applyGrid: (texture, grid) => {
      texture.grid = grid;
      applied.push({ texture, grid });
    },
    ...overrides,
  });

  return { store, built, destroyed, applied, options };
}

/** A set of bricks that tile the volume. */
function brickGrids(edge = 16) {
  const grids = [];

  for (let k = 0; k < 16; k += edge) {
    for (let j = 0; j < 64; j += edge) {
      for (let i = 0; i < 64; i += edge) {
        grids.push(
          makeGrid([edge, edge, Math.min(edge, 16 - k)], [1, 1, 1], [i, j, k])
        );
      }
    }
  }

  return grids;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('the store provisions a named set', () => {
  it('builds the textures once, and gives the same set to a later call', () => {
    const { store, built, options } = makeStore();

    const first = store.provision(options());
    const second = store.provision(options());

    expect(first).toBe(second);
    expect(built.length).toBe(1);
    expect(first.name).toBe('full-resolution/full-extent');
    expect(first.coverage).toBe('full-extent');
  });

  it('counts the cost before it builds anything, and refuses a grid over the limits', () => {
    const { store, built, options } = makeStore();

    expect(store.costOf(makeGrid([4, 4, 4]), 'Float32Array')).toBe(256);

    const refused = store.provision(
      options({ grids: [makeGrid([4096, 16, 16])], limits: { maxEdge: 2048 } })
    );

    expect(refused).toBeUndefined();
    expect(built.length).toBe(0);
  });

  it('lists the sets of one volume, and keeps the volumes apart', () => {
    const { store, options } = makeStore();

    store.provision(options());
    store.provision(options({ name: 'reduced/full-extent' }));
    store.provision(options({ volumeId: 'volume-2' }));

    expect(store.setsOfVolume('volume-1').map((set) => set.name)).toEqual([
      'full-resolution/full-extent',
      'reduced/full-extent',
    ]);
    expect(store.setsOfVolume('volume-2').length).toBe(1);
  });
});

describe('the store counts one global budget', () => {
  it('has no budget until a caller states one', () => {
    const { store, options } = makeStore();

    expect(store.budget).toBe(0);
    expect(store.bytesAvailable).toBe(Number.POSITIVE_INFINITY);

    store.provision(options());

    // 64 x 64 x 16 voxels of 4 bytes.
    expect(store.bytesUsed).toBe(64 * 64 * 16 * 4);
  });

  it('counts the bytes of every volume together', () => {
    const { store, options } = makeStore();

    store.provision(options());
    store.provision(options({ volumeId: 'volume-2' }));

    expect(store.bytesUsed).toBe(2 * 64 * 64 * 16 * 4);
  });

  it('evicts the least recently used set that nothing holds', () => {
    const { store, destroyed, options } = makeStore();
    const oneSet = 64 * 64 * 16 * 4;

    store.setBudget(2 * oneSet);
    store.provision(options({ name: 'a' }));
    store.provision(options({ name: 'b' }));

    expect(store.provision(options({ name: 'c' }))).toBeDefined();
    // `a` is the older one, so `a` leaves first.
    expect(store.getSet('volume-1', 'a')).toBeUndefined();
    expect(store.getSet('volume-1', 'b')).toBeDefined();
    expect(destroyed.length).toBe(1);
  });

  it('never evicts a set that a viewport holds, and refuses instead', () => {
    const { store, options } = makeStore();
    const oneSet = 64 * 64 * 16 * 4;

    store.setBudget(2 * oneSet);
    store.provision(options({ name: 'a' }));
    store.provision(options({ name: 'b' }));
    store.claim('volume-1', 'a');
    store.claim('volume-1', 'b');

    expect(store.provision(options({ name: 'c' }))).toBeUndefined();
    expect(store.getSet('volume-1', 'a')).toBeDefined();
    expect(store.getSet('volume-1', 'b')).toBeDefined();
  });

  it('evicts nothing when all the idle sets together cannot make room', () => {
    const { store, destroyed, options } = makeStore();
    const slab = (depth) => ({ grids: [makeGrid([64, 64, depth])] });
    const oneSlab = 64 * 64 * 4;

    store.setBudget(10 * oneSlab);
    store.provision(options({ name: 'held', ...slab(7) }));
    store.claim('volume-1', 'held');
    store.provision(options({ name: 'idle-1', ...slab(1) }));
    store.provision(options({ name: 'idle-2', ...slab(1) }));

    expect(
      store.provision(options({ name: 'new', ...slab(4) }))
    ).toBeUndefined();
    expect(store.getSet('volume-1', 'idle-1')).toBeDefined();
    expect(store.getSet('volume-1', 'idle-2')).toBeDefined();
    expect(destroyed.length).toBe(0);
  });

  it('evicts a backstop set last, so a fill always finds a source', () => {
    const { store, options } = makeStore();
    const oneSet = 64 * 64 * 16 * 4;

    store.setBudget(2 * oneSet);
    // The backstop is provisioned first, so a rule that read the age alone
    // would take it first.
    store.provision(options({ name: 'backstop', backstop: true }));
    store.provision(options({ name: 'b' }));

    store.provision(options({ name: 'c' }));

    expect(store.getSet('volume-1', 'backstop')).toBeDefined();
    expect(store.getSet('volume-1', 'b')).toBeUndefined();
  });

  it('releases every texture of a set that it evicts', () => {
    const { store, destroyed, options } = makeStore();

    store.provision(options({ grids: brickGrids(32) }));
    store.evict('volume-1', 'full-resolution/full-extent');

    expect(destroyed.length).toBe(brickGrids(32).length);
    expect(store.bytesUsed).toBe(0);
  });
});

describe('the dirty marks of a set', () => {
  it('marks a region dirty in the bricks that cover it, and in no other', () => {
    const { store, options } = makeStore();
    const set = store.provision(options({ grids: brickGrids(16) }));

    for (const member of set.members()) {
      member.dirty = [];
    }

    const marked = [];

    set.markDirty(
      [
        [0, 3],
        [0, 3],
        [0, 3],
      ],
      (slot, slice) => marked.push([slot.id, slice])
    );

    const dirty = set.members().filter((member) => member.dirty.length > 0);

    expect(dirty.length).toBe(1);
    expect(dirty[0].grid.origin).toEqual([0, 0, 0]);
    expect(marked.length).toBe(4);
  });
});
