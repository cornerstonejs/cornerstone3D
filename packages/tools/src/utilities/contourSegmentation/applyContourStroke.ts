/**
 * Cursor add/remove entry points per SEMANTICS.md §3.1 and §3.2.
 *
 * Polarity is explicit:
 *   - addContourStroke    → §3.2 (always union)
 *   - removeContourStroke → §3.1 (always subtract)
 *
 * Inclusion criterion per §5.0 is plane (view reference), not overlap:
 * every same-segment annotation on the same plane participates in the op.
 * Spatial overlap is not pre-filtered; Clipper decides the geometry.
 */

import type { Types } from '@cornerstonejs/core';
import type { ContourSegmentationAnnotation } from '../../types';
import { ContourWindingDirection } from '../../types/ContourAnnotation';
import {
  applyBoolean,
  BooleanOp,
  splitSelfIntersections,
  type PolygonWithHoles,
} from './clipperBooleanOps';
import { unifyWeaklyConnectedPolygons } from './bridgeWeaklyConnected';
import {
  convertContourPolylineToCanvasSpace,
  createNewAnnotationFromPolyline,
  getContourHolesData,
  updateViewportsForAnnotations,
} from './sharedOperations';
import { getAllAnnotations } from '../../stateManagement/annotation/annotationState';
import {
  addAnnotation,
  addChildAnnotation,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';
import { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';
import areSameSegment from './areSameSegment';
import isContourSegmentationAnnotation from './isContourSegmentationAnnotation';
import { hasToolByName } from '../../store/addTool';

const DEFAULT_CONTOUR_SEG_TOOL_NAME = 'PlanarFreehandContourSegmentationTool';

/** Add the stroke to the segment (§3.2). Always additive, never removes area. */
export function addContourStroke(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation
): void {
  applyStroke(viewport, sourceAnnotation, BooleanOp.Union);
}

/** Subtract the stroke from the segment (§3.1). Always subtractive, never adds area. */
export function removeContourStroke(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation
): void {
  applyStroke(viewport, sourceAnnotation, BooleanOp.Difference);
}

function applyStroke(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation,
  op: BooleanOp
): void {
  if (!hasToolByName(DEFAULT_CONTOUR_SEG_TOOL_NAME)) {
    console.warn(
      `${DEFAULT_CONTOUR_SEG_TOOL_NAME} is not registered. Cannot apply stroke.`
    );
    // The source stroke is meant to be consumed by the operation; discard it
    // so we don't leave an orphaned, never-applied annotation in state.
    removeAnnotationCompletely(sourceAnnotation);
    return;
  }

  const sourcePolyline = convertContourPolylineToCanvasSpace(
    sourceAnnotation.data.contour.polyline,
    viewport
  );
  if (sourcePolyline.length < 3) {
    // Degenerate stroke; remove it and bail.
    removeAnnotationCompletely(sourceAnnotation);
    return;
  }

  // §5.0: every same-segment annotation on the same plane participates,
  // overlap-free or not. Pull them without an intersection pre-filter.
  const targets = collectSamePlaneSegmentTargets(viewport, sourceAnnotation);

  const subjects: PolygonWithHoles[] = targets.map((t) => {
    const outer = convertContourPolylineToCanvasSpace(
      t.data.contour.polyline,
      viewport
    );
    const holes = getContourHolesData(viewport, t).map((h) => h.polyline);
    return { outer, holes: holes.length ? holes : undefined };
  });

  // A self-intersecting stroke (e.g. a figure-eight) is decomposed up front
  // into simple rings so it is handled consistently whether or not there are
  // existing same-segment targets to boolean against.
  const clips: PolygonWithHoles[] = splitSelfIntersections(sourcePolyline);
  if (clips.length === 0) {
    removeAnnotationCompletely(sourceAnnotation);
    return;
  }

  const booleanResult = applyBoolean(subjects, clips, op);

  // For ADD (§3.4), rings that touch only at a point are the two lobes of a
  // single drawn shape that Clipper was forced to split. Re-stitch them into
  // one weakly-simple contour so the figure-eight stays a single annotation.
  // SUBTRACT keeps the split — a pinch from erasing genuinely makes two pieces.
  const resultPolygons =
    op === BooleanOp.Union
      ? unifyWeaklyConnectedPolygons(booleanResult)
      : booleanResult;

  // Collect every annotation we're about to discard.
  const toRemove: ContourSegmentationAnnotation[] = [sourceAnnotation];
  for (const t of targets) {
    toRemove.push(t);
    for (const h of getContourHolesData(viewport, t)) {
      toRemove.push(h.annotation);
    }
  }
  for (const annotation of toRemove) {
    removeAnnotationCompletely(annotation);
  }

  // Rebuild from clipper output.
  const template = targets[0] ?? sourceAnnotation;
  const { element } = viewport;

  for (const polygon of resultPolygons) {
    if (polygon.outer.length < 3) {
      continue;
    }
    const parent = createNewAnnotationFromPolyline(
      viewport,
      template,
      polygon.outer,
      ContourWindingDirection.Clockwise
    );
    addAnnotation(parent, element);
    addContourSegmentationAnnotation(parent);

    polygon.holes?.forEach((holePolyline) => {
      if (holePolyline.length < 3) {
        return;
      }
      const hole = createNewAnnotationFromPolyline(
        viewport,
        template,
        holePolyline,
        ContourWindingDirection.CounterClockwise
      );
      addAnnotation(hole, element);
      addChildAnnotation(parent, hole);
      triggerAnnotationModified(hole, element);
    });

    // Fire the parent's modified event only after all holes are attached,
    // so listeners observe the parent with its complete child structure.
    triggerAnnotationModified(parent, element);
  }

  updateViewportsForAnnotations(viewport, toRemove);
}

function collectSamePlaneSegmentTargets(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation
): ContourSegmentationAnnotation[] {
  const sourceUID = sourceAnnotation.annotationUID;
  return getAllAnnotations().filter((candidate) => {
    if (!candidate.annotationUID || candidate.annotationUID === sourceUID) {
      return false;
    }
    if (!isContourSegmentationAnnotation(candidate)) {
      return false;
    }
    if (
      !areSameSegment(
        candidate as ContourSegmentationAnnotation,
        sourceAnnotation
      )
    ) {
      return false;
    }
    if (!viewport.isReferenceViewable(candidate.metadata)) {
      return false;
    }
    // Skip child (hole) annotations — they're brought in via their parent.
    if ((candidate as ContourSegmentationAnnotation).parentAnnotationUID) {
      return false;
    }
    return true;
  }) as ContourSegmentationAnnotation[];
}

function removeAnnotationCompletely(
  annotation: ContourSegmentationAnnotation
): void {
  removeAnnotation(annotation.annotationUID);
  removeContourSegmentationAnnotation(annotation);
}
