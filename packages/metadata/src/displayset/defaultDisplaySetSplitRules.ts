import { isEcgInstance } from './isEcgInstance';
import { isImageInstance } from './isImageInstance';
import { isVideoInstance } from './isVideoInstance';
import { isWsiInstance } from './isWsiInstance';
import type { SplitRule } from './types';

const VOLUME_MODALITIES = new Set(['CT', 'MR', 'PT', 'NM']);

/**
 * Default display-set split rules (OHIF PR parity + video, ECG, volume3d).
 * Rules are evaluated in order; the first match wins. Each rule's `viewportTypes`
 * (index 0 = preferred) is applied to the resulting display set, so only rules
 * that add *other* attributes need a `customAttributes` callback.
 */
export const defaultDisplaySetSplitRules: SplitRule[] = [
  {
    id: 'video',
    viewportTypes: ['video'],
    matches: (instance) => isVideoInstance(instance),
    groupBy: ['SOPInstanceUID'],
  },

  {
    id: 'ecg',
    viewportTypes: ['ecg'],
    matches: (instance) => isEcgInstance(instance),
    groupBy: ['SOPInstanceUID'],
  },

  {
    id: 'wholeslide',
    viewportTypes: ['wholeslide'],
    // All microscopy levels of a series form a single whole-slide display set.
    matches: (instance) => isWsiInstance(instance),
    groupBy: ['SeriesInstanceUID'],
  },

  {
    id: 'singleImageModality',
    viewportTypes: ['stack'],
    matches: (instance) =>
      ['CR', 'DX', 'MG'].includes(instance.Modality ?? '') &&
      isImageInstance(instance) &&
      !!instance.Rows,
    // Split within the series by a coarse size bucket so differently-sized
    // images (e.g. MG views) become separate stacks. `SeriesInstanceUID` keeps
    // the bucket series-scoped (the entry point is per-series, but this stays
    // correct if ever fed multiple series). The `/64` rounding is a deliberately
    // fuzzy bucket and can straddle a boundary (480 -> 8, 544 -> 9).
    groupBy: [
      'SeriesInstanceUID',
      (instance) =>
        `rows=${Math.round(Number(instance.Rows) / 64)}&cols=${Math.round(Number(instance.Columns) / 64)}`,
    ],
  },

  {
    id: 'multiFrame',
    viewportTypes: ['stack'],
    // Assumes a homogeneous series: samples instances[0] for NumberOfFrames /
    // SliceLocation. The `SliceLocation !== undefined` guard mirrors OHIF - a
    // multi-frame object without a slice location is not treated as a clip here
    // and falls through to the volume/stack rules below.
    series: ({ instances }) => {
      const first = instances[0];
      return {
        isMultiFrame:
          Number(first?.NumberOfFrames) > 1 &&
          first?.SliceLocation !== undefined,
      };
    },
    matches: (_instance, { series }) => !!series.isMultiFrame,
    groupBy: ['SeriesInstanceUID', 'InstanceNumber'],
    customAttributes: ({ isMultiFrame }, options) => {
      // NumberOfFrames is frequently naturalized as a string (e.g. '30'); coerce
      // it so numImageFrames matches its declared `number` type.
      const numberOfFrames = options.instances[0]?.NumberOfFrames;
      return {
        isClip: true,
        numImageFrames:
          numberOfFrames === undefined ? undefined : Number(numberOfFrames),
        splitNumber: options.splitNumber,
        isMultiFrame,
      };
    },
  },

  /**
   * This rule splits off images containing an undefined bValue from the
   * 4d b-value containing images, since the undefined versions are not
   * part of the 4d data set.  That prevents applying incorrect 4d rendering
   * to the 3d portion.
   */
  {
    id: 'mixedDimensionalityBValue',
    viewportTypes: ['stack', 'volume', 'volume3d'],
    // Gates on instances[0].Modality (assumes a homogeneous-modality series),
    // then scans all instances for the mix of defined/undefined b-values.
    series: ({ instances }) => {
      const [instance] = instances;
      if (!instance || instance.Modality !== 'MR') {
        return { mixedBValue: false };
      }
      const hasBValue = instances.some((i) => i.DiffusionBValue !== undefined);
      const missingBValue = instances.some(
        (i) => i.DiffusionBValue === undefined
      );
      return { mixedBValue: hasBValue && missingBValue };
    },
    matches: (_instance, { series }) => !!series.mixedBValue,
    groupBy: [
      'SeriesInstanceUID',
      (instance) => instance.DiffusionBValue === undefined,
    ],
  },

  {
    id: 'volume3d',
    // Default volumetric series to MPR (volume); 3D is an extra allowed type.
    viewportTypes: ['volume', 'volume3d', 'stack'],
    // Assumes a homogeneous series: samples instances[0].Modality. A
    // heterogeneous series (e.g. a localizer first, then a volume) can be
    // misflagged - add a dedicated split rule (as `mixedDimensionalityBValue`
    // does for DWI) when a specific mix must be separated.
    series: ({ instances }) => {
      const modality = instances[0]?.Modality;
      return {
        supportsVolume3d:
          !!modality && VOLUME_MODALITIES.has(modality) && instances.length > 1,
      };
    },
    matches: (_instance, { series }) => !!series.supportsVolume3d,
    groupBy: ['SeriesInstanceUID'],
  },

  {
    id: 'defaultImageRule',
    viewportTypes: ['stack', 'volume', 'volume3d'],
    matches: (instance) => isImageInstance(instance) && !!instance.Rows,
  },
];
