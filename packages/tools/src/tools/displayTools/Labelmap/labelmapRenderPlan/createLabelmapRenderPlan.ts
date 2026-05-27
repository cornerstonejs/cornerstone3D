import type { Types } from '@cornerstonejs/core';
import { getLabelmapActorEntries } from '../../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { removeLabelmapRepresentationFromViewport } from './removeLabelmapRepresentationFromViewport';
import type { CreateLabelmapRenderPlanArgs, LabelmapRenderPlan } from './types';

function createLabelmapRenderPlan({
  isVolumeImageMapper,
  kind,
  renderMode,
  segmentationId,
  unsupportedStateKey,
  updateAfterMount = true,
  useSliceRendering,
  viewport,
  canRenderCurrentViewport = () => kind !== 'unsupported',
  getExpectedRepresentationUIDs = () => [],
  mount = async () => undefined,
  update = () => undefined,
}: CreateLabelmapRenderPlanArgs): LabelmapRenderPlan {
  const remove = () =>
    removeLabelmapRepresentationFromViewport(viewport, segmentationId);
  const needsRemount = (actorEntries?: Types.ActorEntry[]) =>
    haveActorUIDsChanged(actorEntries, getExpectedRepresentationUIDs());

  return {
    kind,
    renderMode,
    useSliceRendering,
    isVolumeImageMapper,
    unsupportedStateKey,
    getExpectedRepresentationUIDs,
    mount,
    needsRemount,
    remove,
    update,
    reconcile: async ({ actorEntries, labelMapData }) => {
      if (!canRenderCurrentViewport()) {
        return actorEntries;
      }

      let nextActorEntries = actorEntries;

      if (needsRemount(nextActorEntries) && nextActorEntries?.length) {
        remove();
        nextActorEntries = undefined;
      }

      const mounted = !nextActorEntries?.length;

      if (mounted) {
        await mount({ labelMapData });
      }

      nextActorEntries = getLabelmapActorEntries(viewport.id, segmentationId);

      if (nextActorEntries?.length && (!mounted || updateAfterMount)) {
        update({ actorEntries: nextActorEntries });
      }

      return nextActorEntries;
    },
  };
}

function haveActorUIDsChanged(
  actorEntries: Types.ActorEntry[] | undefined,
  expectedRepresentationUIDs: string[]
): boolean {
  const actualUIDs = new Set(
    (actorEntries ?? []).map((entry) => entry.representationUID)
  );
  const expectedUIDs = new Set(expectedRepresentationUIDs);

  if (actualUIDs.size !== expectedUIDs.size) {
    return true;
  }

  for (const expectedUID of expectedUIDs) {
    if (!actualUIDs.has(expectedUID)) {
      return true;
    }
  }

  return false;
}

export { createLabelmapRenderPlan };
