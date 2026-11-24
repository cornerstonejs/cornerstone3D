import { getEnabledElement } from '@cornerstonejs/core';

export function VolumeLabel({ element, volumeId }) {
  const { viewport } = getEnabledElement(element);

  return <span>{viewport.getDisplaySetIdForVolumeId(volumeId)}</span>;
}
