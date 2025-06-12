import type RGB from './RGB';

interface ColormapRegistration {
  ColorSpace: string;
  Name: string;
  name?: string;
  RGBPoints: RGB[] | number[];
}

interface OpacityMapping {
  /** value to map to opacity */
  value: number;
  /** opacity value */
  opacity: number;
}

interface ColormapPublic {
  /** name of the colormap */
  name?: string;
  /** opacity value or mapping */
  opacity?: OpacityMapping[] | number;
  /** threshold value (0-1) for opacity mapping - values below the threshold will be transparent */
  threshold?: number;
  /** midpoint mapping between values to opacity if the colormap
   * is getting used for fusion, this is an array of arrays which
   * each array containing 2 values, the first value is the value
   * to map to opacity and the second value is the opacity value.
   * By default, the minimum value is mapped to 0 opacity and the
   * maximum value is mapped to 1 opacity, but you can configure
   * the points in the middle to be mapped to different opacities
   * instead of a linear mapping from 0 to 1.
   */
}

export type { ColormapRegistration, ColormapPublic, OpacityMapping };
