import type {
  ColormapPublic,
  OrientationVectors,
  StackViewportProperties,
  VolumeViewportProperties,
} from '../../../types';
import type {
  PlanarDataPresentation,
  PlanarOrientation,
} from './PlanarViewportV2Types';

export type PlanarLegacyViewportProperties = Partial<
  Omit<StackViewportProperties & VolumeViewportProperties, 'orientation'> &
    Pick<PlanarDataPresentation, 'opacity' | 'visible'> & {
      orientation?: PlanarOrientation;
    }
>;

export function isPlanarOrientationVectors(
  orientation: PlanarOrientation | undefined
): orientation is OrientationVectors {
  return Boolean(
    orientation &&
      typeof orientation === 'object' &&
      'viewPlaneNormal' in orientation
  );
}

export function clonePlanarOrientation(
  orientation: PlanarOrientation | undefined
): PlanarOrientation | undefined {
  if (!isPlanarOrientationVectors(orientation)) {
    return orientation;
  }

  return {
    viewPlaneNormal: [...orientation.viewPlaneNormal],
    ...(orientation.viewUp ? { viewUp: [...orientation.viewUp] } : {}),
  };
}

export function clonePlanarColormap(
  colormap: ColormapPublic | undefined
): ColormapPublic | undefined {
  if (!colormap) {
    return;
  }

  return {
    ...colormap,
    ...(Array.isArray(colormap.opacity)
      ? {
          opacity: colormap.opacity.map(({ opacity, value }) => ({
            opacity,
            value,
          })),
        }
      : colormap.opacity !== undefined
        ? { opacity: colormap.opacity }
        : {}),
    ...(colormap.threshold !== undefined
      ? { threshold: colormap.threshold }
      : {}),
  };
}

export function clonePlanarLegacyProperties(
  properties: PlanarLegacyViewportProperties = {}
): PlanarLegacyViewportProperties {
  return {
    ...properties,
    ...(properties.voiRange
      ? {
          voiRange: {
            lower: properties.voiRange.lower,
            upper: properties.voiRange.upper,
          },
        }
      : {}),
    ...(properties.colormap
      ? {
          colormap: clonePlanarColormap(properties.colormap),
        }
      : {}),
    ...(properties.orientation
      ? {
          orientation: clonePlanarOrientation(properties.orientation),
        }
      : {}),
  };
}

export function mergePlanarLegacyProperties(
  currentProperties: PlanarLegacyViewportProperties = {},
  nextProperties: PlanarLegacyViewportProperties = {}
): PlanarLegacyViewportProperties {
  const current = clonePlanarLegacyProperties(currentProperties);
  const next = clonePlanarLegacyProperties(nextProperties);

  return {
    ...current,
    ...next,
    ...(next.colormap
      ? {
          colormap:
            next.colormap.name !== undefined
              ? clonePlanarColormap(next.colormap)
              : {
                  ...(clonePlanarColormap(current.colormap) || {}),
                  ...(clonePlanarColormap(next.colormap) || {}),
                },
        }
      : {}),
  };
}

export function toPlanarDataPresentation(
  properties: PlanarLegacyViewportProperties = {}
): PlanarDataPresentation {
  return {
    ...(properties.colormap
      ? {
          colormap: clonePlanarColormap(properties.colormap),
        }
      : {}),
    ...(properties.voiRange
      ? {
          voiRange: {
            lower: properties.voiRange.lower,
            upper: properties.voiRange.upper,
          },
        }
      : {}),
    ...(properties.invert !== undefined ? { invert: properties.invert } : {}),
    ...(properties.interpolationType !== undefined
      ? { interpolationType: properties.interpolationType }
      : {}),
    ...(properties.opacity !== undefined
      ? { opacity: properties.opacity }
      : {}),
    ...(properties.slabThickness !== undefined
      ? { slabThickness: properties.slabThickness }
      : {}),
    ...(properties.visible !== undefined
      ? { visible: properties.visible }
      : {}),
  };
}
