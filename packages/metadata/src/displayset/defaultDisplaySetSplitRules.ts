import { isEcgInstance } from './isEcgInstance';
import { isImageSopClass } from './isImageSopClass';
import { isVideoInstance } from './isVideoInstance';
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
    id: 'singleImageModality',
    viewportTypes: ['stack'],
    ruleSelector: (instance) =>
      ['CR', 'DX', 'MG'].includes(instance.Modality ?? '') &&
      isImageSopClass(instance.SOPClassUID) &&
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
    makeSeriesInfo: (instances, seriesInfo) => {
      const { NumberOfFrames, SliceLocation } = instances[0];
      seriesInfo.isMultiFrame =
        Number(NumberOfFrames) > 1 && SliceLocation !== undefined;
    },
    ruleSelector: (_instance, seriesInfo) => !!seriesInfo.isMultiFrame,
    splitKey: ['SeriesInstanceUID', 'InstanceNumber'],
    customAttributes: ({ isMultiFrame }, options) => ({
      isClip: true,
      numImageFrames: options.instances[0]?.NumberOfFrames,
      splitNumber: options.splitNumber,
      isMultiFrame,
      viewportTypes: ['stack'],
    }),
  },

  {
    id: 'mixedDimensionalityBValue',
    viewportTypes: ['stack', 'volume', 'volume3d'],
    makeSeriesInfo: (instances, seriesInfo) => {
      const [instance] = instances;
      if (instance.Modality !== 'MR') {
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
    viewportTypes: ['volume3d', 'volume', 'stack'],
    makeSeriesInfo: (instances, seriesInfo) => {
      const modality = instances[0]?.Modality;
      if (modality && VOLUME_MODALITIES.has(modality) && instances.length > 1) {
        seriesInfo.supportsVolume3d = true;
      }
    },
    ruleSelector: (_instance, seriesInfo) => !!seriesInfo.supportsVolume3d,
    splitKey: ['SeriesInstanceUID'],
    customAttributes: () => ({
      viewportTypes: ['volume3d', 'volume', 'stack'],
    }),
  },

  {
    id: 'defaultImageRule',
    viewportTypes: ['stack', 'volume', 'volume3d'],
    ruleSelector: (instance) =>
      isImageSopClass(instance.SOPClassUID) && !!instance.Rows,
    customAttributes: () => ({
      viewportTypes: ['stack', 'volume', 'volume3d'],
    }),
  },
];
