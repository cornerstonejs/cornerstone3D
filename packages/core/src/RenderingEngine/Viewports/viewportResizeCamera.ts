import type { Point2 } from '../../types';
import type { ViewAnchor } from './ViewportCameraTypes';

/** The size of a canvas in CSS pixels. */
export type ResizeCanvasSize = { width: number; height: number };

/** The keys of a 2D view state that place its picture on the canvas. */
export type ResizeAnchoredViewState = {
  anchorCanvas: ViewAnchor;
  anchorWorld: [number, number];
  scale: number;
};

/**
 * The view state that keeps the camera of a 2D view that draws itself (the
 * video and the ECG viewport) through a change of the size of its canvas, as
 * the planar viewport keeps its parallel scale and its focal point
 * (`PlanarViewport.keepCameraThroughResize`): the point of the picture at the
 * centre of the canvas stays at the centre, and the height of the canvas in
 * units of the picture stays. Across a change of the width the picture keeps
 * its size in pixels and its distance from the centre; across a change of
 * the height it scales with the canvas. The zoom read after it is against
 * the fit of the new size, so it changes where the fit changes.
 *
 * The anchor of the result is the centre of the canvas, which the video also
 * turns about, so a turned picture keeps its turn about the same point.
 *
 * @param args.previousSize - The size the view was laid out at.
 * @param args.nextSize - The size of the canvas now.
 * @param args.previousCentre - The point, in the units of `anchorWorld`, at
 *   the centre of the canvas of the previous size.
 * @param args.previousRatio - The canvas pixels of one unit of `anchorWorld`
 *   on the previous canvas, with the zoom.
 * @param args.nextFitRatio - The canvas pixels of one unit of `anchorWorld`
 *   at zoom 1 on the canvas now.
 * @returns The keys to set, or undefined when the size did not change or a
 *   size or a ratio is not above 0.
 */
export function getViewStateKeptThroughResize(args: {
  previousSize: ResizeCanvasSize;
  nextSize: ResizeCanvasSize;
  previousCentre: Point2;
  previousRatio: number;
  nextFitRatio: number;
}): ResizeAnchoredViewState | undefined {
  const {
    previousSize,
    nextSize,
    previousCentre,
    previousRatio,
    nextFitRatio,
  } = args;

  if (
    !(previousSize.width > 0) ||
    !(previousSize.height > 0) ||
    !(nextSize.width > 0) ||
    !(nextSize.height > 0) ||
    !(previousRatio > 0) ||
    !(nextFitRatio > 0) ||
    !Number.isFinite(previousCentre[0]) ||
    !Number.isFinite(previousCentre[1]) ||
    (previousSize.width === nextSize.width &&
      previousSize.height === nextSize.height)
  ) {
    return;
  }

  const nextRatio = (previousRatio * nextSize.height) / previousSize.height;

  return {
    anchorCanvas: [0.5, 0.5],
    anchorWorld: [previousCentre[0], previousCentre[1]],
    scale: nextRatio / nextFitRatio,
  };
}
