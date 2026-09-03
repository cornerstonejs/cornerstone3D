import { mat4, vec3 } from 'gl-matrix';
import type { CPUIImageData, Point2, Point3, VOIRange } from '../../../types';
import type {
  WSIImageDataMetadata,
  WSIMapViewLike,
} from '../../../utilities/WSIUtilities';
import { Transform } from '../../helpers/cpuFallback/rendering/transform';

export function computeWSITransforms(metadata?: WSIImageDataMetadata) {
  if (!metadata) {
    return;
  }

  const indexToWorld = mat4.create();
  const worldToIndexMatrix = mat4.create();

  mat4.fromTranslation(indexToWorld, metadata.origin);
  indexToWorld[0] = metadata.direction[0];
  indexToWorld[1] = metadata.direction[1];
  indexToWorld[2] = metadata.direction[2];
  indexToWorld[4] = metadata.direction[3];
  indexToWorld[5] = metadata.direction[4];
  indexToWorld[6] = metadata.direction[5];
  indexToWorld[8] = metadata.direction[6];
  indexToWorld[9] = metadata.direction[7];
  indexToWorld[10] = metadata.direction[8];
  mat4.scale(indexToWorld, indexToWorld, metadata.spacing);
  mat4.invert(worldToIndexMatrix, indexToWorld);

  return {
    indexToWorld,
    worldToIndexMatrix,
  };
}

export function worldToIndexWSIMetadata(
  metadata: WSIImageDataMetadata | undefined,
  point: Point3
): Point3 {
  const transforms = computeWSITransforms(metadata);

  if (!transforms) {
    return [0, 0, 0];
  }

  const imageCoord = vec3.create();

  vec3.transformMat4(imageCoord, point, transforms.worldToIndexMatrix);

  return [imageCoord[0], imageCoord[1], imageCoord[2]];
}

export function indexToWorldWSIMetadata(
  metadata: WSIImageDataMetadata | undefined,
  point: Point3
): Point3 {
  const transforms = computeWSITransforms(metadata);

  if (!transforms) {
    return [0, 0, 0];
  }

  const worldPos = vec3.create();

  vec3.transformMat4(worldPos, point, transforms.indexToWorld);

  return [worldPos[0], worldPos[1], worldPos[2]];
}

export function buildWSIImageData(args: {
  metadata?: WSIImageDataMetadata;
  modality?: string;
  frameOfReferenceUID?: string | null;
}): CPUIImageData | null {
  const { metadata, modality = 'SM', frameOfReferenceUID } = args;

  if (!metadata) {
    return null;
  }

  const imageData = {
    getDirection: () =>
      metadata.direction as unknown as CPUIImageData['direction'],
    getDimensions: () => metadata.dimensions,
    getRange: () => [0, 255] as [number, number],
    getScalarData: () => null as unknown as CPUIImageData['scalarData'],
    getSpacing: () => metadata.spacing,
    worldToIndex: (point: Point3) => {
      return worldToIndexWSIMetadata(metadata, point);
    },
    indexToWorld: (point: Point3) => {
      return indexToWorldWSIMetadata(metadata, point);
    },
  };

  return {
    dimensions: metadata.dimensions,
    spacing: metadata.spacing,
    numberOfComponents: 3,
    origin: metadata.origin,
    direction: metadata.direction as unknown as CPUIImageData['direction'],
    metadata: {
      Modality: modality,
      FrameOfReferenceUID: frameOfReferenceUID || '',
    },
    hasPixelSpacing: metadata.hasPixelSpacing,
    preScale: {
      scaled: false,
    },
    scalarData: null as unknown as CPUIImageData['scalarData'],
    imageData,
  };
}

export function buildWSIColorTransform(
  voiRange?: VOIRange,
  averageWhite?: [number, number, number]
): string | undefined {
  if (!voiRange && !averageWhite) {
    return;
  }

  const white = averageWhite || [255, 255, 255];
  const maxWhite = Math.max(...white);
  const scaleWhite = white.map((value) => maxWhite / value);
  const { lower = 0, upper = 255 } = voiRange || {};
  const wlScale = (upper - lower + 1) / 255;
  const wlDelta = lower / 255;

  return `url('data:image/svg+xml,\
      <svg xmlns="http://www.w3.org/2000/svg">\
        <filter id="colour" color-interpolation-filters="linearRGB">\
        <feColorMatrix type="matrix" \
        values="\
          ${scaleWhite[0] * wlScale} 0 0 0 ${wlDelta} \
          0 ${scaleWhite[1] * wlScale} 0 0 ${wlDelta} \
          0 0 ${scaleWhite[2] * wlScale} 0 ${wlDelta} \
          0 0 0 1 0" />\
        </filter>\
      </svg>#colour')`;
}

export function canvasToIndexForWSI(args: {
  canvasPos: Point2;
  canvasWidth: number;
  canvasHeight: number;
  view: WSIMapViewLike;
  devicePixelRatio?: number;
}): Point3 {
  const transform = getWSICanvasTransform(args);

  transform.invert();

  const indexPoint = transform.transformPoint(
    args.canvasPos.map(
      (value) => value * (args.devicePixelRatio || window.devicePixelRatio || 1)
    ) as Point2
  );

  return [indexPoint[0], indexPoint[1], 0];
}

export function indexToCanvasForWSI(args: {
  indexPos: Point3;
  canvasWidth: number;
  canvasHeight: number;
  view: WSIMapViewLike;
  devicePixelRatio?: number;
}): Point2 {
  const transform = getWSICanvasTransform(args);

  return transform
    .transformPoint([args.indexPos[0], args.indexPos[1]])
    .map(
      (value) => value / (args.devicePixelRatio || window.devicePixelRatio || 1)
    ) as Point2;
}

function getWSICanvasTransform(args: {
  canvasWidth: number;
  canvasHeight: number;
  view: WSIMapViewLike;
  devicePixelRatio?: number;
}): Transform {
  const resolution = args.view.getResolution();
  const rotation = args.view.getRotation();
  const center = args.view.getCenter();
  const halfCanvas = [
    Math.max(args.canvasWidth, 1) / 2,
    Math.max(args.canvasHeight, 1) / 2,
  ];
  const transform = new Transform();

  transform.translate(halfCanvas[0], halfCanvas[1]);
  transform.rotate(rotation);
  transform.scale(1 / resolution, -1 / resolution);
  transform.translate(-center[0], -center[1]);

  return transform;
}
