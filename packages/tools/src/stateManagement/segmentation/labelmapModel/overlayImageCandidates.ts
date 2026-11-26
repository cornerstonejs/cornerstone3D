import { metaData, utilities, Enums, type Types } from '@cornerstonejs/core';

/**
 * The widest difference of the sums of the coordinates of two image
 * positions that `isImageOnOverlayGeometry` of core still takes as one
 * position: each coordinate may differ by its tolerance of 1e-5.
 */
const POSITION_SUM_TOLERANCE = 1e-4;

type PlanarEntry = { positionSum: number; position: number };

type SizeGroup = {
  planar: PlanarEntry[];
  withoutOrientation: number[];
  withoutPosition: number[];
};

type ImagePlane = Partial<Types.ImagePlaneModule> | undefined;

function getImagePlane(imageId: string): ImagePlane {
  return metaData.get(Enums.MetadataModules.IMAGE_PLANE, imageId);
}

function getSizeKey(plane: ImagePlane): string {
  return `${plane.rows}|${plane.columns}`;
}

function getPositionSum(position: Types.Point3): number {
  return position[0] + position[1] + position[2];
}

/**
 * The URIs by which the reference checks of core match an image id: its URI
 * and the id without its scheme.
 */
function getImageURIs(imageId: string): string[] {
  const colonIndex = imageId.indexOf(':');
  const withoutScheme =
    colonIndex === -1 ? imageId : imageId.substring(colonIndex + 1);
  const uri = utilities.imageIdToURI(imageId);

  return uri === withoutScheme ? [uri] : [uri, withoutScheme];
}

function firstIndexAtLeast(entries: PlanarEntry[], value: number): number {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if (entries[middle].positionSum < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

/**
 * The images of a list, as the labelmap images of a segmentation, that can
 * lie on an image of a stack. A planar viewport takes an overlay image as
 * viewable on its image (`isReferenceViewable` with `asOverlay`) when it is
 * that image (the same URI) or lies on its geometry
 * (`isImageOnOverlayGeometry` of core: the same rows and columns, and the
 * same orientation and position when both have an orientation). This keeps
 * the images of the list by URI and by rows, columns and position, from one
 * read of the image plane of each, so the candidates of an image are found
 * without a pass over the list. A candidate can still fail the check of the
 * viewport, which decides; an image that is no candidate cannot pass it.
 */
export default class OverlayImageCandidates {
  private readonly positionsByURI = new Map<string, number[]>();
  private readonly groupsBySize = new Map<string, SizeGroup>();

  constructor(imageIds: ReadonlyArray<string | undefined>) {
    imageIds.forEach((imageId, position) => {
      if (!imageId) {
        return;
      }

      getImageURIs(imageId).forEach((uri) => {
        const positions = this.positionsByURI.get(uri) ?? [];

        positions.push(position);
        this.positionsByURI.set(uri, positions);
      });

      const plane = getImagePlane(imageId);

      if (!plane) {
        return;
      }

      const sizeKey = getSizeKey(plane);
      let group = this.groupsBySize.get(sizeKey);

      if (!group) {
        group = { planar: [], withoutOrientation: [], withoutPosition: [] };
        this.groupsBySize.set(sizeKey, group);
      }

      if (!plane.imageOrientationPatient) {
        group.withoutOrientation.push(position);
      } else if (!plane.imagePositionPatient) {
        group.withoutPosition.push(position);
      } else {
        group.planar.push({
          positionSum: getPositionSum(plane.imagePositionPatient),
          position,
        });
      }
    });

    this.groupsBySize.forEach((group) =>
      group.planar.sort((a, b) => a.positionSum - b.positionSum)
    );
  }

  /**
   * The positions in the list of the images that can lie on an image, in the
   * order of the list.
   */
  getCandidatePositions(imageId: string): number[] {
    const positions = new Set<number>();

    getImageURIs(imageId).forEach((uri) =>
      this.positionsByURI
        .get(uri)
        ?.forEach((position) => positions.add(position))
    );

    const plane = getImagePlane(imageId);
    const group = plane && this.groupsBySize.get(getSizeKey(plane));

    if (group) {
      group.withoutOrientation.forEach((position) => positions.add(position));

      if (!plane.imageOrientationPatient) {
        group.withoutPosition.forEach((position) => positions.add(position));
        group.planar.forEach(({ position }) => positions.add(position));
      } else if (plane.imagePositionPatient) {
        const positionSum = getPositionSum(plane.imagePositionPatient);
        const { planar } = group;

        for (
          let index = firstIndexAtLeast(
            planar,
            positionSum - POSITION_SUM_TOLERANCE
          );
          index < planar.length &&
          planar[index].positionSum <= positionSum + POSITION_SUM_TOLERANCE;
          index++
        ) {
          positions.add(planar[index].position);
        }
      }
    }

    return Array.from(positions).sort((a, b) => a - b);
  }
}
