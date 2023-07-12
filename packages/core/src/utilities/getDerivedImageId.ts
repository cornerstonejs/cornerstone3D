import imageIdToURI from './imageIdToURI';

export default function getDerivedImageId(imageId: string): string {
  return 'stackSeg:derived_' + imageIdToURI(imageId);
}
