import type { Types } from '@cornerstonejs/core';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import type { SpatialLinkOptions } from './types';

function getFrameOfReferenceUID(
  viewport: Types.IViewport
): string | undefined {
  return viewport.getFrameOfReferenceUID?.();
}

function hasRegistrationTransform(
  sourceFrameOfReferenceUID: string,
  targetFrameOfReferenceUID: string,
  options: SpatialLinkOptions
): boolean {
  const { registrationTransforms } = options;
  if (!registrationTransforms?.size) {
    return false;
  }

  return (
    registrationTransforms.has(
      `${sourceFrameOfReferenceUID}:${targetFrameOfReferenceUID}`
    ) ||
    registrationTransforms.has(
      `${targetFrameOfReferenceUID}:${sourceFrameOfReferenceUID}`
    )
  );
}

/**
 * Decides whether two viewports are spatially linked, i.e. whether it is
 * meaningful to draw spatially authoritative overlays (reference points,
 * slice intersection lines) from one viewport into the other.
 *
 * - policy 'frameOfReferenceUID': both viewports must report the same
 *   FrameOfReferenceUID, unless a registration transform is provided for the
 *   pair of frames of reference. Viewports without a FrameOfReferenceUID are
 *   never considered linked under this policy.
 * - policy 'explicit': the pair must appear in `options.explicitLinks`
 *   (either direction).
 * - policy 'toolGroup': both viewports must belong to the same tool group.
 *
 * Note this deliberately does not compare volume/image IDs: two viewports
 * showing different series of the same study share a FrameOfReferenceUID and
 * are spatially comparable.
 */
export default function areViewportsSpatiallyLinked(
  source: Types.IViewport,
  target: Types.IViewport,
  options: SpatialLinkOptions
): boolean {
  if (!source || !target || !options?.policy) {
    return false;
  }

  switch (options.policy) {
    case 'frameOfReferenceUID': {
      const sourceFrameOfReferenceUID = getFrameOfReferenceUID(source);
      const targetFrameOfReferenceUID = getFrameOfReferenceUID(target);

      if (!sourceFrameOfReferenceUID || !targetFrameOfReferenceUID) {
        return false;
      }

      if (sourceFrameOfReferenceUID === targetFrameOfReferenceUID) {
        return true;
      }

      return hasRegistrationTransform(
        sourceFrameOfReferenceUID,
        targetFrameOfReferenceUID,
        options
      );
    }

    case 'explicit': {
      const { explicitLinks } = options;
      if (!explicitLinks?.length) {
        return false;
      }

      return explicitLinks.some(
        (link) =>
          (link.sourceViewportId === source.id &&
            link.targetViewportId === target.id) ||
          (link.sourceViewportId === target.id &&
            link.targetViewportId === source.id)
      );
    }

    case 'toolGroup': {
      const sourceToolGroup = getToolGroupForViewport(
        source.id,
        source.renderingEngineId
      );
      const targetToolGroup = getToolGroupForViewport(
        target.id,
        target.renderingEngineId
      );

      return (
        !!sourceToolGroup && !!targetToolGroup &&
        sourceToolGroup.id === targetToolGroup.id
      );
    }

    default:
      return false;
  }
}
