/**
 * Removes the data loader scheme from the imageId
 *
 * @param imageId - Image ID
 * @returns imageId without the data loader scheme, or empty string if imageId is falsy
 */
export default function imageIdToURI(imageId: string): string {
  if (!imageId) {
    return '';
  }

  const colonIndex = imageId.indexOf(':');
  return colonIndex === -1 ? imageId : imageId.substring(colonIndex + 1);
}
