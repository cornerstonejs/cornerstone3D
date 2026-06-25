import { SegmentationRepresentations } from '../../../enums';

const SEG_ID = 'seg-1';
const LABELMAP = SegmentationRepresentations.Labelmap;

interface MockActorEntry {
  uid: string;
  representationUID: string;
  referencedId: string;
}

function makeActor(
  uid: string,
  referencedId: string
): MockActorEntry {
  return {
    uid,
    referencedId,
    representationUID: `${SEG_ID}-${LABELMAP}-${referencedId}`,
  };
}

/**
 * Mirrors the in-place actor reuse algorithm implemented by
 * {@link syncStackLabelmapActors} for the legacy StackViewport path:
 *
 * - actors whose referencedId is no longer among the current slice's derived
 *   image ids form a reuse pool;
 * - each derived image id reuses (consumes) one pooled actor at most once so
 *   overlapping segment groups cannot steal one another's actor;
 * - when the pool is empty a new actor is created;
 * - pooled actors that are never reused are removed.
 */
function simulateSync(
  existingActors: MockActorEntry[],
  derivedImageIds: string[],
  segmentationId: string
) {
  const derivedImageIdSet = new Set(derivedImageIds);
  const reusablePool = existingActors.filter(
    (actor) => !derivedImageIdSet.has(actor.referencedId)
  );

  const updatedInPlaceUids: string[] = [];
  const reusedActorUids: string[] = [];
  let createdCount = 0;

  derivedImageIds.forEach((derivedImageId) => {
    const exactMatch = existingActors.find(
      (actor) => actor.referencedId === derivedImageId
    );

    if (exactMatch) {
      updatedInPlaceUids.push(exactMatch.uid);
      return;
    }

    const reusable = reusablePool.shift();

    if (reusable) {
      reusedActorUids.push(reusable.uid);
      reusable.referencedId = derivedImageId;
      reusable.representationUID = `${segmentationId}-${LABELMAP}-${derivedImageId}`;
      return;
    }

    createdCount++;
  });

  const removedActorUids = reusablePool.map((actor) => actor.uid);

  return { updatedInPlaceUids, reusedActorUids, createdCount, removedActorUids };
}

/**
 * The pre-fix path: it picked a reusable actor from the pool without consuming
 * it, so two derived images (overlapping segment groups) could resolve to the
 * same actor (actor theft), leaving the other group invisible.
 */
function simulateBuggyReuse(
  existingActors: MockActorEntry[],
  derivedImageIds: string[]
) {
  const derivedImageIdSet = new Set(derivedImageIds);
  const reusablePool = existingActors.filter(
    (actor) => !derivedImageIdSet.has(actor.referencedId)
  );
  const reusedActorUids: string[] = [];

  derivedImageIds.forEach((derivedImageId) => {
    const exactMatch = existingActors.find(
      (actor) => actor.referencedId === derivedImageId
    );

    if (exactMatch) {
      return;
    }

    const reusable = reusablePool[0]; // BUG: pool entry is never consumed

    if (reusable) {
      reusedActorUids.push(reusable.uid);
    }
  });

  return { reusedActorUids };
}

describe('syncStackLabelmapActors in-place actor reuse', () => {
  it('reuses a single actor on a normal scroll (no create, no remove)', () => {
    const actorA = makeActor('actor-a', 'derived-slice5');

    const result = simulateSync([actorA], ['derived-slice6'], SEG_ID);

    expect(result.reusedActorUids).toEqual(['actor-a']);
    expect(result.createdCount).toBe(0);
    expect(result.removedActorUids).toEqual([]);
    expect(actorA.referencedId).toBe('derived-slice6');
  });

  it('assigns a distinct actor to each overlapping segment group', () => {
    const actorA = makeActor('actor-a', 'derived-slice5-group0');
    const actorB = makeActor('actor-b', 'derived-slice5-group1');

    const result = simulateSync(
      [actorA, actorB],
      ['derived-slice6-group0', 'derived-slice6-group1'],
      SEG_ID
    );

    expect(result.reusedActorUids).toHaveLength(2);
    expect(result.reusedActorUids[0]).not.toBe(result.reusedActorUids[1]);
    expect(result.reusedActorUids).toEqual(['actor-a', 'actor-b']);
    expect(actorA.referencedId).toBe('derived-slice6-group0');
    expect(actorB.referencedId).toBe('derived-slice6-group1');
    expect(result.createdCount).toBe(0);
    expect(result.removedActorUids).toEqual([]);
  });

  it('creates a new actor only once the reuse pool is exhausted', () => {
    const actorA = makeActor('actor-a', 'derived-slice5-group0');

    const result = simulateSync(
      [actorA],
      ['derived-slice6-group0', 'derived-slice6-group1'],
      SEG_ID
    );

    expect(result.reusedActorUids).toEqual(['actor-a']);
    expect(result.createdCount).toBe(1);
    expect(result.removedActorUids).toEqual([]);
  });

  it('removes pooled actors that are not reused when groups shrink', () => {
    const actorA = makeActor('actor-a', 'derived-slice5-group0');
    const actorB = makeActor('actor-b', 'derived-slice5-group1');

    const result = simulateSync([actorA, actorB], ['derived-slice6'], SEG_ID);

    expect(result.reusedActorUids).toEqual(['actor-a']);
    expect(result.removedActorUids).toEqual(['actor-b']);
    expect(result.createdCount).toBe(0);
  });

  it('updates an exact-match actor in place without consuming the reuse pool', () => {
    // group0 already references the current derived image (exact match);
    // group1 needs a reusable actor from the pool.
    const actorExact = makeActor('actor-exact', 'derived-slice6-group0');
    const actorStale = makeActor('actor-stale', 'derived-slice5-group1');

    const result = simulateSync(
      [actorExact, actorStale],
      ['derived-slice6-group0', 'derived-slice6-group1'],
      SEG_ID
    );

    expect(result.updatedInPlaceUids).toEqual(['actor-exact']);
    expect(result.reusedActorUids).toEqual(['actor-stale']);
    expect(result.createdCount).toBe(0);
    expect(result.removedActorUids).toEqual([]);
  });

  it('demonstrates the actor theft that consumption prevents', () => {
    const actorA = makeActor('actor-a', 'derived-slice5-group0');
    const actorB = makeActor('actor-b', 'derived-slice5-group1');

    const { reusedActorUids } = simulateBuggyReuse(
      [actorA, actorB],
      ['derived-slice6-group0', 'derived-slice6-group1']
    );

    // actor-a is stolen for both groups; actor-b is never used.
    expect(reusedActorUids).toEqual(['actor-a', 'actor-a']);
  });
});
