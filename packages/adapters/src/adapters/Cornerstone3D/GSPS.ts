import { data as dcmjsData } from 'dcmjs';
import {
  utilities as csUtilities,
  type Types as CSTypes,
} from '@cornerstonejs/core';

import { toArray } from '../helpers';
import ArrowAnnotate from './ArrowAnnotate';
import CircleROI from './CircleROI';
import EllipticalROI from './EllipticalROI';
import Length from './Length';
import PlanarFreehandROI from './PlanarFreehandROI';
import Probe from './Probe';
import RectangleROI from './RectangleROI';

const { DicomMetaDictionary } = dcmjsData;
const { imageToWorldCoords } = csUtilities;

const log = csUtilities.logger.adaptersLog.getLogger('Cornerstone3D.GSPS');

/**
 * Tool name used for free standing text that has no anchor point. There is
 * no SR adapter for it, so it is not part of the Cornerstone3DSR adapters.
 */
export const GSPS_TEXT_TOOL_TYPE = 'Label';

/**
 * Presentation state SOP classes whose Graphic Annotation Module is relative
 * to the image pixel matrix. The volumetric presentation states put the
 * annotations on the volumetric view instead, so they are not read here.
 */
export const GSPS_SOP_CLASS_UIDS = {
  GrayscaleSoftcopyPresentationState: '1.2.840.10008.5.1.4.1.1.11.1',
  ColorSoftcopyPresentationState: '1.2.840.10008.5.1.4.1.1.11.2',
  PseudoColorSoftcopyPresentationState: '1.2.840.10008.5.1.4.1.1.11.3',
  BlendingSoftcopyPresentationState: '1.2.840.10008.5.1.4.1.1.11.4',
};

const SUPPORTED_SOP_CLASS_UIDS = new Set(Object.values(GSPS_SOP_CLASS_UIDS));

/** Image relative units. DISPLAY and MATRIX are not read. */
const PIXEL = 'PIXEL';

/** Distance in pixels under which a polyline counts as closed. */
const CLOSED_THRESHOLD = 1e-3;

/** A point in GSPS PIXEL space, column then row. */
export type ImagePoint = [number, number];

/**
 * An annotation read from the Graphic Annotation Module, still in image
 * (PIXEL) coordinates and not yet tied to a specific image.
 */
export type GSPSShape = {
  toolType: string;
  points: ImagePoint[];
  label?: string;
  /** Top left corner of the text, when the GSPS gives one */
  textPosition?: ImagePoint;
  /** For PlanarFreehandROI only */
  closed?: boolean;
  graphicLayer?: string;
  trackingIdentifier?: string;
  trackingUniqueIdentifier?: string;
};

type ImageReference = {
  sopInstanceUID: string;
  frameNumbers: number[];
};

type GraphicAnnotationItem = {
  shapes: GSPSShape[];
  references: ImageReference[];
};

/** Reads GraphicData (or any FL list) as image points */
function toImagePoints(values): ImagePoint[] {
  const flat = toArray(values).map(Number);
  const points: ImagePoint[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    points.push([flat[i], flat[i + 1]]);
  }
  return points;
}

function toImagePoint(values): ImagePoint | undefined {
  return toImagePoints(values)[0];
}

function samePoint(a: ImagePoint, b: ImagePoint) {
  return (
    Math.abs(a[0] - b[0]) < CLOSED_THRESHOLD &&
    Math.abs(a[1] - b[1]) < CLOSED_THRESHOLD
  );
}

function toFrameNumbers(value): number[] {
  return toArray(value)
    .map(Number)
    .filter((frame) => Number.isFinite(frame) && frame > 0);
}

function toImageReferences(referencedImageSequence): ImageReference[] {
  return toArray(referencedImageSequence)
    .filter((item) => item?.ReferencedSOPInstanceUID)
    .map((item) => ({
      sopInstanceUID: item.ReferencedSOPInstanceUID,
      frameNumbers: toFrameNumbers(item.ReferencedFrameNumber),
    }));
}

/**
 * Images listed in the Presentation State Relationship Module. A graphic
 * annotation item with no Referenced Image Sequence applies to all of them.
 */
function getAllImageReferences(dataset): ImageReference[] {
  return toArray(dataset.ReferencedSeriesSequence).flatMap((series) =>
    toImageReferences(series.ReferencedImageSequence)
  );
}

function textOf(textObject): string | undefined {
  const text = textObject?.UnformattedTextValue;
  if (text === undefined || text === null) {
    return;
  }
  return String(text).replace(/\r\n/g, '\n').trim() || undefined;
}

function trackingOf(...items) {
  for (const item of items) {
    if (item?.TrackingUID || item?.TrackingID) {
      return {
        trackingIdentifier: item.TrackingID,
        trackingUniqueIdentifier: item.TrackingUID,
      };
    }
  }
  return {};
}

/** The bounding box of a text object, in PIXEL units only */
function textBoundingBox(textObject) {
  if (textObject.BoundingBoxAnnotationUnits !== PIXEL) {
    return;
  }
  const topLeft = toImagePoint(textObject.BoundingBoxTopLeftHandCorner);
  const bottomRight = toImagePoint(textObject.BoundingBoxBottomRightHandCorner);
  if (!topLeft || !bottomRight) {
    return;
  }
  return { topLeft, bottomRight };
}

function textAnchor(textObject): ImagePoint | undefined {
  if (textObject.AnchorPointAnnotationUnits !== PIXEL) {
    return;
  }
  return toImagePoint(textObject.AnchorPoint);
}

/**
 * Maps one simple graphic object (Graphic Object Sequence item) to a shape.
 * See PS3.3 C.10.5.1.2 for the point layout of each Graphic Type.
 */
export function graphicObjectToShape(graphicObject): GSPSShape | undefined {
  const { GraphicType: graphicType } = graphicObject;
  if (graphicObject.GraphicAnnotationUnits !== PIXEL) {
    log.warn(
      `Skipping ${graphicType} graphic with ${graphicObject.GraphicAnnotationUnits} units, only PIXEL is supported`
    );
    return;
  }
  const points = toImagePoints(graphicObject.GraphicData);
  const tracking = trackingOf(graphicObject);

  switch (graphicType) {
    case 'POINT':
      if (points.length < 1) {
        break;
      }
      return { toolType: Probe.toolType, points: [points[0]], ...tracking };
    case 'CIRCLE':
      // center, then a point on the circumference
      if (points.length !== 2) {
        break;
      }
      return { toolType: CircleROI.toolType, points, ...tracking };
    case 'ELLIPSE':
      // major axis end points, then minor axis end points
      if (points.length !== 4) {
        break;
      }
      return { toolType: EllipticalROI.toolType, points, ...tracking };
    case 'POLYLINE':
    case 'INTERPOLATED': {
      if (points.length === 1) {
        return { toolType: Probe.toolType, points, ...tracking };
      }
      if (points.length === 2) {
        return { toolType: Length.toolType, points, ...tracking };
      }
      if (points.length < 2) {
        break;
      }
      const closed = samePoint(points[0], points[points.length - 1]);
      return {
        toolType: PlanarFreehandROI.toolType,
        points: closed ? points.slice(0, -1) : points,
        closed,
        ...tracking,
      };
    }
    default:
      log.warn(`Unknown GSPS graphic type ${graphicType}`);
      return;
  }
  log.warn(
    `Skipping ${graphicType} graphic with an unexpected ${points.length} points`
  );
}

/**
 * Maps a text object that is not attached to a graphic. Text with a visible
 * anchor becomes an arrow pointing at the anchor, other text becomes a label.
 */
export function textObjectToShape(textObject): GSPSShape | undefined {
  const label = textOf(textObject);
  const box = textBoundingBox(textObject);
  const anchor = textAnchor(textObject);
  const tracking = trackingOf(textObject);

  if (anchor && textObject.AnchorPointVisibility === 'Y') {
    // With no bounding box, the tail is added per image, the same way the SR
    // ArrowAnnotate reader does it for a single point.
    const points: ImagePoint[] = box
      ? [
          anchor,
          [
            (box.topLeft[0] + box.bottomRight[0]) / 2,
            (box.topLeft[1] + box.bottomRight[1]) / 2,
          ],
        ]
      : [anchor];
    return {
      toolType: ArrowAnnotate.toolType,
      points,
      label,
      textPosition: box?.topLeft,
      ...tracking,
    };
  }

  const position = box?.topLeft || anchor;
  if (!position) {
    log.warn('Skipping GSPS text object with no PIXEL position', label);
    return;
  }
  return {
    toolType: GSPS_TEXT_TOOL_TYPE,
    points: [position],
    label,
    textPosition: position,
    ...tracking,
  };
}

/**
 * Maps a compound graphic (the "extended description" of an annotation,
 * PS3.3 C.10.5.1.3) to the matching tool. Returns undefined when the type
 * has no matching tool, in which case the caller falls back to the simple
 * graphic objects that every compound graphic is required to have.
 */
export function compoundGraphicToShape(compoundGraphic): GSPSShape | undefined {
  const type = compoundGraphic.CompoundGraphicType;
  if (compoundGraphic.CompoundGraphicUnits !== PIXEL) {
    return;
  }
  if (Number(compoundGraphic.RotationAngle || 0) % 360 !== 0) {
    // The simple graphics already have the rotation applied
    return;
  }
  const points = toImagePoints(compoundGraphic.GraphicData);
  if (type === 'CROSSHAIR' || points.length < 2) {
    return;
  }
  const [first, second] = points;
  const left = Math.min(first[0], second[0]);
  const right = Math.max(first[0], second[0]);
  const top = Math.min(first[1], second[1]);
  const bottom = Math.max(first[1], second[1]);

  switch (type) {
    case 'RULER':
      return { toolType: Length.toolType, points: [first, second] };
    case 'ARROW':
      // first point is the anchor (arrow head), second is the foot
      return { toolType: ArrowAnnotate.toolType, points: [first, second] };
    case 'RECTANGLE':
      // Same corner order as the RectangleROI tool
      return {
        toolType: RectangleROI.toolType,
        points: [
          [left, top],
          [right, top],
          [left, bottom],
          [right, bottom],
        ],
      };
    case 'ELLIPSE': {
      // Bounding box corners, turned into top, bottom, left, right
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      return {
        toolType: EllipticalROI.toolType,
        points: [
          [centerX, top],
          [centerX, bottom],
          [left, centerY],
          [right, centerY],
        ],
      };
    }
    default:
      return;
  }
}

function joinLabels(textObjects): string | undefined {
  const labels = textObjects.map(textOf).filter(Boolean);
  return labels.length ? labels.join('\n') : undefined;
}

/**
 * Reads one Graphic Annotation Sequence item into image space shapes.
 */
export function readGraphicAnnotationItem(item): GSPSShape[] {
  const graphicLayer = item.GraphicLayer;
  let graphicObjects = toArray(item.GraphicObjectSequence);
  let textObjects = toArray(item.TextObjectSequence);
  const shapes: GSPSShape[] = [];

  for (const compound of toArray(item.CompoundGraphicSequence)) {
    const id = compound.CompoundGraphicInstanceID;
    const shape = compoundGraphicToShape(compound);
    if (!shape) {
      continue;
    }
    const isLinked = (object) =>
      id !== undefined && object.CompoundGraphicInstanceID === id;
    const linkedGraphics = graphicObjects.filter(isLinked);
    const linkedText = textObjects.filter(isLinked);
    graphicObjects = graphicObjects.filter((object) => !isLinked(object));
    textObjects = textObjects.filter((object) => !isLinked(object));

    const box = linkedText.map(textBoundingBox).find(Boolean);
    shapes.push({
      ...shape,
      label: joinLabels(linkedText),
      textPosition: box?.topLeft,
      ...trackingOf(compound, ...linkedGraphics, ...linkedText),
    });
  }

  const graphicShapes = graphicObjects
    .map(graphicObjectToShape)
    .filter(Boolean);

  if (graphicShapes.length === 1 && textObjects.length === 1) {
    // One graphic and one text in an item: the text describes the graphic
    const [shape] = graphicShapes;
    const [textObject] = textObjects;
    const box = textBoundingBox(textObject);
    shape.label = textOf(textObject);
    shape.textPosition = box?.topLeft || textAnchor(textObject);
    if (!shape.trackingUniqueIdentifier) {
      Object.assign(shape, trackingOf(textObject));
    }
    shapes.push(shape);
  } else {
    shapes.push(...graphicShapes);
    for (const textObject of textObjects) {
      const shape = textObjectToShape(textObject);
      if (shape) {
        shapes.push(shape);
      }
    }
  }

  for (const shape of shapes) {
    shape.graphicLayer = graphicLayer;
    shape.label ??= shape.trackingIdentifier;
  }
  return shapes;
}

/**
 * Reads the annotation part of a presentation state, without any image or
 * world coordinates. Each item lists the images it applies to.
 */
export function readGraphicAnnotations(dataset): GraphicAnnotationItem[] {
  const allReferences = getAllImageReferences(dataset);
  return toArray(dataset.GraphicAnnotationSequence).map((item) => {
    const references = toImageReferences(item.ReferencedImageSequence);
    return {
      shapes: readGraphicAnnotationItem(item),
      references: references.length ? references : allReferences,
    };
  });
}

/**
 * Finds the imageIds for a referenced image. No frame numbers means all the
 * frames of the image that are in the map.
 */
function resolveImageIds(
  reference: ImageReference,
  sopInstanceUIDToImageIdMap: Record<string, string>
) {
  const { sopInstanceUID, frameNumbers } = reference;
  if (frameNumbers.length) {
    return frameNumbers
      .map((frameNumber) => ({
        frameNumber,
        imageId: sopInstanceUIDToImageIdMap[`${sopInstanceUID}:${frameNumber}`],
      }))
      .filter(({ imageId }) => imageId);
  }
  const prefix = `${sopInstanceUID}:`;
  return Object.keys(sopInstanceUIDToImageIdMap)
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({
      frameNumber: Number(key.substring(prefix.length)) || 1,
      imageId: sopInstanceUIDToImageIdMap[key],
    }));
}

function createState(
  shape: GSPSShape,
  imageId: string,
  sopInstanceUID: string,
  frameNumber: number,
  metadata
) {
  const toWorld = (point: ImagePoint) =>
    imageToWorldCoords(imageId, point) as CSTypes.Point3;
  const imagePlaneModule = metadata.get('imagePlaneModule', imageId);
  const annotationUID = DicomMetaDictionary.uid();
  const imagePoints = [...shape.points];
  if (shape.toolType === ArrowAnnotate.toolType && imagePoints.length === 1) {
    const imagePixelModule = metadata.get('imagePixelModule', imageId);
    const [column, row] = imagePoints[0];
    imagePoints.push([
      column + (imagePixelModule?.columns ?? 100) / 10,
      row + (imagePixelModule?.rows ?? 100) / 10,
    ]);
  }
  const worldPoints = imagePoints.map(toWorld);

  const textBox = shape.textPosition
    ? { hasMoved: true, worldPosition: toWorld(shape.textPosition) }
    : { hasMoved: false };

  const data: Record<string, unknown> = {
    annotationUID,
    label: shape.label,
    handles: {
      activeHandleIndex: 0,
      textBox,
      points: worldPoints,
    },
    cachedStats: {},
    invalidated: true,
    frameNumber,
  };

  if (shape.toolType === ArrowAnnotate.toolType) {
    data.text = shape.label ?? '';
    (data.handles as Record<string, unknown>).arrowFirst = true;
  } else if (shape.toolType === PlanarFreehandROI.toolType) {
    data.contour = { polyline: worldPoints, closed: !!shape.closed };
    // Same handles as the SR reader uses when there are no control points
    (data.handles as Record<string, unknown>).points = shape.closed
      ? []
      : [worldPoints[0], worldPoints[worldPoints.length - 1]];
  }

  return {
    description: undefined,
    sopInstanceUid: sopInstanceUID,
    annotation: {
      annotationUID,
      data,
      metadata: {
        toolName: shape.toolType,
        referencedImageId: imageId,
        FrameOfReferenceUID: imagePlaneModule?.frameOfReferenceUID,
      },
    },
    finding: undefined,
    findingSites: [],
    TrackingUniqueIdentifier: shape.trackingUniqueIdentifier,
    graphicLayer: shape.graphicLayer,
  };
}

/**
 * Reads the graphic and text annotations of a softcopy presentation state
 * (GSPS) into Cornerstone3D tool state.
 *
 * The result has the same shape as MeasurementReport.generateToolState, that
 * is an object keyed by tool name, with a list of `{ annotation, ... }`
 * entries for each, so the code that loads SR measurements can load these.
 *
 * Only the Graphic Annotation Module is read, and only PIXEL units. The
 * displayed area, the LUTs, the shutters and the spatial transformation are
 * not applied.
 *
 * @param dataset - naturalized dcmjs dataset of the presentation state
 * @param sopInstanceUIDToImageIdMap - `${SOPInstanceUID}:${frameNumber}` to imageId
 * @param metadata - metadata provider with a `get(type, imageId)` method
 */
export default class GSPS {
  public static generateToolState(
    dataset,
    sopInstanceUIDToImageIdMap: Record<string, string>,
    metadata
  ) {
    const { SOPClassUID } = dataset;
    if (SOPClassUID && !SUPPORTED_SOP_CLASS_UIDS.has(SOPClassUID)) {
      throw new Error(
        `Presentation state SOP class ${SOPClassUID} is not supported`
      );
    }

    const toolState: Record<string, ReturnType<typeof createState>[]> = {};
    const items = readGraphicAnnotations(dataset);

    for (const { shapes, references } of items) {
      for (const reference of references) {
        const targets = resolveImageIds(reference, sopInstanceUIDToImageIdMap);
        if (!targets.length) {
          log.warn(
            'No imageId for GSPS referenced image',
            reference.sopInstanceUID
          );
        }
        for (const { imageId, frameNumber } of targets) {
          for (const shape of shapes) {
            try {
              const state = createState(
                shape,
                imageId,
                reference.sopInstanceUID,
                frameNumber,
                metadata
              );
              toolState[shape.toolType] ||= [];
              toolState[shape.toolType].push(state);
            } catch (e) {
              log.warn('Unable to create tool state for GSPS shape', shape, e);
            }
          }
        }
      }
    }

    return toolState;
  }
}
