/**
 * Removes the data loader scheme from the imageId or volumeId
 *
 * @param id - The imageId or volumeId
 * @returns the URI without the data loader scheme
 */
export default function idToURI(id: string): string {
  const colonIndex = id.indexOf(':');

  if (colonIndex === -1) {
    throw new Error('Invalid imageId or volumeId');
  }

  return id.substring(colonIndex + 1);
}
