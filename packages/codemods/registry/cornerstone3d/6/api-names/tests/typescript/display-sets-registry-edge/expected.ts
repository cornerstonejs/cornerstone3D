import {
  metaData,
  utilities,
  displaySetRegistry as coreDisplaySetRegistry,
} from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';

const displaySetRegistry = new Map<string, string>();

export function register(imageIds: string[], videoId: string, type: string) {
  let provider = coreDisplaySetRegistry;

  provider.add('ct', { kind: 'planar', imageIds });
  coreDisplaySetRegistry.add('ct-quoted', {
    imageIds,
  });
  coreDisplaySetRegistry.add('video', {
    kind: pickKind(),
    'imageId': videoId,
  });
  coreDisplaySetRegistry.add(
    'ct-built',
    imageIds.length ? { imageIds } : { imageId: imageIds[0] }
  );

  metaData.addProvider(coreDisplaySetRegistry.get);
  displaySetRegistry.set('ct', 'local');

  return [
    utilities['genericViewportDisplaySetMetadataProvider'],
    coreDisplaySetRegistry.get(type, 'ct'),
    metaData.get('genericViewportDisplaySet', 'ct'),
    coreDisplaySetRegistry.VIEWPORT_V2_DISPLAY_SET,
  ];
}

export function lookUp(displaySetId: string) {
  const { logger } = utilities;

  logger.getLogger('example', 'lookUp');

  return coreDisplaySetRegistry.get(
    displaySetId
  );
}

export function reference(viewport: PlanarViewport, dataId: string) {
  const ref: Types.ViewReference = viewport.getViewReference();

  viewport.setViewReference({ ...ref, displaySetId: dataId });

  return ref['displaySetId'];
}

declare function pickKind(): string;
