import provider from '@cornerstonejs/core/utilities/genericViewportDisplaySetMetadataProvider';
import { genericViewportDisplaySetMetadataProvider as registry } from '@cornerstonejs/core/utilities';
import { getRenderingEngine } from '@cornerstonejs/core';

export function register(imageIds: string[]) {
  provider.add('ct', { kind: 'planar', imageIds });
  registry.remove('pt');

  return getRenderingEngine('engine');
}
