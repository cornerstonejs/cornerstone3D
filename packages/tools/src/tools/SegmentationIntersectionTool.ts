import {
  cache,
  eventTarget,
  getEnabledElements,
  getRenderingEngine,
} from '@cornerstonejs/core';
import type { Types, PlanarViewport } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkContourLoopExtraction from '@kitware/vtk.js/Filters/General/ContourLoopExtraction';

import {
  addAnnotation,
  getAllAnnotations,
  getAnnotations,
} from '../stateManagement/annotation/annotationState';
import { drawPath } from '../drawingSvg';
import _getHash from '../drawingSvg/_getHash';
import { getAllToolGroups, getToolGroup } from '../store/ToolGroupManager';
import triggerAnnotationRender from '../utilities/triggerAnnotationRender';
import type {
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
} from '../types';
import type { SegmentationRepresentation } from '../types/SegmentationStateTypes';
import type {
  SegmentationRenderedEventType,
  SegmentationRepresentationRemovedEventType,
} from '../types/EventTypes';
import { Events, ToolModes } from '../enums';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import { distanceToPoint } from '../utilities/math/point';
import { pointToString } from '../utilities/pointToString';
import { polyDataUtils } from '../utilities';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';
import SegmentationRepresentations from '../enums/SegmentationRepresentations';
import { getSegmentationRepresentations } from '../stateManagement/segmentation/getSegmentationRepresentation';
import { getSegmentation } from '../stateManagement/segmentation/getSegmentation';
import { getColorLUT } from '../stateManagement/segmentation/getColorLUT';
import { internalGetHiddenSegmentIndices } from '../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices';
import { getSurfaceRepresentationUID } from '../stateManagement/segmentation/helpers/getSegmentationActor';
import { createSurfacePolyData } from './displayTools/Surface/surfaceActor';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'tools.SegmentationIntersectionTool'
);

/**
 * The outline of a surface on one slice of a viewport: the closed polylines
 * where the surface cuts the slice, in world coordinates, and the colour of
 * its segment as an SVG colour.
 */
export type WorldPointSet = {
  worldPointsSet: Types.Point3[][];
  color: string;
};

export type SegmentationIntersectionAnnotation = Annotation & {
  data: {
    actorsWorldPointsMap: Map<string, Map<string, WorldPointSet>>;
  };
};

/**
 * A surface of a segment that a viewport shows as its Surface
 * representation, with the colour of the segment there as an SVG colour.
 */
type ShownSurface = {
  surface: Types.ISurface;
  color: string;
};

/**
 * The surface, and its points and polys arrays with their lengths, that the
 * outlines of a surface were cut from. The arrays can change in place, so
 * their lengths are kept apart from them.
 */
type CutSurfaceData = {
  surface: Types.ISurface;
  points: number[];
  polys: number[];
  pointsLength: number;
  polysLength: number;
};

/**
 * The events after which the lines of the tool can change: a viewport drew a
 * Surface representation, or a representation left a viewport.
 */
const SURFACE_CHANGE_EVENTS = [
  Events.SEGMENTATION_RENDERED,
  Events.SEGMENTATION_REPRESENTATION_REMOVED,
];

/**
 * The decimals, in mm, of the offset of a plane in the key of its outlines:
 * planes closer than a micrometre share their outlines.
 */
const PLANE_OFFSET_DECIMALS = 3;

/** The surface data that each map of outlines of a surface was cut from. */
const cutSurfaceDataByOutlines = new WeakMap<
  Map<string, WorldPointSet>,
  CutSurfaceData
>();

/**
 * Draws on each slice viewport of its tool group the lines where the surfaces
 * of segmentations cut the slice on display, filled with the `opacity` of its
 * configuration. The surfaces are those of the frame of reference of the
 * slice viewport that the viewports show as their Surface representation,
 * as a 3D viewport does next to the planar viewports of an MPR. Each line has
 * the colour of its segment. The lines of a plane are cut once, and again
 * when the surface gets new data.
 */
class SegmentationIntersectionTool extends AnnotationDisplayTool {
  static toolName;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {
        opacity: 0.5,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Adds the annotation of the tool, with no outline yet, in each frame of
   * reference of the viewports of its tool group that has none, and draws
   * the viewports of the group. Each viewport cuts the outlines of its slice
   * as it draws.
   */
  _init = (): void => {
    const viewportsInfo = getToolGroup(this.toolGroupId).viewportsInfo;

    if (!viewportsInfo?.length) {
      cs3dLogger.warn(this.getToolName() + 'Tool: No viewports found');
      return;
    }

    const viewports = getViewports(viewportsInfo);

    viewports.forEach((viewport) =>
      addFrameAnnotation(this.getToolName(), viewport.getFrameOfReferenceUID())
    );
    viewports.forEach(({ element }) => triggerAnnotationRender(element));
  };

  onSetToolEnabled = (): void => {
    SURFACE_CHANGE_EVENTS.forEach((eventName) =>
      eventTarget.addEventListener(eventName, this._onSurfaceChanged)
    );
    this._init();
  };

  /**
   * Stops listening for surface changes. When no tool group has the tool of
   * this name enabled any more, nothing drops the cut lines of a surface that
   * is removed from now on, so the cut lines of every surface are released
   * (`releaseOutlines`): an enabled tool cuts them again as it draws.
   */
  onSetToolDisabled = (): void => {
    SURFACE_CHANGE_EVENTS.forEach((eventName) =>
      eventTarget.removeEventListener(eventName, this._onSurfaceChanged)
    );

    if (!isEnabledInAToolGroup(this.getToolName())) {
      releaseOutlines(this.getToolName());
    }
  };

  /**
   * Draws the viewports of the tool group again when a viewport has drawn a
   * Surface representation, as after new surface data or a change of its
   * visibility, and when a Surface representation is removed from a
   * viewport, so that the lines follow the surfaces. A tool that its group
   * no longer holds stops listening.
   */
  private _onSurfaceChanged = ((
    evt:
      | SegmentationRenderedEventType
      | SegmentationRepresentationRemovedEventType
  ): void => {
    const toolGroup = getToolGroup(this.toolGroupId);

    if (toolGroup?.getToolInstances()[this.getToolName()] !== this) {
      this.onSetToolDisabled();
      return;
    }

    if (evt.detail.type !== SegmentationRepresentations.Surface) {
      return;
    }

    if (evt.type === Events.SEGMENTATION_REPRESENTATION_REMOVED) {
      dropOutlinesOfUnshownSurfaces(this.getToolName());
    }

    getViewports(toolGroup.viewportsInfo).forEach(({ element }) =>
      triggerAnnotationRender(element)
    );
  }) as EventListener;

  onCameraModified = (evt: Types.EventTypes.CameraModifiedEvent): void => {
    this._init();
  };

  /**
   * Draws on a viewport the outlines of the surfaces that the viewports of
   * its frame of reference show, where they cut the slice on display. The
   * outlines of a slice are cut on its first draw. The lines of a surface
   * are one path, filled with the even-odd rule: a line inside another bounds
   * a hole, as the cavity of a hollow segment. A viewport without a slice,
   * as a 3D viewport, draws nothing.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   * @returns Whether the frame of reference of the viewport has the
   * annotation of the tool.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    const { FrameOfReferenceUID } = enabledElement;
    const viewport = enabledElement.viewport as PlanarViewport;

    const annotations = getAnnotations(this.getToolName(), FrameOfReferenceUID);

    if (!annotations?.length) {
      return false;
    }

    const cacheId = getCacheId(viewport);

    if (!cacheId) {
      return true;
    }
    const annotation = annotations[0];
    const { annotationUID } = annotation;
    const actorsWorldPointsMap = (<SegmentationIntersectionAnnotation>(
      annotation
    )).data.actorsWorldPointsMap;
    const shownSurfaces = getShownSurfaces(FrameOfReferenceUID);

    calculateSurfaceSegmentationIntersectionsForViewport(
      actorsWorldPointsMap,
      viewport,
      shownSurfaces
    );

    for (const representationUID of shownSurfaces.keys()) {
      const outline = actorsWorldPointsMap.get(representationUID)?.get(cacheId);

      if (!outline) {
        continue;
      }
      const { worldPointsSet, color } = outline;

      if (!worldPointsSet.length) {
        continue;
      }

      drawPath(
        svgDrawingHelper,
        annotationUID,
        representationUID,
        worldPointsSet.map((worldPoints) =>
          worldPoints.map((point) => viewport.worldToCanvas(point))
        ),
        {
          color,
          fillColor: color,
          fillOpacity: this.configuration.opacity,
          closePath: true,
          lineWidth: 2,
        }
      );
      svgDrawingHelper
        .getSvgNode(_getHash(annotationUID, 'path', representationUID))
        ?.setAttribute('fill-rule', 'evenodd');
    }

    return true;
  };
}

/**
 * The viewports of a tool group that exist, each found by its rendering
 * engine and its id: viewports of several rendering engines can have the
 * same id.
 */
function getViewports(viewportsInfo: Types.IViewportId[]): Types.IViewport[] {
  return viewportsInfo
    .map(({ renderingEngineId, viewportId }) =>
      getRenderingEngine(renderingEngineId)?.getViewport(viewportId)
    )
    .filter(Boolean);
}

/**
 * Adds the annotation of the tool in a frame of reference that has none,
 * with no outline yet.
 */
function addFrameAnnotation(
  toolName: string,
  frameOfReferenceUID: string
): void {
  if (getAnnotations(toolName, frameOfReferenceUID)?.length) {
    return;
  }

  const newAnnotation: SegmentationIntersectionAnnotation = {
    highlighted: true,
    invalidated: true,
    metadata: {
      toolName,
      FrameOfReferenceUID: frameOfReferenceUID,
      referencedImageId: null,
    },
    data: {
      actorsWorldPointsMap: new Map<string, Map<string, WorldPointSet>>(),
    },
  };

  addAnnotation(newAnnotation, frameOfReferenceUID);
}

/** Whether a tool group has the tool of this name enabled. */
function isEnabledInAToolGroup(toolName: string): boolean {
  return getAllToolGroups().some(
    (toolGroup) =>
      toolGroup.getToolOptions(toolName)?.mode === ToolModes.Enabled
  );
}

/**
 * Drops from each annotation of the tool the outlines of every surface, with
 * the surface data that they were cut from (`cutSurfaceDataByOutlines`).
 */
function releaseOutlines(toolName: string): void {
  getAllAnnotations()
    .filter(({ metadata }) => metadata?.toolName === toolName)
    .forEach((annotation) =>
      (
        annotation as SegmentationIntersectionAnnotation
      ).data.actorsWorldPointsMap.clear()
    );
}

/**
 * Drops from each annotation of the tool the outlines of the surfaces that
 * no viewport shows in its frame of reference any more, as after the removal
 * of a Surface representation, so that the annotation does not keep a
 * removed surface and the outlines of its slices alive. A surface that is
 * shown again is cut again.
 */
function dropOutlinesOfUnshownSurfaces(toolName: string): void {
  getAllAnnotations()
    .filter(({ metadata }) => metadata?.toolName === toolName)
    .forEach((annotation) => {
      const { actorsWorldPointsMap } = (
        annotation as SegmentationIntersectionAnnotation
      ).data;
      const shownSurfaces = getShownSurfaces(
        annotation.metadata.FrameOfReferenceUID
      );

      [...actorsWorldPointsMap.keys()].forEach((representationUID) => {
        if (!shownSurfaces.has(representationUID)) {
          actorsWorldPointsMap.delete(representationUID);
        }
      });
    });
}

/**
 * The surfaces of a frame of reference that the viewports show as their
 * Surface representation, by the representation UID of each segment: of a
 * visible representation, and not hidden on that viewport. A surface is of
 * the frame of reference of its geometry; a geometry without one is of the
 * frame of reference of the viewport that shows it. A surface that several
 * viewports show takes the colour of the first one.
 *
 * @param frameOfReferenceUID - The frame of reference.
 * @returns The shown surfaces, with the colour of their segment.
 */
function getShownSurfaces(
  frameOfReferenceUID: string
): Map<string, ShownSurface> {
  const shownSurfaces = new Map<string, ShownSurface>();

  getEnabledElements().forEach(({ viewport }) => {
    getSegmentationRepresentations(viewport.id, {
      type: SegmentationRepresentations.Surface,
    }).forEach((representation) => {
      addShownSurfaces(
        shownSurfaces,
        frameOfReferenceUID,
        viewport,
        representation
      );
    });
  });

  return shownSurfaces;
}

/**
 * Adds the surfaces of the frame of reference among the visible segments of
 * a Surface representation of a viewport, with the colour of each segment in
 * the colour LUT of the representation, as the surface display gives it.
 */
function addShownSurfaces(
  shownSurfaces: Map<string, ShownSurface>,
  frameOfReferenceUID: string,
  viewport: Types.IViewport,
  representation: SegmentationRepresentation
): void {
  const { segmentationId, type, visible, colorLUTIndex } = representation;
  const geometryIds =
    getSegmentation(segmentationId)?.representationData[
      SegmentationRepresentations.Surface
    ]?.geometryIds;

  if (!visible || !geometryIds) {
    return;
  }

  const hiddenSegmentIndices = internalGetHiddenSegmentIndices(viewport.id, {
    segmentationId,
    type,
  });
  const colorLUT = getColorLUT(colorLUTIndex);

  geometryIds.forEach((geometryId) => {
    const surface = cache.getGeometry(geometryId)?.data as
      | Types.ISurface
      | undefined;

    if (
      !surface?.points?.length ||
      (surface.frameOfReferenceUID || viewport.getFrameOfReferenceUID()) !==
        frameOfReferenceUID
    ) {
      return;
    }

    const { segmentIndex } = surface;
    const representationUID = getSurfaceRepresentationUID(
      segmentationId,
      segmentIndex
    );

    if (
      shownSurfaces.has(representationUID) ||
      hiddenSegmentIndices.has(segmentIndex)
    ) {
      return;
    }

    const [r, g, b] = colorLUT?.[segmentIndex] ?? surface.color;

    shownSurfaces.set(representationUID, {
      surface,
      color: `rgb(${r}, ${g}, ${b})`,
    });
  });
}

/**
 * Cuts the outlines of the shown surfaces on the slice that a viewport
 * shows, for each surface that has none on that slice yet. A surface whose
 * points or polys changed since its outlines were cut drops them first. An
 * outline that is kept takes the colour of the segment now.
 *
 * @param actorsWorldPointsMap - The outlines of each surface, by
 * representation UID, then by plane (`getCacheId`).
 * @param viewport - The viewport.
 * @param shownSurfaces - The surfaces to cut.
 */
function calculateSurfaceSegmentationIntersectionsForViewport(
  actorsWorldPointsMap: Map<string, Map<string, WorldPointSet>>,
  viewport: PlanarViewport,
  shownSurfaces: Map<string, ShownSurface>
): void {
  const cacheId = getCacheId(viewport);

  if (!cacheId) {
    return;
  }

  const { cameraFocalPoint, viewPlaneNormal } = viewport.getViewReference();

  shownSurfaces.forEach(({ surface, color }, representationUID) => {
    let outlines = actorsWorldPointsMap.get(representationUID);

    if (!outlines || !isCutFrom(outlines, surface)) {
      outlines = new Map();
      actorsWorldPointsMap.set(representationUID, outlines);
      cutSurfaceDataByOutlines.set(outlines, {
        surface,
        points: surface.points,
        polys: surface.polys,
        pointsLength: surface.points.length,
        polysLength: surface.polys.length,
      });
    }

    const outline = outlines.get(cacheId);

    if (outline) {
      outline.color = color;
      return;
    }

    outlines.set(cacheId, {
      worldPointsSet: cutSurface(surface, cameraFocalPoint, viewPlaneNormal),
      color,
    });
  });
}

/**
 * Whether the outlines of a surface were cut from this surface, with its
 * points and polys as they are now.
 */
function isCutFrom(
  outlines: Map<string, WorldPointSet>,
  surface: Types.ISurface
): boolean {
  const cutSurfaceData = cutSurfaceDataByOutlines.get(outlines);

  return (
    cutSurfaceData?.surface === surface &&
    cutSurfaceData.points === surface.points &&
    cutSurfaceData.polys === surface.polys &&
    cutSurfaceData.pointsLength === surface.points.length &&
    cutSurfaceData.polysLength === surface.polys.length
  );
}

/**
 * The closed polylines where a surface cuts a plane, in world coordinates:
 * the loops of the vtk.js cutter, as the polySeg add-on cuts a surface into
 * the contours of a slice. None when the plane misses the surface.
 *
 * @param surface - The surface.
 * @param origin - A point of the plane.
 * @param normal - The normal of the plane.
 * @returns The polylines, each without its first point repeated at its end.
 */
function cutSurface(
  surface: Types.ISurface,
  origin: Types.Point3,
  normal: Types.Point3
): Types.Point3[][] {
  const cutter = vtkCutter.newInstance();

  cutter.setCutFunction(
    vtkPlane.newInstance({ origin: [...origin], normal: [...normal] })
  );
  cutter.setInputData(createSurfacePolyData(surface));
  cutter.update();

  const cut = cutter.getOutputData();

  if (!cut?.getPoints().getNumberOfPoints()) {
    return [];
  }

  cut.buildLinks();

  const loopExtraction = vtkContourLoopExtraction.newInstance();

  loopExtraction.setInputData(cut);
  loopExtraction.update();

  const loops = loopExtraction.getOutputData();
  const points = loops.getPoints().getData();
  const lines = loops.getLines().getData();
  const polylines: Types.Point3[][] = [];

  for (let index = 0; index < lines.length; index += lines[index] + 1) {
    const pointIds = Array.from(
      lines.slice(index + 1, index + 1 + lines[index])
    );

    if (pointIds.length > 1 && pointIds[0] === pointIds[pointIds.length - 1]) {
      pointIds.pop();
    }

    polylines.push(
      pointIds.map((pointId) => polyDataUtils.getPoint(points, pointId))
    );
  }

  return polylines;
}

/**
 * The key under which the outlines of the slice of a viewport are kept: the
 * plane of the slice, by its view plane normal and its offset along that
 * normal (`normal . focalPoint`, in mm, to `PLANE_OFFSET_DECIMALS`), from the
 * view reference of the viewport. Viewports of the frame of reference that
 * show the same plane share its outlines, whatever their id, rendering
 * engine, series or slice index. A viewport that shows nothing has no view,
 * and a 3D viewport has no slice: neither has a key.
 */
function getCacheId(viewport: PlanarViewport): string | undefined {
  const { viewPlaneNormal, cameraFocalPoint, sliceIndex } =
    viewport.getViewReference();

  if (!viewPlaneNormal || !cameraFocalPoint || sliceIndex === undefined) {
    return;
  }

  const offset = vec3.dot(viewPlaneNormal, cameraFocalPoint);

  return `${pointToString(viewPlaneNormal)}${offset.toFixed(
    PLANE_OFFSET_DECIMALS
  )}`;
}

/**
 * Remove duplicate and unnecessary points
 * @param worldPoints
 * @param canvasPoints
 * @returns
 */
function removeExtraPoints(viewport, worldPointsSet) {
  return worldPointsSet.map((worldPoints) => {
    const canvasPoints = worldPoints.map((point) => {
      const canvasPoint = viewport.worldToCanvas(point);
      return [Math.floor(canvasPoint[0]), Math.floor(canvasPoint[1])];
    });

    let lastPoint;
    const newWorldPoints = [];
    let newCanvasPoints = [];
    // removing duplicate points
    for (let i = 0; i < worldPoints.length; i++) {
      if (lastPoint) {
        if (distanceToPoint(lastPoint, canvasPoints[i]) > 0) {
          newWorldPoints.push(worldPoints[i]);
          newCanvasPoints.push(canvasPoints[i]);
        }
      }
      lastPoint = canvasPoints[i];
    }

    // checking if a middle point is near the start
    const firstPoint = newCanvasPoints[0];
    for (
      let j = Math.min(30, newCanvasPoints.length);
      j < newCanvasPoints.length;
      j++
    ) {
      if (distanceToPoint(firstPoint, newCanvasPoints[j]) < 0.5) {
        newCanvasPoints = newCanvasPoints.slice(0, j);
        return newWorldPoints.slice(0, j);
      }
    }
    return newWorldPoints;
  });
}

SegmentationIntersectionTool.toolName = 'SegmentationIntersection';
export default SegmentationIntersectionTool;
