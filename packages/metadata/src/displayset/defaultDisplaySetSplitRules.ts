import { isEcgInstance } from './isEcgInstance';
import { isImageInstance } from './isImageInstance';
import { isVideoInstance } from './isVideoInstance';
import { isWsiInstance } from './isWsiInstance';
import type { SplitRule } from './types';

const VOLUME_MODALITIES = new Set(['CT', 'MR', 'PT', 'NM']);

/**
 * Default display-set split rules (OHIF PR parity + video, ECG, volume3d).
 * Rules are evaluated in order; the first match wins.
 * Each rule may set `viewportTypes` where index 0 is the preferred viewport.
 */
export const defaultDisplaySetSplitRules: SplitRule[] = [
  {
    id: 'video',
    viewportTypes: ['video'],
    ruleSelector: (instance) => isVideoInstance(instance),
    splitKey: ['SOPInstanceUID'],
    customAttributes: () => ({
      viewportTypes: ['video'],
    }),
  },

  {
    id: 'ecg',
    viewportTypes: ['ecg'],
    ruleSelector: (instance) => isEcgInstance(instance),
    splitKey: ['SOPInstanceUID'],
    customAttributes: () => ({
      viewportTypes: ['ecg'],
    }),
  },

  {
    id: 'wholeslide',
    viewportTypes: ['wholeslide'],
    // All microscopy levels of a series form a single whole-slide display set.
    ruleSelector: (instance) => isWsiInstance(instance),
    splitKey: ['SeriesInstanceUID'],
    customAttributes: () => ({
      viewportTypes: ['wholeslide'],
    }),
  },

  {
    id: 'singleImageModality',
    viewportTypes: ['stack'],
    ruleSelector: (instance) =>
      ['CR', 'DX', 'MG'].includes(instance.Modality ?? '') &&
      isImageInstance(instance) &&
      !!instance.Rows,
    splitKey: [
      (instance) =>
        `rows=${Math.round(Number(instance.Rows) / 64)}&cols=${Math.round(Number(instance.Columns) / 64)}`,
    ],
    customAttributes: () => ({
      viewportTypes: ['stack'],
    }),
  },

  {
    id: 'multiFrame',
    viewportTypes: ['stack'],
    updateSeriesInfo: (instances, seriesInfo) => {
      const first = instances[0];
      if (!first) {
        return;
      }
      const { NumberOfFrames, SliceLocation } = first;
      seriesInfo.isMultiFrame =
        Number(NumberOfFrames) > 1 && SliceLocation !== undefined;
    },
    ruleSelector: (_instance, seriesInfo) => !!seriesInfo.isMultiFrame,
    splitKey: ['SeriesInstanceUID', 'InstanceNumber'],
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
        viewportTypes: ['stack'],
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
    updateSeriesInfo: (instances, seriesInfo) => {
      const [instance] = instances;
      if (!instance || instance.Modality !== 'MR') {
        return;
      }
      const hasBValue = instances.some((i) => i.DiffusionBValue !== undefined);
      if (!hasBValue) {
        return;
      }
      const missingBValue = instances.some(
        (i) => i.DiffusionBValue === undefined
      );
      if (hasBValue && missingBValue) {
        seriesInfo.mixedBValue = true;
      }
    },
    ruleSelector: (_instance, seriesInfo) => !!seriesInfo.mixedBValue,
    splitKey: [
      'SeriesInstanceUID',
      (instance) => instance.DiffusionBValue === undefined,
    ],
    customAttributes: () => ({
      viewportTypes: ['stack', 'volume', 'volume3d'],
    }),
  },

  {
    id: 'volume3d',
    // Default volumetric series to MPR (volume); 3D is an extra allowed type.
    viewportTypes: ['volume', 'volume3d', 'stack'],
    updateSeriesInfo: (instances, seriesInfo) => {
      const modality = instances[0]?.Modality;
      if (modality && VOLUME_MODALITIES.has(modality) && instances.length > 1) {
        seriesInfo.supportsVolume3d = true;
      }
    },
    ruleSelector: (_instance, seriesInfo) => !!seriesInfo.supportsVolume3d,
    splitKey: ['SeriesInstanceUID'],
    customAttributes: () => ({
      viewportTypes: ['volume', 'volume3d', 'stack'],
    }),
  },

  {
    id: 'defaultImageRule',
    viewportTypes: ['stack', 'volume', 'volume3d'],
    ruleSelector: (instance) => isImageInstance(instance) && !!instance.Rows,
    customAttributes: () => ({
      viewportTypes: ['stack', 'volume', 'volume3d'],
    }),
  },
];
