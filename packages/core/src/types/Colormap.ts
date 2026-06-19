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
  /** Overall (scalar) opacity level — e.g. a fusion/master slider value. On input an
   * `OpacityMapping[]` is still accepted (and treated as `opacityMapping` with an overall of 1)
   * for backward compatibility; `getColormap` always returns this as a number. */
  opacity?: OpacityMapping[] | number;
  /** Per-value opacity shape (e.g. a hanging-protocol mapping). Combined with `opacity` as
   * rendered_opacity(v) = opacity * opacityMapping(v), so the scalar level and the per-value
   * shape can be set/synchronized independently without one overwriting the other. */
  opacityMapping?: OpacityMapping[];
  /** threshold value for opacity mapping - values below the threshold will be transparent.
   * An explicit null clears thresholding. */
  threshold?: number | null;
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
