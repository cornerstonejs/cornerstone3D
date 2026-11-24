import { metaData, utilities } from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';

const displaySetRegistry = new Map<string, string>();

export function register(imageIds: string[], videoId: string, type: string) {
  let provider = utilities.genericViewportDisplaySetMetadataProvider;

  provider.add('ct', { kind: 'planar', imageIds });
  utilities.genericViewportDisplaySetMetadataProvider.add('ct-quoted', {
    'kind': 'planar',
    imageIds,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add('video', {
    kind: pickKind(),
    'sourceDataId': videoId,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(
    'ct-built',
    imageIds.length ? { imageIds } : { imageId: imageIds[0] }
  );

  metaData.addProvider(utilities.genericViewportDisplaySetMetadataProvider.get);
  displaySetRegistry.set('ct', 'local');

  return [
    utilities['genericViewportDisplaySetMetadataProvider'],
    utilities.genericViewportDisplaySetMetadataProvider.get(type, 'ct'),
    metaData.get('genericViewportDisplaySet', 'ct'),
    utilities.genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
  ];
}

export function lookUp(displaySetId: string) {
  const { genericViewportDisplaySetMetadataProvider, logger } = utilities;

  logger.getLogger('example', 'lookUp');

  return genericViewportDisplaySetMetadataProvider.get(
    genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
    displaySetId
  );
}

export function reference(viewport: PlanarViewport, dataId: string) {
  const ref: Types.ViewReference = viewport.getViewReference();

  viewport.setViewReference({ ...ref, dataId });

  return ref['dataId'];
}

declare function pickKind(): string;
