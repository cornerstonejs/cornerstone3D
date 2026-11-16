import { mat4, vec3 } from 'gl-matrix';
import { EPSILON } from '../../../constants';
import type BlendModes from '../../../enums/BlendModes';
import MetadataModules from '../../../enums/MetadataModules';
import * as metaData from '../../../metaData';
import type {
  ColormapPublic,
  IVolumeViewport,
  OrientationVectors,
  Point2,
  Point3,
  PTScaling,
  Scaling,
  StackViewportProperties,
  VolumeViewportProperties,
} from '../../../types';
import { transformCanvasToIJK } from '../../../utilities/transformCanvasToIJK';
import { transformIJKToCanvas } from '../../../utilities/transformIJKToCanvas';
import type {
  PlanarDataPresentation,
  PlanarOrientation,
} from './PlanarViewportTypes';

const ORIENTATION_VECTOR_EPSILON = 1e-6;
const ORIENTATION_DOT_EPSILON = 1e-3;

export type PlanarLegacyViewportProperties = Partial<
  Omit<StackViewportProperties & VolumeViewportProperties, 'orientation'> &
    Pick<PlanarDataPresentation, 'opacity' | 'visible'> & {
      blendMode?: BlendModes;
      orientation?: PlanarOrientation;
    }
>;

function cloneVOIRange(
  voiRange: PlanarLegacyViewportProperties['voiRange']
): PlanarLegacyViewportProperties['voiRange'] {
  if (!voiRange) {
    return;
  }

  return {
    lower: voiRange.lower,
    upper: voiRange.upper,
  };
}

function cloneColormapOpacity(
  opacity: ColormapPublic['opacity']
): ColormapPublic['opacity'] {
  if (Array.isArray(opacity)) {
    return opacity.map(({ opacity, value }) => ({
      opacity,
      value,
    }));
  }

  return opacity;
}

function mergePlanarColormap(
  currentColormap: ColormapPublic | undefined,
  nextColormap: ColormapPublic | undefined
): ColormapPublic | undefined {
  if (!nextColormap) {
    return clonePlanarColormap(currentColormap);
  }

  if (nextColormap.name !== undefined) {
    return keepOpacityMapping(
      clonePlanarColormap(nextColormap),
      currentColormap,
      nextColormap
    );
  }

  const mergedColormap = clonePlanarColormap(currentColormap) || {};
  const nextClone = clonePlanarColormap(nextColormap);

  if (nextClone) {
    Object.assign(mergedColormap, nextClone);
  }

  return keepOpacityMapping(mergedColormap, currentColormap, nextColormap);
}

/**
 * Carries the `opacityMapping` of the current colormap into a merged colormap
 * when the next colormap gives neither an `opacityMapping` nor an opacity
 * array. An opacity array of the next colormap replaces the mapping.
 */
function keepOpacityMapping(
  mergedColormap: ColormapPublic,
  currentColormap: ColormapPublic | undefined,
  nextColormap: ColormapPublic
): ColormapPublic {
  if (nextColormap.opacityMapping !== undefined) {
    return mergedColormap;
  }

  if (Array.isArray(nextColormap.opacity)) {
    delete mergedColormap.opacityMapping;

    return mergedColormap;
  }

  const currentOpacityMapping = cloneOpacityMapping(
    currentColormap?.opacityMapping
  );

  if (currentOpacityMapping) {
    mergedColormap.opacityMapping = currentOpacityMapping;
  }

  return mergedColormap;
}

function cloneOpacityMapping(
  opacityMapping: ColormapPublic['opacityMapping']
): ColormapPublic['opacityMapping'] {
  return opacityMapping?.map(({ opacity, value }) => ({ opacity, value }));
}

export function isPlanarOrientationVectors(
  orientation: PlanarOrientation | undefined
): orientation is OrientationVectors {
  return Boolean(
    orientation &&
      typeof orientation === 'object' &&
      'viewPlaneNormal' in orientation
  );
}

function normalizeOrientationVector(
  vector: Point3 | undefined,
  fieldName: string
): Point3 {
  const [x, y, z] = vector || [];
  const length = Math.hypot(x, y, z);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    length < ORIENTATION_VECTOR_EPSILON
  ) {
    throw new Error(
      `[PlanarViewport] Invalid orientation vector ${fieldName}. Expected a finite non-zero Point3.`
    );
  }

  return [x / length, y / length, z / length];
}

export function clonePlanarOrientation(
  orientation: PlanarOrientation | undefined
): PlanarOrientation | undefined {
  if (!isPlanarOrientationVectors(orientation)) {
    return orientation;
  }

  const clone: OrientationVectors = {
    viewPlaneNormal: normalizeOrientationVector(
      orientation.viewPlaneNormal,
      'viewPlaneNormal'
    ),
  };

  if (orientation.viewUp) {
    clone.viewUp = normalizeOrientationVector(orientation.viewUp, 'viewUp');

    const dot =
      clone.viewPlaneNormal[0] * clone.viewUp[0] +
      clone.viewPlaneNormal[1] * clone.viewUp[1] +
      clone.viewPlaneNormal[2] * clone.viewUp[2];

    if (Math.abs(dot) > ORIENTATION_DOT_EPSILON) {
      throw new Error(
        '[PlanarViewport] Invalid orientation vectors. viewPlaneNormal and viewUp must be orthogonal.'
      );
    }
  }

  return clone;
}

export function clonePlanarColormap(
  colormap: ColormapPublic | undefined
): ColormapPublic | undefined {
  if (!colormap) {
    return;
  }

  const clone: ColormapPublic = {};

  if (colormap.name !== undefined) {
    clone.name = colormap.name;
  }

  const opacity = cloneColormapOpacity(colormap.opacity);

  if (opacity !== undefined) {
    clone.opacity = opacity;
  }

  const opacityMapping = cloneOpacityMapping(colormap.opacityMapping);

  if (opacityMapping !== undefined) {
    clone.opacityMapping = opacityMapping;
  }

  if (colormap.threshold !== undefined) {
    clone.threshold = colormap.threshold;
  }

  return clone;
}

export function clonePlanarLegacyProperties(
  properties: PlanarLegacyViewportProperties = {}
): PlanarLegacyViewportProperties {
  const clone = Object.assign({} as PlanarLegacyViewportProperties, properties);

  if (properties.voiRange) {
    clone.voiRange = cloneVOIRange(properties.voiRange);
  }

  if (properties.colormap) {
    clone.colormap = clonePlanarColormap(properties.colormap);
  }

  if (properties.orientation !== undefined) {
    clone.orientation = clonePlanarOrientation(properties.orientation);
  }

  return clone;
}

export function mergePlanarLegacyProperties(
  currentProperties: PlanarLegacyViewportProperties = {},
  nextProperties: PlanarLegacyViewportProperties = {}
): PlanarLegacyViewportProperties {
  const current = clonePlanarLegacyProperties(currentProperties);
  const next = clonePlanarLegacyProperties(nextProperties);
  const merged = Object.assign({} as PlanarLegacyViewportProperties, current);

  Object.assign(merged, next);

  if (next.colormap) {
    merged.colormap = mergePlanarColormap(current.colormap, next.colormap);
  }

  return merged;
}

export function toPlanarDataPresentation(
  properties: PlanarLegacyViewportProperties = {}
): PlanarDataPresentation {
  const presentation: PlanarDataPresentation = {};

  if (properties.colormap) {
    presentation.colormap = clonePlanarColormap(properties.colormap);
  }

  if (properties.voiRange) {
    presentation.voiRange = cloneVOIRange(properties.voiRange);
  }

  if (properties.invert !== undefined) {
    presentation.invert = properties.invert;
  }

  if (properties.VOILUTFunction !== undefined) {
    presentation.voiLUTFunction = properties.VOILUTFunction;
  }

  if (properties.blendMode !== undefined) {
    presentation.blendMode = properties.blendMode;
  }

  if (properties.interpolationType !== undefined) {
    presentation.interpolationType = properties.interpolationType;
  }

  if (properties.opacity !== undefined) {
    presentation.opacity = properties.opacity;
  }

  if (properties.slabThickness !== undefined) {
    presentation.slabThickness = properties.slabThickness;
  }

  if (properties.visible !== undefined) {
    presentation.visible = properties.visible;
  }

  return presentation;
}

/**
 * The slice view info of a viewport that shows a volume, as the legacy volume
 * viewport computes it in `getSliceViewInfo`. The row, column and slice
 * directions in index space come from three canvas points. The top left of
 * the slice is the corner of the box around the volume corners on the
 * canvas. The slice plane is the axis of the view plane normal. Throws for an
 * oblique view, as the legacy viewport does.
 */
export function getPlanarLegacySliceViewInfo(
  viewport: IVolumeViewport,
  viewPlaneNormal: Point3,
  sliceIndex: number
): ReturnType<IVolumeViewport['getSliceViewInfo']> {
  const { width: canvasWidth, height: canvasHeight } = viewport.getCanvas();
  const ijkOriginPoint = transformCanvasToIJK(viewport, [0, 0]);
  const ijkRowPoint = transformCanvasToIJK(viewport, [canvasWidth - 1, 0]);
  const ijkColPoint = transformCanvasToIJK(viewport, [0, canvasHeight - 1]);
  const ijkRowVec = vec3.sub(vec3.create(), ijkRowPoint, ijkOriginPoint);
  const ijkColVec = vec3.sub(vec3.create(), ijkColPoint, ijkOriginPoint);
  const ijkSliceVec = vec3.cross(vec3.create(), ijkRowVec, ijkColVec);

  vec3.normalize(ijkRowVec, ijkRowVec);
  vec3.normalize(ijkColVec, ijkColVec);
  vec3.normalize(ijkSliceVec, ijkSliceVec);

  const [sx, sy, sz] = viewport.getImageData().dimensions;
  const canvasCorners: Point2[] = [];

  for (const k of [0, sz - 1]) {
    for (const j of [0, sy - 1]) {
      for (const i of [0, sx - 1]) {
        canvasCorners.push(transformIJKToCanvas(viewport, [i, j, k]));
      }
    }
  }

  const minX = Math.min(...canvasCorners.map((point) => point[0]));
  const minY = Math.min(...canvasCorners.map((point) => point[1]));
  const maxX = Math.max(...canvasCorners.map((point) => point[0]));
  const maxY = Math.max(...canvasCorners.map((point) => point[1]));
  const ijkTopLeft = transformCanvasToIJK(viewport, [minX, minY]);
  const ijkBottomRight = transformCanvasToIJK(viewport, [maxX, maxY]);
  const ijkDiagonal = vec3.sub(vec3.create(), ijkBottomRight, ijkTopLeft);
  const sliceToIndexMatrix = mat4.fromValues(
    ijkRowVec[0],
    ijkRowVec[1],
    ijkRowVec[2],
    0,
    ijkColVec[0],
    ijkColVec[1],
    ijkColVec[2],
    0,
    ijkSliceVec[0],
    ijkSliceVec[1],
    ijkSliceVec[2],
    0,
    ijkTopLeft[0],
    ijkTopLeft[1],
    ijkTopLeft[2],
    1
  );
  const indexToSliceMatrix = mat4.invert(mat4.create(), sliceToIndexMatrix);

  if (
    viewPlaneNormal.filter((component) => Math.abs(component) > EPSILON)
      .length > 1
  ) {
    throw new Error('getSliceInfo is not supported for oblique views');
  }

  const slicePlane = viewPlaneNormal.findIndex(
    (component) => Math.abs(component) > 1 - EPSILON
  );

  if (slicePlane === -1) {
    throw new Error('Unable to determine slice axis');
  }

  return {
    sliceIndex,
    width: vec3.dot(ijkRowVec, ijkDiagonal) + 1,
    height: vec3.dot(ijkColVec, ijkDiagonal) + 1,
    slicePlane,
    sliceToIndexMatrix,
    indexToSliceMatrix,
  };
}

/**
 * The scaling of the image of an image id, as the legacy stack viewport keeps
 * it: for a PT image with a scaling module, the ratios from SUV body weight
 * to SUV lean body mass and to SUV body surface area. Empty for any other
 * image.
 */
export function getPlanarLegacyScaling(imageId: string | undefined): Scaling {
  const scaling: Scaling = {};

  if (!imageId) {
    return scaling;
  }

  const modality = metaData.get(
    MetadataModules.GENERAL_SERIES,
    imageId
  )?.modality;
  const scalingFactor = metaData.get(MetadataModules.SCALING, imageId);

  if (modality !== 'PT' || !scalingFactor) {
    return scaling;
  }

  const { suvbw, suvlbm, suvbsa } = scalingFactor;
  const ptScaling = {} as PTScaling;

  if (suvlbm) {
    ptScaling.suvbwToSuvlbm = suvlbm / suvbw;
  }

  if (suvbsa) {
    ptScaling.suvbwToSuvbsa = suvbsa / suvbw;
  }

  scaling.PT = ptScaling;

  return scaling;
}
