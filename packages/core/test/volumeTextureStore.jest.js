import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { VolumeTextureStore } from '../src/cache/volumeTextureStore';
import { isMutableSlab } from '../src/cache/classes/VolumeTextureSet';

// The global store of the named texture sets. A set is the unit of storage, of
// cost and of EVICTION, and a selection reads the stored sets instead of
// building anything.
//
// NONE OF THESE TESTS NEEDS A GPU. A fake texture object stands in for the real
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

/** A set of bricks that tile the volume, for the area index. */
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

  it('evicts a backstop set last, so a fill always finds a source', () => {
    const { store, options } = makeStore();
    const oneSet = 64 * 64 * 16 * 4;

    store.setBudget(2 * oneSet);
    // The backstop is provisioned FIRST, so a rule that read the age alone
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

describe('the area index of a set', () => {
  it('answers a full-extent set of one member directly', () => {
    const { store, options } = makeStore();
    const set = store.provision(options());

    expect(
      set.membersCovering([
        [0, 0],
        [0, 0],
        [0, 0],
      ]).length
    ).toBe(1);
  });

  it('gives only the bricks that meet a region', () => {
    const { store, options } = makeStore();
    const set = store.provision(options({ grids: brickGrids(16) }));

    expect(set.size).toBe(4 * 4 * 1);

    const corner = set.membersCovering([
      [0, 3],
      [0, 3],
      [0, 3],
    ]);

    expect(corner.length).toBe(1);
    expect(corner[0].grid.origin).toEqual([0, 0, 0]);

    // A region that straddles two bricks on one axis gives both.
    const straddle = set.membersCovering([
      [14, 18],
      [0, 3],
      [0, 3],
    ]);

    expect(straddle.length).toBe(2);
  });

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

describe('a slab that re-points, and that one viewport owns', () => {
  function makeSlab(store, options, overrides = {}) {
    const set = store.provision(
      options({
        name: 'oblique-slab',
        ownerId: 'viewport-1',
        grids: [makeGrid([64, 64, 25])],
        ...overrides,
      })
    );

    return set.members()[0];
  }

  it('is a different kind of texture, and the attribute says so', () => {
    const { store, options } = makeStore();
    const slab = makeSlab(store, options);

    expect(slab.mutability).toBe('owned');
    expect(isMutableSlab(slab)).toBe(true);
    expect(slab.ownerId).toBe('viewport-1');
  });

  it('holds two textures, and counts both', () => {
    const { store, built, options } = makeStore();
    const slab = makeSlab(store, options);

    expect(built.length).toBe(2);
    expect(slab.bytes).toBe(2 * 64 * 64 * 25 * 4);
  });

  it('re-points the back texture, and a draw keeps reading the front', () => {
    const { store, options } = makeStore();
    const slab = makeSlab(store, options);
    const front = slab.beginRender();
    const moved = makeGrid([64, 64, 25], [1, 1, 1], [10, 0, 0]);

    slab.retarget(moved);

    // The draw still reads the texture that it started with.
    expect(slab.grid.origin).toEqual([0, 0, 0]);
    expect(slab.pendingGrid).toBe(moved);
    expect(slab.writeTarget()).not.toBe(front);
    expect(slab.dirty.length).toBe(1);
  });

  it('defers the exchange while a draw is in flight, and completes it after', () => {
    const { store, options } = makeStore();
    const slab = makeSlab(store, options);
    const front = slab.beginRender();

    expect(slab.inFlight).toBe(true);

    slab.retarget(makeGrid([64, 64, 25], [1, 1, 1], [10, 0, 0]));

    expect(slab.publish()).toBe(false);
    expect(slab.grid.origin).toEqual([0, 0, 0]);

    slab.endRender();

    // The exchange happened when the draw stopped, so the next draw reads the
    // new basis.
    expect(slab.inFlight).toBe(false);
    expect(slab.grid.origin).toEqual([10, 0, 0]);
    expect(slab.beginRender()).not.toBe(front);
  });

  it('exchanges at once when no draw is in flight', () => {
    const { store, options } = makeStore();
    const slab = makeSlab(store, options);

    slab.retarget(makeGrid([64, 64, 25], [1, 1, 1], [10, 0, 0]));

    expect(slab.publish()).toBe(true);
    expect(slab.grid.origin).toEqual([10, 0, 0]);
    expect(slab.hasPendingFill).toBe(false);
  });

  it('publishes nothing when no fill is pending', () => {
    const { store, options } = makeStore();
    const slab = makeSlab(store, options);
    const before = slab.grid;

    slab.publish();

    expect(slab.grid).toBe(before);
  });

  it('states the grid on each texture, and again on each re-point', () => {
    const { store, applied, options } = makeStore();
    const slab = makeSlab(store, options);
    const moved = makeGrid([64, 64, 25], [1, 1, 1], [10, 0, 0]);

    // Both textures took the first grid.
    expect(applied.length).toBe(2);

    slab.retarget(moved);

    expect(applied[applied.length - 1].grid).toBe(moved);
  });
});
