import type { Point3 } from '../types';

export default function getVolumeViewReferenceId(args: {
  sliceIndex: number;
  viewPlaneNormal: Point3;
  volumeId: string;
}): string {
  const { sliceIndex, viewPlaneNormal, volumeId } = args;
  const querySeparator = volumeId.includes('?') ? '&' : '?';
  const formattedNormal = viewPlaneNormal.map((value) => value.toFixed(3));

  return `volumeId:${volumeId}${querySeparator}sliceIndex=${sliceIndex}&viewPlaneNormal=${formattedNormal.join(',')}`;
}
