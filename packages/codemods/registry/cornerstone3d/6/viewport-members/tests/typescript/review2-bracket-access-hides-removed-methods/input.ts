import type { Types } from '@cornerstonejs/core';

export function read(vp: Types.IStackViewport, viewport: unknown) {
  const properties = vp['getProperties']();
  const camera = vp["getCamera"]();
  const uid = vp['uid'];
  const named = (viewport as { getCamera(): unknown })['getCamera']();
  const kept = vp['getCurrentImageId']();

  return [properties, camera, uid, named, kept];
}
