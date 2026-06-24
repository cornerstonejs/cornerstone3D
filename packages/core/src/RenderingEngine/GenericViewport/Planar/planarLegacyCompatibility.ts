import type BlendModes from '../../../enums/BlendModes';
import type {
  ColormapPublic,
  OrientationVectors,
  Point3,
  StackViewportProperties,
  VolumeViewportProperties,
} from '../../../types';
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
    return clonePlanarColormap(nextColormap);
  }

  const mergedColormap = clonePlanarColormap(currentColormap) || {};
  const nextClone = clonePlanarColormap(nextColormap);

  if (nextClone) {
    Object.assign(mergedColormap, nextClone);
  }

  return mergedColormap;
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
