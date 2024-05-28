import RGB from './RGB';

type ColormapRegistration = {
  ColorSpace: string;
  Name: string;
  RGBPoints: RGB[] | number[];
};

type OpacityMapping = {
  /** value to map to opacity */
  value: number;
  /** opacity value */
  opacity: number;
};

type ColormapPublic = {
  /** name of the colormap */
  name?: string;
  opacity?: OpacityMapping[] | number;
  /** midpoint mapping between values to opacity if the colormap
   * is getting used for fusion, this is an array of arrays which
   * each array containing 2 values, the first value is the value
   * to map to opacity and the second value is the opacity value.
   * By default, the minimum value is mapped to 0 opacity and the
   * maximum value is mapped to 1 opacity, but you can configure
   * the points in the middle to be mapped to different opacities
   * instead of a linear mapping from 0 to 1.
   */
};

export type { ColormapRegistration, ColormapPublic, OpacityMapping };
