import { Enums, metaData } from '@cornerstonejs/core';
import {
  createDisplaySetFromGroup,
  defaultDisplaySetSplitRules,
  splitSeriesInstanceGroupsFromImageIds,
  utilities as metadataUtilities,
  type IDisplaySet,
  type NaturalizedInstance,
} from '@cornerstonejs/metadata';
import createImageIdsAndCacheMetaData from './createImageIdsAndCacheMetaData';

export type CreateDisplaySetsOptions = {
  StudyInstanceUID: string;
  SeriesInstanceUID: string;
  SOPInstanceUID?: string;
  wadoRsRoot: string;
  client?: unknown;
  convertMultiframe?: boolean;
  useLegacyWadoRs?: boolean;
};

const { splitImageIdsBy4DTags } = metadataUtilities;
const { ViewportType } = Enums;

/** Maps a display set's preferred viewport type hint to a cornerstone ViewportType. */
const VIEWPORT_TYPE_BY_PREFERRED_HINT: Record<string, Enums.ViewportType> = {
  stack: ViewportType.STACK,
  volume: ViewportType.ORTHOGRAPHIC,
  volume3d: ViewportType.VOLUME_3D,
  video: ViewportType.VIDEO,
  wholeslide: ViewportType.WHOLE_SLIDE,
  ecg: ViewportType.ECG,
};

/**
 * Resolves the cornerstone {@link Enums.ViewportType} to enable for a display
 * set, based on its preferred viewport type. Falls back to a stack viewport.
 */
export function getViewportTypeForDisplaySet(
  displaySet: IDisplaySet
): Enums.ViewportType {
  return (
    VIEWPORT_TYPE_BY_PREFERRED_HINT[displaySet.preferredViewportType] ??
    ViewportType.STACK
  );
}

export type Select4DDimensionGroupsOptions = {
  /** 1-based inclusive start dimension group (default 1) */
  fromGroup?: number;
  /** 1-based inclusive end dimension group (default last group) */
  toGroup?: number;
  /** Take the last N dimension groups */
  lastCount?: number;
};

function toBaseImageId(imageId: string): string {
  const wadorsFrameIndex = imageId.indexOf('/frames/');
  if (wadorsFrameIndex > 0) {
    return imageId.slice(0, wadorsFrameIndex + 8) + '1';
  }

  const uriFrameIndex = imageId.indexOf('&frame=');
  if (uriFrameIndex > 0) {
    return imageId.slice(0, uriFrameIndex + 7) + '1';
  }

  return imageId;
}

/**
 * Naturalized instance for display-set splitting (one row per SOP, base imageId).
 */
export function getNaturalizedInstanceForDisplaySetSplit(
  imageId: string
): NaturalizedInstance | undefined {
  const instance = metaData.get(
    'instance',
    imageId
  ) as NaturalizedInstance | undefined;

  if (!instance) {
    return undefined;
  }

  return {
    ...instance,
    imageId: toBaseImageId(imageId),
  };
}

function getInstanceLevelImageIds(imageIds: string[]): string[] {
  const bySop = new Map<string, string>();

  for (const imageId of imageIds) {
    const instance = getNaturalizedInstanceForDisplaySetSplit(imageId);
    if (!instance) {
      continue;
    }

    const sopUid = instance.SOPInstanceUID as string | undefined;
    const key = sopUid ?? imageId;
    if (!bySop.has(key)) {
      bySop.set(key, instance.imageId ?? toBaseImageId(imageId));
    }
  }

  return [...bySop.values()];
}

function collectFrameImageIdsForGroup(
  seriesImageIds: string[],
  groupInstances: NaturalizedInstance[]
): string[] {
  const sopUids = new Set(
    groupInstances
      .map(instance => instance.SOPInstanceUID)
      .filter(Boolean) as string[]
  );

  if (!sopUids.size) {
    return seriesImageIds;
  }

  return seriesImageIds.filter(imageId => {
    const instance = getNaturalizedInstanceForDisplaySetSplit(imageId);
    return instance?.SOPInstanceUID && sopUids.has(instance.SOPInstanceUID);
  });
}

/**
 * Splits a loaded series' imageIds using {@link defaultDisplaySetSplitRules}.
 */
export function splitDisplaySetsFromImageIds(
  seriesImageIds: string[]
): IDisplaySet[] {
  const instanceLevelImageIds = getInstanceLevelImageIds(seriesImageIds);

  const groups = splitSeriesInstanceGroupsFromImageIds(instanceLevelImageIds, {
    getNaturalizedInstance: getNaturalizedInstanceForDisplaySetSplit,
    splitRules: defaultDisplaySetSplitRules,
  });

  return groups.map(group =>
    createDisplaySetFromGroup(group, {
      imageIds: collectFrameImageIdsForGroup(seriesImageIds, group.instances),
    })
  );
}

/**
 * Fetches a series' imageIds (caching its metadata) and splits them into
 * display sets using the default split rules. This combines
 * {@link createImageIdsAndCacheMetaData} with {@link splitDisplaySetsFromImageIds}
 * so examples can go straight from a series query to display sets.
 */
export async function createDisplaySets(
  options: CreateDisplaySetsOptions
): Promise<IDisplaySet[]> {
  const seriesImageIds = await createImageIdsAndCacheMetaData(options);
  return splitDisplaySetsFromImageIds(seriesImageIds);
}

/**
 * Resolves the underlying imageId for a video display set (replaces hard-coded SOP lookup).
 */
export function getVideoImageIdFromImageIds(
  seriesImageIds: string[]
): string | undefined {
  const displaySets = splitDisplaySetsFromImageIds(seriesImageIds);
  const videoDisplaySet = displaySets.find(
    displaySet => displaySet.preferredViewportType === 'video'
  );

  if (!videoDisplaySet) {
    return undefined;
  }

  return videoDisplaySet.underlyingImageIds[0];
}

/**
 * Frame-level imageIds for the primary stack-oriented display set in a series.
 */
export function getPrimaryStackFrameImageIds(
  seriesImageIds: string[]
): string[] {
  const displaySets = splitDisplaySetsFromImageIds(seriesImageIds);

  const primaryDisplaySet =
    displaySets.find(displaySet => {
      const preferred = displaySet.preferredViewportType;
      return preferred === 'stack' || preferred === 'volume3d';
    }) ?? displaySets[0];

  if (!primaryDisplaySet) {
    return seriesImageIds;
  }

  const frameImageIds = [...primaryDisplaySet.imageIds];
  return frameImageIds.length ? frameImageIds : seriesImageIds;
}

/**
 * Frame-level imageIds for the primary volume-oriented display set (volume3d/volume).
 */
export function getVolumeFrameImageIds(seriesImageIds: string[]): string[] {
  const displaySets = splitDisplaySetsFromImageIds(seriesImageIds);

  const volumeDisplaySet =
    displaySets.find(
      displaySet => displaySet.preferredViewportType === 'volume3d'
    ) ??
    displaySets.find(
      displaySet => displaySet.preferredViewportType === 'volume'
    ) ??
    displaySets[0];

  if (!volumeDisplaySet) {
    return seriesImageIds;
  }

  const frameImageIds = [...volumeDisplaySet.imageIds];
  return frameImageIds.length ? frameImageIds : seriesImageIds;
}

/**
 * Splits a series into 4D dimension groups using DICOM 4D tags
 * ({@link splitImageIdsBy4DTags}) after applying default display-set rules.
 */
export function get4DDimensionGroupImageIds(seriesImageIds: string[]): string[][] {
  const volumeFrameImageIds = getVolumeFrameImageIds(seriesImageIds);
  const { imageIdGroups } = splitImageIdsBy4DTags(volumeFrameImageIds);
  return imageIdGroups;
}

/**
 * ImageIds for a dynamic (4D) volume, optionally restricted to dimension groups.
 * Group indices are 1-based in `fromGroup` / `toGroup`.
 */
export function get4DVolumeImageIds(
  seriesImageIds: string[],
  options: Select4DDimensionGroupsOptions = {}
): string[] {
  let groups = get4DDimensionGroupImageIds(seriesImageIds);

  if (options.lastCount !== undefined) {
    groups = groups.slice(-options.lastCount);
  } else if (options.fromGroup !== undefined || options.toGroup !== undefined) {
    const fromIndex = Math.max(0, (options.fromGroup ?? 1) - 1);
    const toIndex = options.toGroup ?? groups.length;
    groups = groups.slice(fromIndex, toIndex);
  }

  return groups.flat();
}
