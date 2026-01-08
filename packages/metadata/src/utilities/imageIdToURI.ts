/**
 * Removes the data loader scheme from the imageId
 *
 * @param imageId - Image ID
 * @returns imageId without the data loader scheme
 */
export default function imageIdToURI(imageId: string): string {
  const colonIndex = imageId.indexOf(':');
  return imageId.substring(colonIndex + 1);
}
