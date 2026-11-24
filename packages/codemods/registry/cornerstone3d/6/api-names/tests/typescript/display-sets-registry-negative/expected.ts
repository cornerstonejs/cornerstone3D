import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

type DisplaySet = { displaySetInstanceUID: string; imageIds: string[] };

/** OHIF's own service: its names and its registry stay. */
export class DisplaySetService {
  private readonly registry = new Map<string, DisplaySet>();

  add(displaySetInstanceUID: string, displaySet: DisplaySet & { kind: string }) {
    this.registry.set(displaySetInstanceUID, displaySet);
  }

  getDisplaySetByUID(displaySetInstanceUID: string) {
    return this.registry.get(displaySetInstanceUID);
  }
}

export function getDisplaySetUIDForDataId(dataId: string): string {
  const end = dataId.indexOf('::');

  return end === -1 ? dataId : dataId.slice(0, end);
}

export function mount(service: DisplaySetService, viewport: Types.IViewport) {
  const dataId = getDisplaySetUIDForDataId('uid-1::volume');

  service.add(dataId, { displaySetInstanceUID: dataId, imageIds: [], kind: 'planar' });

  return [csUtils.imageIdToURI(dataId), viewport.id];
}
