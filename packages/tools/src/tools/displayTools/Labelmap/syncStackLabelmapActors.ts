import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import {
  ActorRenderMode,
  cache,
  Enums,
  utilities,
  type Types,
} from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';
import { triggerSegmentationRender } from '../../../stateManagement/segmentation/SegmentationRenderingEngine';
import { isSegmentationOverlayCompatible } from '../../../stateManagement/segmentation/helpers/isSegmentationOverlayCompatible';
import { SegmentationRepresentations } from '../../../enums';
import { updateLabelmapSegmentationImageReferences } from '../../../stateManagement/segmentation/updateLabelmapSegmentationImageReferences';
import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/getSegmentationRepresentation';
import type { LabelmapRepresentation } from '../../../types/SegmentationStateTypes';
import { createLabelmapRepresentationUID } from './labelmapRepresentationUID';
import { setLabelmapColorAndOpacity } from './labelmapActorStyle';
import removeLabelmapRepresentationData from './removeLabelmapRepresentationData';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'tools.displayTools.Labelmap.syncStackLabelmapActors'
);

/**
 * Mounts the labelmap images of the image on display of a stack viewport, or
 * of the frame on display of a video viewport, removes the others and renders.
 * A video does not run the reference scan of
 * `updateLabelmapSegmentationImageReferences`: each labelmap image of a video
 * lies on the plane of every frame, so the scan matched all of them on each
 * frame, at a cost that grows with the square of the number of frames, and
 * nothing here reads its result.
 */
export function syncStackLabelmapActors(
  viewport: PlanarViewport,
  segmentationId: string
): void {
  if (
    typeof (viewport as { getCurrentImageId?: () => string })
      .getCurrentImageId !== 'function'
  ) {
    return;
  }

  const currentImageId = viewport.getCurrentImageId();

  if (!currentImageId) {
    return;
  }

  // Skip entirely when this stack viewport is not a compatible destination for
  // the labelmap (it displays none of the images the labelmap applies to).
  // Without this, an unrelated series gets a segmentation image actor added to
  // it, which corrupts its image-index overlay and inflates its navigable image
  // count. The low-level addImages/addActors stay permissive on purpose - the
  // compatibility decision lives in isSegmentationOverlayCompatible.
  if (
    !isSegmentationOverlayCompatible(
      viewport,
      segmentationId,
      SegmentationRepresentations.Labelmap
    )
  ) {
    return;
  }

  const isVideo =
    (viewport as Types.IViewport).type === Enums.ViewportType.VIDEO;

  if (!isVideo) {
    updateLabelmapSegmentationImageReferences(viewport.id, segmentationId);
  }

  const derivedImageIds =
    getCurrentLabelmapImageIdsForViewport(viewport.id, segmentationId) ?? [];
  const derivedImageIdSet = new Set(derivedImageIds);
  const labelmapActorEntries =
    getLabelmapActorEntries(viewport.id, segmentationId) ?? [];
  const staleActorEntries = labelmapActorEntries.filter(
    (actorEntry) => !derivedImageIdSet.has(actorEntry.referencedId)
  );

  // The viewport rebuilds the stack labelmap overlay actor per
  // slice. Carry the outgoing actor's color/opacity style onto the replacement
  // so it renders translucent (transparent background) from its first frame,
  // instead of painting opaque over the underlying image until the segmentation
  // style pass runs - which otherwise reads as a black flash while scrolling.
  const inheritedLabelmapStyle = captureLabelmapActorStyle(
    staleActorEntries[0]?.actor as { getProperty?: () => unknown } | undefined
  );

  let shouldTriggerSegmentationRender = false;
  let shouldRenderViewport = staleActorEntries.length > 0;

  if (staleActorEntries.length) {
    staleActorEntries.forEach((actorEntry) => {
      removeLabelmapRepresentationData(viewport, segmentationId, actorEntry);
    });

    shouldTriggerSegmentationRender = true;
  }

  const renderMode = getViewportLabelmapRenderMode(viewport);
  const defaultActorRenderMode = viewport.getDefaultActor?.()?.actorMapper
    ?.renderMode as Types.ActorRenderMode | undefined;
  const drawsOnCanvas =
    isVideo ||
    (renderMode === 'image' &&
      defaultActorRenderMode === ActorRenderMode.CPU_IMAGE);
  const currentImage =
    cache.getImage(currentImageId) ||
    ({
      imageId: currentImageId,
    } as Types.IImage);
  const currentOrigin = drawsOnCanvas
    ? undefined
    : viewport.getImageDataMetadata(currentImage).origin;

  derivedImageIds.forEach((derivedImageId) => {
    const derivedImage = cache.getImage(derivedImageId);

    if (!derivedImage) {
      cs3dLogger.warn(
        'No derived image found in the cache for segmentation representation',
        { segmentationId, derivedImageId }
      );
      return;
    }

    const segmentationActorEntry = getLabelmapActorEntries(
      viewport.id,
      segmentationId
    )?.find((actorEntry) => actorEntry.referencedId === derivedImageId);

    if (!segmentationActorEntry) {
      const representationUID = createLabelmapRepresentationUID({
        segmentationId,
        referencedId: derivedImage.imageId,
      });

      if (drawsOnCanvas) {
        viewport.addImages([
          {
            displaySetId: representationUID,
            imageId: derivedImageId,
            reference: {
              kind: 'segmentation',
              segmentationId,
              representationUID,
              labelmapId: derivedImage.imageId,
            },
            representationUID,
            // FIDELITY-STATE-9: labelmap overlay actors are out of fidelity scope.
            excludeFromFidelity: true,
          },
        ]);
      } else {
        const { dimensions, spacing, direction } =
          viewport.getImageDataMetadata(derivedImage);
        const constructor = derivedImage.voxelManager.getConstructor();
        const newPixelData = derivedImage.voxelManager.getScalarData();
        // @ts-expect-error vtk.js accepts typed array constructors here.
        const values = new constructor(newPixelData);
        const scalarArray = vtkDataArray.newInstance({
          dataType: vtkDataArray.getDataType(values as never),
          name: 'Pixels',
          numberOfComponents: 1,
          values,
        });
        const imageData = vtkImageData.newInstance();

        imageData.setDimensions(dimensions[0], dimensions[1], 1);
        imageData.setSpacing(spacing);
        imageData.setDirection(direction);
        imageData.setOrigin(currentOrigin);
        imageData.getPointData().setScalars(scalarArray);
        imageData.modified();

        viewport.addImages([
          {
            displaySetId: representationUID,
            imageId: derivedImageId,
            reference: {
              kind: 'segmentation',
              segmentationId,
              representationUID,
              labelmapId: derivedImage.imageId,
            },
            representationUID,
            // FIDELITY-STATE-9: labelmap overlay actors are out of fidelity scope.
            excludeFromFidelity: true,
            callback: ({ imageActor }) => {
              imageActor.getMapper().setInputData(imageData);
              applyInheritedLabelmapStyle(
                imageActor as never,
                inheritedLabelmapStyle
              );
            },
          },
        ]);
      }

      shouldTriggerSegmentationRender = true;
      shouldRenderViewport = true;
      return;
    }

    const actorMapper = segmentationActorEntry.actorMapper as
      | {
          mapper?: {
            getInputData: () => unknown;
          };
        }
      | undefined;
    const mapper = actorMapper?.mapper
      ? actorMapper.mapper
      : segmentationActorEntry.actor.getMapper();
    const segmentationImageData = mapper.getInputData();

    segmentationImageData.modified();

    if (segmentationImageData.setDerivedImage) {
      segmentationImageData.setDerivedImage(derivedImage);
    } else {
      utilities.updateVTKImageDataWithCornerstoneImage(
        segmentationImageData,
        derivedImage
      );
    }

    shouldRenderViewport = true;
  });

  if (isVideo && shouldTriggerSegmentationRender) {
    styleVideoLabelmapActors(viewport, segmentationId);
  }

  if (shouldTriggerSegmentationRender) {
    triggerSegmentationRender(viewport.id);
  }

  if (shouldRenderViewport) {
    viewport.render();
  }
}

/**
 * Gives the labelmap actors of a video viewport the style of their
 * representation at once. A video gets a new actor for each frame while it
 * plays; without this, each frame would first show without its labelmap,
 * until the next segmentation render styles the new actor.
 */
function styleVideoLabelmapActors(
  viewport: Types.IViewport,
  segmentationId: string
): void {
  const representation = getSegmentationRepresentations(viewport.id, {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  })[0] as LabelmapRepresentation | undefined;

  if (!representation) {
    return;
  }

  getLabelmapActorEntries(viewport.id, segmentationId)?.forEach(
    (actorEntry) => {
      setLabelmapColorAndOpacity(viewport.id, actorEntry, representation);
    }
  );
}

/**
 * Captures the color (RGB transfer function) and opacity style from an existing
 * labelmap actor so it can be carried onto a replacement actor.
 */
function captureLabelmapActorStyle(
  actor: { getProperty?: () => unknown } | undefined
): { cfun?: unknown; ofun?: unknown } | undefined {
  const prop = actor?.getProperty?.() as
    | {
        getRGBTransferFunction?: (idx: number) => unknown;
        getScalarOpacity?: (idx: number) => unknown;
      }
    | undefined;

  if (!prop) {
    return undefined;
  }

  return {
    cfun: prop.getRGBTransferFunction?.(0),
    ofun: prop.getScalarOpacity?.(0),
  };
}

/**
 * Styles a freshly mounted stack labelmap overlay actor so its very first frame
 * is translucent with a transparent background (label 0), instead of rendering
 * opaque over the underlying image until setLabelmapColorAndOpacity runs. The
 * latter would read as a whole-viewport black flash while scrolling a stack
 * segmentation (the overlay actor is rebuilt per slice on the native viewport).
 * Inherits the outgoing actor's transfer functions when available so colors are
 * also correct immediately; the segmentation style pass refreshes them after.
 */
function applyInheritedLabelmapStyle(
  actor:
    | {
        getProperty?: () => unknown;
        setForceTranslucent?: (value: boolean) => void;
        setForceOpaque?: (value: boolean) => void;
      }
    | undefined,
  style: { cfun?: unknown; ofun?: unknown } | undefined
): void {
  const prop = actor?.getProperty?.() as
    | {
        setRGBTransferFunction?: (idx: number, fn: unknown) => void;
        setScalarOpacity?: (idx: number, fn: unknown) => void;
        setUseLookupTableScalarRange?: (value: boolean) => void;
        setInterpolationTypeToNearest?: () => void;
      }
    | undefined;

  if (!prop) {
    return;
  }

  if (style?.cfun && prop.setRGBTransferFunction) {
    prop.setRGBTransferFunction(0, style.cfun);
  }

  if (style?.ofun && prop.setScalarOpacity) {
    prop.setScalarOpacity(0, style.ofun);
  } else if (prop.setScalarOpacity) {
    // No inherited opacity (e.g. first mount): default background to transparent.
    const ofun = vtkPiecewiseFunction.newInstance();
    ofun.addPoint(0, 0);
    ofun.addPoint(1, 1);
    ofun.setClamping(false);
    prop.setScalarOpacity(0, ofun);
  }

  prop.setUseLookupTableScalarRange?.(true);
  prop.setInterpolationTypeToNearest?.();
  actor?.setForceTranslucent?.(true);
  actor?.setForceOpaque?.(false);
}
