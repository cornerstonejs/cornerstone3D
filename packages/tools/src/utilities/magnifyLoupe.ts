import type {
  PlanarViewport,
  PlanarViewState,
  Types,
} from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import {
  applyViewportPresentation,
  getViewportZoomPan,
} from './viewportPresentation';

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
 * Mounts on a loupe the display sets of the planar viewport that it
 * magnifies, in the orientation of the view of that viewport: its source
 * display set and its overlays, as a fusion. A stack shows its images, a
 * volume shows its slices.
 *
 * @returns False when the source viewport shows nothing.
 */
export async function mountLoupeSource(
  sourceViewport: PlanarViewport,
  loupeViewport: PlanarViewport
): Promise<boolean> {
  const displaySets = getMagnifiedDisplaySets(sourceViewport);

  if (!sourceViewport.getSourceDataId() || !displaySets.length) {
    return false;
  }

  const { orientation } = sourceViewport.getViewState();

  await loupeViewport.setDisplaySets(
    ...displaySets.map(({ displaySetId, role }) => ({
      displaySetId,
      options: { orientation, role },
    }))
  );

  return true;
}

/**
 * Makes a loupe show what its source viewport shows around a world point.
 *
 * Each display set of the loupe takes the presentation that it has on the
 * source (window, invert, colormap, opacity and the rest), and the loupe
 * takes from the view state of the source the orientation, the slice, the
 * rotation and the flips. The world point goes to the centre of the loupe.
 * The zoom of the loupe is set through the projection service so that one
 * canvas pixel of the loupe spans `worldPerPixel` along its height.
 */
export function syncLoupeWithSource(
  sourceViewport: PlanarViewport,
  loupeViewport: PlanarViewport,
  worldPoint: Types.Point3,
  worldPerPixel: number
): void {
  if (
    !sourceViewport.getSourceDataId() ||
    loupeViewport.getCurrentMode() === 'empty'
  ) {
    return;
  }

  getMagnifiedDisplaySets(loupeViewport).forEach(({ displaySetId }) => {
    const presentation = sourceViewport.getDisplaySetPresentation(displaySetId);

    if (presentation) {
      loupeViewport.setDisplaySetPresentation(displaySetId, presentation);
    }
  });

  const { orientation, slice, rotation, flipHorizontal, flipVertical } =
    sourceViewport.getViewState();
  const viewState: Partial<PlanarViewState> = {
    orientation,
    rotation,
    flipHorizontal,
    flipVertical,
    anchorWorld: [worldPoint[0], worldPoint[1], worldPoint[2]],
    anchorCanvas: [0.5, 0.5],
    displayArea: undefined,
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

  applyViewportPresentation(loupeViewport, {
    zoom: (zoomPan.zoom * currentWorldPerPixel) / worldPerPixel,
  });
}
