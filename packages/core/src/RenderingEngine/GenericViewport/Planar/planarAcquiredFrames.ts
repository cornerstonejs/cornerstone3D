import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { isAcquisitionPlaneNormal } from '../../../utilities/isAcquisitionPlaneNormal';
import { VOILUTFunctionType } from '../../../enums';
import { ActorRenderMode } from '../../../types';
import type { ActorEntry, IImageVolume, Point3 } from '../../../types';
import { coreLog } from '../../../utilities/logger';
import type {
  LoadedData,
  RenderPathAttachment,
} from '../ViewportArchitectureTypes';
import type {
  PlanarDataPresentation,
  PlanarPayload,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportTypes';
import type {
  PlanarImageMapperRendering,
  PlanarVolumeSliceRendering,
} from './planarRuntimeTypes';
import { applyPlanarICameraToActor } from './planarRenderCamera';
import { getPlanarRenderPathActiveSourceICamera } from './planarRenderPathProjection';
import { VtkImageMapperRenderPath } from './VtkImageMapperRenderPath';

const log = coreLog.getLogger('RenderingEngine', 'planarAcquiredFrames');

/**
 * The actors that draw acquired frames. The overlay order of a volume slice
 * skips them, so a frame actor sits at the depth of its source.
 */
export const acquiredFrameActors = new WeakSet<object>();

/**
 * The translation that moves the frame of the nearest voxel slice onto the
 * plane of the focal point, so that an overlay at that plane stays in front.
 * Only the actor moves: the frame index, the events and the references keep
 * the nearest frame.
 */
function framePlaneOffset(
  imageVolume: IImageVolume,
  focalPoint: Point3,
  viewPlaneNormal: Point3
): Point3 {
  const { imageData } = imageVolume;
  const index = imageData.worldToIndex([...focalPoint]);

  index[2] = Math.round(index[2]);

  const framePoint = imageData.indexToWorld(index);
  const distance =
    (focalPoint[0] - framePoint[0]) * viewPlaneNormal[0] +
    (focalPoint[1] - framePoint[1]) * viewPlaneNormal[1] +
    (focalPoint[2] - framePoint[2]) * viewPlaneNormal[2];

  return [
    distance * viewPlaneNormal[0],
    distance * viewPlaneNormal[1],
    distance * viewPlaneNormal[2],
  ];
}

/**
 * The index in `imageIds` of the acquired frame nearest to a world point.
 *
 * The frame is the voxel slice `k = round(worldToIndex(point)[2])` of the
 * full-resolution volume grid. A labelmap that reslices the same grid with
 * nearest sampling rounds in the same way, so the frame and the labelmap stay
 * on one plane, also when the point is between two frames.
 *
 * @returns the index, or `undefined` when the point is outside the volume
 */
export function acquiredFrameIndexOfVolumePoint(
  imageVolume: IImageVolume,
  imageIds: string[],
  point: Point3
): number | undefined {
  const imageData = imageVolume.imageData;

  if (!imageData) {
    return;
  }

  const k = Math.round(imageData.worldToIndex([...point])[2]);

  if (!(k >= 0 && k < imageData.getDimensions()[2])) {
    return;
  }

  const imageId = imageVolume.imageIds?.[k];

  if (!imageId || imageIds[k] === imageId) {
    return k < imageIds.length ? k : undefined;
  }

  const imageIdIndex = imageIds.indexOf(imageId);

  return imageIdIndex >= 0 ? imageIdIndex : undefined;
}

/**
 * Adds the acquired frames to the volume slice attachment of a source.
 *
 * The binding keeps the volume slice render path for navigation, and keeps an
 * image path (`VtkImageMapperRenderPath`) mounted for the acquired frames. Both
 * actors stay in the renderer. The frame actor is visible only while the view
 * is in the acquisition plane, `canDrawAcquiredFrames` holds, and the frame of
 * the current plane has loaded; otherwise the volume slice actor is visible.
 *
 * The frame uses the presentation of the volume, with the default VOI of the
 * volume. The hidden rendering is excluded from the fidelity, so the indicator
 * follows the visible path.
 */
export function withAcquiredFrames(
  ctx: PlanarVtkVolumeAdapterContext,
  data: LoadedData<PlanarPayload>,
  volume: RenderPathAttachment<PlanarDataPresentation>
): RenderPathAttachment<PlanarDataPresentation> {
  const volumeRendering = volume.rendering as PlanarVolumeSliceRendering;
  const { imageVolume, imageIds } = volumeRendering;
  let frame: RenderPathAttachment<PlanarDataPresentation> | undefined;
  let mounting = false;
  let removed = false;
  let wantedIndex: number | undefined;

  const frameRendering = () =>
    frame?.rendering as PlanarImageMapperRendering | undefined;
  const isSource = () => ctx.viewport.isCurrentDataId(data.id);
  // The image path follows the volume camera, so it never drives the
  // renderer camera or the render mode of the viewport. As an overlay it sends
  // no STACK_NEW_IMAGE: the volume path sends the slice events of a scroll.
  const frameCtx = {
    ...ctx,
    viewport: { ...ctx.viewport, isCurrentDataId: () => false },
    display: {
      ...ctx.display,
      activateRenderMode: () => undefined,
      requestRender: () => {
        updateVisibility();
        ctx.display.requestRender();
      },
    },
  };
  // The volume slice draws a linear VOI and ignores `voiLUTFunction`, so the
  // frame does too. Limit: the frame has no colormap opacity table.
  const framePresentation = (): PlanarDataPresentation => ({
    ...volumeRendering.dataPresentation,
    voiRange:
      volumeRendering.dataPresentation?.voiRange ??
      volumeRendering.defaultVOIRange,
    voiLUTFunction: VOILUTFunctionType.LINEAR,
  });

  function updateVisibility(): void {
    const rendering = frameRendering();
    const showsFrame =
      wantedIndex !== undefined &&
      rendering?.currentImageIdIndex === wantedIndex;
    const visible = volumeRendering.dataPresentation?.visible !== false;

    volumeRendering.actor.setVisibility(visible && !showsFrame);

    if (!volumeRendering.isSegmentationOverlay) {
      // A hidden volume ignores its data events; read the record again.
      volumeRendering.fidelityStale ||=
        !showsFrame && volumeRendering.showsAcquiredFrame;
      volumeRendering.excludeFromFidelity = showsFrame;
    }

    volumeRendering.showsAcquiredFrame = showsFrame;

    if (!rendering) {
      return;
    }

    const camera = getPlanarRenderPathActiveSourceICamera(ctx);

    rendering.actor.setVisibility(visible && showsFrame);
    rendering.excludeFromFidelity = !showsFrame;
    applyPlanarICameraToActor({
      actor: rendering.actor,
      activeSourceICamera: camera,
    });

    if (showsFrame && camera) {
      rendering.actor.setPosition(
        ...framePlaneOffset(
          imageVolume,
          camera.focalPoint,
          camera.viewPlaneNormal
        )
      );
    }
  }

  async function mountFrame(imageIdIndex: number): Promise<void> {
    mounting = true;

    try {
      const image = await loadAndCacheImage(imageIds[imageIdIndex]);
      const attachment = await new VtkImageMapperRenderPath().addData(
        frameCtx,
        {
          ...data,
          image,
          imageData: undefined,
          initialImageIdIndex: imageIdIndex,
        } as LoadedData,
        { renderMode: ActorRenderMode.VTK_IMAGE, role: 'overlay' }
      );

      if (removed) {
        attachment.removeData();
        return;
      }

      frame = attachment;
      acquiredFrameActors.add(frameRendering().actor);
      frame.updateDataPresentation(framePresentation());
    } catch (error) {
      log.warn('The acquired frame did not load', error);
      return;
    } finally {
      mounting = false;
    }

    sync();
    ctx.display.requestRender();
  }

  function sync(): void {
    if (removed) {
      return;
    }

    const camera = getPlanarRenderPathActiveSourceICamera(ctx);

    wantedIndex =
      camera &&
      isSource() &&
      ctx.viewport.canDrawAcquiredFrames?.(data.id) &&
      isAcquisitionPlaneNormal(imageVolume, camera.viewPlaneNormal)
        ? acquiredFrameIndexOfVolumePoint(
            imageVolume,
            imageIds,
            camera.focalPoint
          )
        : undefined;

    if (wantedIndex !== undefined) {
      if (frame) {
        frame.applyViewState({
          ...ctx.viewport.getViewState(),
          slice: { kind: 'stackIndex', imageIdIndex: wantedIndex },
        });
      } else if (!mounting) {
        void mountFrame(wantedIndex);
      }
    }

    updateVisibility();
  }

  const frameActorEntry = (): ActorEntry | undefined => {
    const rendering = frameRendering();

    // No referencedId: a measurement tool must not see a second target.
    return (
      rendering && {
        uid: rendering.actorEntryUID,
        actor: rendering.actor,
        actorMapper: {
          actor: rendering.actor,
          mapper: rendering.mapper,
          renderMode: ActorRenderMode.VTK_IMAGE,
        } as ActorEntry['actorMapper'],
      }
    );
  };

  return {
    ...volume,
    updateDataPresentation: (props) => {
      volume.updateDataPresentation(props);
      frame?.updateDataPresentation(framePresentation());
      sync();
    },
    applyViewState: (viewState) => {
      volume.applyViewState(viewState);
      sync();
    },
    resize: () => {
      volume.resize?.();
      sync();
    },
    getActorEntries: (loadedData) =>
      [volume.getActorEntry?.(loadedData), frameActorEntry()].filter(Boolean),
    getRenderings: () =>
      frame ? [volume.rendering, frame.rendering] : [volume.rendering],
    removeData: () => {
      removed = true;
      frame?.removeData();
      volume.removeData();
    },
  };
}
