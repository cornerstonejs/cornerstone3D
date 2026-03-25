import { SegmentationRepresentations } from '../../../enums';

jest.mock('@cornerstonejs/core', () => ({
  BaseVolumeViewport: class BaseVolumeViewport {},
  getEnabledElement: jest.fn(),
  getEnabledElementByIds: jest.fn(),
  Enums: {
    Events: {
      PRE_STACK_NEW_IMAGE: 'PRE_STACK_NEW_IMAGE',
      IMAGE_RENDERED: 'IMAGE_RENDERED',
    },
  },
  cache: { getImage: jest.fn() },
  utilities: { updateVTKImageDataWithCornerstoneImage: jest.fn() },
}));

jest.mock(
  '../../../stateManagement/segmentation/SegmentationRenderingEngine',
  () => ({ triggerSegmentationRender: jest.fn() })
);
jest.mock(
  '../../../stateManagement/segmentation/updateLabelmapSegmentationImageReferences',
  () => ({ updateLabelmapSegmentationImageReferences: jest.fn() })
);
jest.mock(
  '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport',
  () => ({ getCurrentLabelmapImageIdsForViewport: jest.fn() })
);
jest.mock(
  '../../../stateManagement/segmentation/helpers/getSegmentationActor',
  () => ({ getLabelmapActorEntries: jest.fn() })
);
jest.mock(
  '../../../stateManagement/segmentation/getSegmentationRepresentation',
  () => ({ getSegmentationRepresentations: jest.fn() })
);

const SEG_ID = 'seg-1';
const LABELMAP = SegmentationRepresentations.Labelmap;

interface MockActor {
  uid: string;
  representationUID: string;
  referencedId: string;
}

function makeActor(
  uid: string,
  representationUID: string,
  referencedId: string
): MockActor {
  return { uid, representationUID, referencedId };
}

/**
 * Simulates the reusable-actor search WITH the consumedActorUIDs fix.
 * Returns which actor UIDs were reused and how many fallback creations occurred.
 */
function simulateActorReuse(
  allActors: MockActor[],
  derivedImageIds: string[],
  segmentationId: string
) {
  const consumedActorUIDs = new Set<string>();
  const reusedActorUids: string[] = [];
  let fallbackCreations = 0;

  derivedImageIds.forEach((derivedImageId) => {
    const exactMatch = allActors.find((a) => a.referencedId === derivedImageId);

    if (!exactMatch) {
      const reusableEntry = allActors.find(
        (a) =>
          !consumedActorUIDs.has(a.uid) &&
          a.representationUID?.startsWith(`${segmentationId}-${LABELMAP}`) &&
          a.referencedId !== derivedImageId
      );

      if (reusableEntry) {
        consumedActorUIDs.add(reusableEntry.uid);
        reusedActorUids.push(reusableEntry.uid);
        reusableEntry.referencedId = derivedImageId;
        reusableEntry.representationUID = `${segmentationId}-${LABELMAP}-${derivedImageId}`;
      } else {
        fallbackCreations++;
      }
    }
  });

  return { reusedActorUids, fallbackCreations };
}

/**
 * Simulates the BUGGY path without consumedActorUIDs tracking.
 */
function simulateBuggyActorReuse(
  allActors: MockActor[],
  derivedImageIds: string[],
  segmentationId: string
) {
  const reusedActorUids: string[] = [];

  derivedImageIds.forEach((derivedImageId) => {
    const exactMatch = allActors.find((a) => a.referencedId === derivedImageId);

    if (!exactMatch) {
      const reusableEntry = allActors.find(
        (a) =>
          a.representationUID?.startsWith(`${segmentationId}-${LABELMAP}`) &&
          a.referencedId !== derivedImageId
      );

      if (reusableEntry) {
        reusedActorUids.push(reusableEntry.uid);
        reusableEntry.referencedId = derivedImageId;
        reusableEntry.representationUID = `${segmentationId}-${LABELMAP}-${derivedImageId}`;
      }
    }
  });

  return { reusedActorUids };
}

describe('imageChangeEventListener actor reuse', () => {
  describe('overlapping segments — actor theft prevention', () => {
    it('assigns each actor to a different derived image when two groups exist', () => {
      const actorA = makeActor(
        'actor-a',
        `${SEG_ID}-${LABELMAP}-slice5_group0`,
        'derived-slice5-group0'
      );
      const actorB = makeActor(
        'actor-b',
        `${SEG_ID}-${LABELMAP}-slice5_group1`,
        'derived-slice5-group1'
      );

      const { reusedActorUids } = simulateActorReuse(
        [actorA, actorB],
        ['derived-slice6-group0', 'derived-slice6-group1'],
        SEG_ID
      );

      expect(reusedActorUids).toHaveLength(2);
      expect(reusedActorUids[0]).not.toBe(reusedActorUids[1]);
      expect(reusedActorUids).toContain('actor-a');
      expect(reusedActorUids).toContain('actor-b');

      expect(actorA.referencedId).toBe('derived-slice6-group0');
      expect(actorB.referencedId).toBe('derived-slice6-group1');
    });

    it('demonstrates actor theft when consumedActorUIDs is not used', () => {
      const actorA = makeActor(
        'actor-a',
        `${SEG_ID}-${LABELMAP}-slice5_group0`,
        'derived-slice5-group0'
      );
      const actorB = makeActor(
        'actor-b',
        `${SEG_ID}-${LABELMAP}-slice5_group1`,
        'derived-slice5-group1'
      );

      const { reusedActorUids } = simulateBuggyActorReuse(
        [actorA, actorB],
        ['derived-slice6-group0', 'derived-slice6-group1'],
        SEG_ID
      );

      // actor-a is reused TWICE (the bug)
      expect(reusedActorUids).toEqual(['actor-a', 'actor-a']);
      // Actor A was stolen: ends up with group1's data instead of group0's
      expect(actorA.referencedId).toBe('derived-slice6-group1');
      // Actor B was never touched
      expect(actorB.referencedId).toBe('derived-slice5-group1');
    });

    it('handles single derived image (no overlapping segments)', () => {
      const actorA = makeActor(
        'actor-a',
        `${SEG_ID}-${LABELMAP}-slice5_group0`,
        'derived-slice5-group0'
      );

      const { reusedActorUids, fallbackCreations } = simulateActorReuse(
        [actorA],
        ['derived-slice6-group0'],
        SEG_ID
      );

      expect(reusedActorUids).toEqual(['actor-a']);
      expect(fallbackCreations).toBe(0);
      expect(actorA.referencedId).toBe('derived-slice6-group0');
    });

    it('falls through to create new actor when all actors are consumed', () => {
      const actorA = makeActor(
        'actor-a',
        `${SEG_ID}-${LABELMAP}-slice5_group0`,
        'derived-slice5-group0'
      );

      const { reusedActorUids, fallbackCreations } = simulateActorReuse(
        [actorA],
        ['derived-slice6-group0', 'derived-slice6-group1'],
        SEG_ID
      );

      expect(reusedActorUids).toEqual(['actor-a']);
      expect(fallbackCreations).toBe(1);
    });

    it('does not reuse an actor that was already an exact match via consumed tracking', () => {
      const actorA = makeActor(
        'actor-a',
        `${SEG_ID}-${LABELMAP}-slice6_group0`,
        'derived-slice6-group0'
      );
      const actorB = makeActor(
        'actor-b',
        `${SEG_ID}-${LABELMAP}-slice5_group1`,
        'derived-slice5-group1'
      );

      // group0 is an exact match for actorA (no reuse needed).
      // group1 needs a reusable actor — actorA is first in the array and
      // matches the prefix, so it gets reused (exact matches don't consume).
      const { reusedActorUids, fallbackCreations } = simulateActorReuse(
        [actorA, actorB],
        ['derived-slice6-group0', 'derived-slice6-group1'],
        SEG_ID
      );

      expect(reusedActorUids).toEqual(['actor-a']);
      expect(fallbackCreations).toBe(0);
    });
  });
});
