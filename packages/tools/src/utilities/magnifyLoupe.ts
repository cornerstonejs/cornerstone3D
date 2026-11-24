import type {
  PlanarViewport,
  PlanarViewState,
  Types,
} from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import { applyViewportFraming, getViewportZoomPan } from './viewportFraming';

/**
 * The world distance between two canvas points one pixel apart along the
 * height of a viewport. It follows the zoom of the view, as the parallel
 * scale of a camera: the world height that a viewport shows is this times
 * the height of its canvas.
 */
export function getWorldHeightPerPixel(viewport: {
  canvasToWorld(canvasPos: Types.Point2): Types.Point3;
}): number {
  const top = viewport.canvasToWorld([0, 0]);
  const bottom = viewport.canvasToWorld([0, 1]);

  return vec3.distance(top as vec3, bottom as vec3);
}

/**
 * The display sets of a planar viewport that a loupe shows, in mount order
 * with their roles: all but the labelmaps, which the tools mount as display
 * sets named by the representation of the segmentation and which a loupe
 * gets as segmentation representations.
 */
function getMagnifiedDisplaySets(
  viewport: PlanarViewport
): Array<{ displaySetId: string; role?: 'source' | 'overlay' }> {
  const labelmapIds = new Set(
    viewport
      .getActors()
      .map(({ representationUID }) => representationUID)
      .filter(Boolean)
  );

  return viewport
    .getDisplaySets()
    .filter(({ displaySetId }) => !labelmapIds.has(displaySetId))
    .map(({ displaySetId, options }) => ({
      displaySetId,
      role: (options as { role?: 'source' | 'overlay' } | undefined)?.role,
    }));
}

/**
 * The mode of each display set of a planar viewport, from its render plan:
 * 'stack' for a layer that draws the acquired frames of a stack, 'volume'
 * for a layer that draws a slice of a volume.
 */
function getMountedModes(
  viewport: PlanarViewport
): Map<string, 'stack' | 'volume'> {
  return new Map(
    viewport
      .getRenderPlan()
      .map(({ displaySetId, slice }) => [
        displaySetId,
        slice === 'frame' ? 'stack' : 'volume',
      ])
  );
}

/**
 * Mounts on a loupe the display sets of the planar viewport that it
 * magnifies, in the orientation of the view of that viewport and in the
 * mode that each has there: its source display set and its overlays, as a
 * fusion. A stack shows its images, a volume shows its slices.
 *
 * @returns False when the source viewport shows nothing.
 */
export async function mountLoupeSource(
  sourceViewport: PlanarViewport,
  loupeViewport: PlanarViewport
): Promise<boolean> {
  const displaySets = getMagnifiedDisplaySets(sourceViewport);

  if (!sourceViewport.getSourceDisplaySetId() || !displaySets.length) {
    return false;
  }

  const { orientation } = sourceViewport.getViewState();
  const modes = getMountedModes(sourceViewport);

  await loupeViewport.setDisplaySets(
    ...displaySets.map(({ displaySetId, role }) => ({
      displaySetId,
      options: { orientation, role, mode: modes.get(displaySetId) },
    }))
  );

  return true;
}

/**
 * Makes a loupe show what its source viewport shows around a world point.
 *
 * Each display set of the loupe takes the appearance that it has on the
 * source (window, invert, colormap, opacity and the rest); a key that the
 * source no longer has, as after `resetDisplaySetAppearance` of the source,
 * resets the appearance of the loupe first, since a set merges. The loupe
 * takes from the view state of the source the orientation, the slice, the
 * rotation and the flips, and the stretch: the ratio of the horizontal to the
 * vertical scale that the source resolves to, from its `scale`, its scale
 * mode or its display area. The world point goes to the centre of the loupe.
 * The zoom of the loupe is set through the projection service so that one
 * canvas pixel of the loupe spans `worldPerPixel` along its height, and the
 * zoom keeps the stretch.
 */
export function syncLoupeWithSource(
  sourceViewport: PlanarViewport,
  loupeViewport: PlanarViewport,
  worldPoint: Types.Point3,
  worldPerPixel: number
): void {
  if (
    !sourceViewport.getSourceDisplaySetId() ||
    loupeViewport.getCurrentMode() === 'empty'
  ) {
    return;
  }

  getMagnifiedDisplaySets(loupeViewport).forEach(({ displaySetId }) => {
    const appearance = sourceViewport.getDisplaySetAppearance(displaySetId);

    if (!appearance) {
      return;
    }

    const loupeAppearance =
      loupeViewport.getDisplaySetAppearance(displaySetId) ?? {};

    if (Object.keys(loupeAppearance).some((key) => !(key in appearance))) {
      loupeViewport.resetDisplaySetAppearance(displaySetId);
    }

    loupeViewport.setDisplaySetAppearance(displaySetId, appearance);
  });

  const { orientation, slice, rotation, flipHorizontal, flipVertical } =
    sourceViewport.getViewState();
  const sourceScale = getViewportZoomPan(sourceViewport)?.scale ?? [1, 1];
  const viewState: Partial<PlanarViewState> = {
    orientation,
    rotation,
    flipHorizontal,
    flipVertical,
    anchorWorld: [worldPoint[0], worldPoint[1], worldPoint[2]],
    anchorCanvas: [0.5, 0.5],
    displayArea: undefined,
    scale: [sourceScale[0] / sourceScale[1], 1],
    scaleMode: 'fit',
  };

  if (slice) {
    viewState.slice = slice;
  }

  loupeViewport.setViewState(viewState);

  const zoomPan = getViewportZoomPan(loupeViewport);
  const currentWorldPerPixel = getWorldHeightPerPixel(loupeViewport);

  if (!zoomPan || !(currentWorldPerPixel > 0) || !(worldPerPixel > 0)) {
    return;
  }

  applyViewportFraming(loupeViewport, {
    zoom: (zoomPan.zoom * currentWorldPerPixel) / worldPerPixel,
  });
}
