export default function getDerivedImageId(
  imageId: string,
  imageIds: Array<string>,
  derivedImageIds: Array<string>
) {
  const index = imageIds.indexOf(imageId);
  if (index > -1) {
    return derivedImageIds[index];
  }
}
