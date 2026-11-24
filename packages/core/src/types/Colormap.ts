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

/**
 * The colormap of the appearance of a display set. The alpha of a pixel is
 * `opacity * ramp(value)` of its appearance, where `ramp` is the
 * `opacityMapping` (1 everywhere without one), and 0 below `threshold`. The
 * one scalar opacity is the `opacity` of the appearance, 0 to 1.
 */
interface AppearanceColormap {
  /** The name of a registered colormap or of a vtk.js preset. */
  name?: string;
  /**
   * The opacity by value of the data: the values are values of the data
   * (a pixel value, a Hounsfield unit, an SUV), the opacity is linear between
   * two points and constant past the first and the last.
   */
  opacityMapping?: readonly OpacityMapping[];
  /**
   * A value of the data below which a pixel is transparent. An explicit null
   * clears it.
   */
  threshold?: number | null;
}

export type { ColormapRegistration, AppearanceColormap, OpacityMapping };
