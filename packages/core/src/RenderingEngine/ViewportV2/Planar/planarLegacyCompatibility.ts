import type {
  OrientationVectors,
  StackViewportProperties,
  VolumeViewportProperties,
} from '../../../types';
import type {
  PlanarDataPresentation,
  PlanarOrientation,
} from './PlanarViewportV2Types';

export type PlanarLegacyViewportProperties = Partial<
  StackViewportProperties &
    VolumeViewportProperties &
    Pick<PlanarDataPresentation, 'opacity' | 'visible'>
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
          colormap: {
            ...properties.colormap,
            ...(properties.colormap.opacity?.length
              ? {
                  opacity: properties.colormap.opacity.map((point) => [
                    ...point,
                  ]),
                }
              : {}),
            ...(properties.colormap.threshold?.length
              ? {
                  threshold: [...properties.colormap.threshold],
                }
              : {}),
          },
        }
      : {}),
    ...(properties.orientation
      ? {
          orientation: clonePlanarOrientation(properties.orientation),
        }
      : {}),
  };
}

export function toPlanarDataPresentation(
  properties: PlanarLegacyViewportProperties = {}
): PlanarDataPresentation {
  return {
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
