import canvasToPixel from '../helpers/cpuFallback/rendering/canvasToPixel';
import getDefaultViewport from '../helpers/cpuFallback/rendering/getDefaultViewport';
import pixelToCanvas from '../helpers/cpuFallback/rendering/pixelToCanvas';
import calculateTransform from '../helpers/cpuFallback/rendering/calculateTransform';
import { Transform } from '../helpers/cpuFallback/rendering/transform';
import cache from '../../cache/cache';
import uuidv4 from '../../utilities/uuidv4';
import * as windowLevelUtil from '../../utilities/windowLevel';

import type {
  CPUIImageData,
  IImage,
  ImageActor,
  Point3,
  IStackInput,
} from '../../types';
import type IStackActorMapper from './IStackActorMapper';
import type { StackCPUActorMapperContext } from './StackActorMapperContext';

export default class StackCPUActorMapper implements IStackActorMapper {
  constructor(private context: StackCPUActorMapperContext) {}

  /**
   * Initializes the CPU fallback enabled element state used by stack rendering.
   */
  public reset(): void {
    this.context.setCPUFallbackEnabledElement({
      canvas: this.context.getCanvas(),
      renderingTools: {},
      transform: new Transform(),
      viewport: { rotation: 0 },
    });
  }

  /**
   * Returns stack image data in a structure compatible with viewport tools/utilities.
   * Index/world conversions are routed through the CPU fallback canvas transform.
   *
   * @returns CPU image data for stack tools, or `undefined` when metadata is not ready.
   */
  public getImageData(): CPUIImageData | undefined {
    const cpuFallbackEnabledElement =
      this.context.getCPUFallbackEnabledElement();
    const { metadata } = cpuFallbackEnabledElement;

    if (!metadata) {
      return;
    }

    const spacing = metadata.spacing;
    const csImage = this.context.getCSImage();
    const calibration = this.context.getCalibration();
    const cpuImagePixelData = this.context.getCPUImagePixelData();

    return {
      dimensions: metadata.dimensions,
      spacing,
      origin: metadata.origin,
      direction: metadata.direction,
      metadata: {
        Modality: this.context.getModality(),
        FrameOfReferenceUID: this.context.getFrameOfReferenceUID(),
      },
      scaling: this.context.getScaling(),
      imageData: {
        getDirection: () => metadata.direction,
        getDimensions: () => metadata.dimensions,
        getScalarData: () => cpuImagePixelData,
        getSpacing: () => spacing,
        worldToIndex: (point: Point3) => {
          const canvasPoint = this.context.worldToCanvasCPU(point);
          const pixelCoord = canvasToPixel(
            cpuFallbackEnabledElement,
            canvasPoint
          );
          return [pixelCoord[0], pixelCoord[1], 0];
        },
        indexToWorld: (point: Point3, destPoint?: Point3) => {
          const canvasPoint = pixelToCanvas(cpuFallbackEnabledElement, [
            point[0],
            point[1],
          ]);

          return this.context.canvasToWorldCPU(canvasPoint, destPoint);
        },
      },
      scalarData: cpuImagePixelData,
      hasPixelSpacing: this.context.getHasPixelSpacing(),
      calibration: { ...csImage?.calibration, ...calibration },
      preScale: {
        ...csImage?.preScale,
      },
      voxelManager: csImage?.voxelManager,
    };
  }

  /**
   * Updates CPU fallback metadata, VOI, pixel data, and transform for the displayed image.
   *
   * @param image - Cornerstone image to make active for CPU stack rendering.
   */
  public updateToDisplayImage(image: IImage): void {
    const metadata = this.context.getImageDataMetadata(image);
    const cpuFallbackEnabledElement =
      this.context.getCPUFallbackEnabledElement();

    const cpuViewport = getDefaultViewport(
      this.context.getCanvas(),
      image,
      this.context.getModality(),
      cpuFallbackEnabledElement.viewport.colormap
    );

    const { windowCenter, windowWidth, voiLUTFunction } = cpuViewport.voi;
    this.context.setVOIRange(
      windowLevelUtil.toLowHighRange(windowWidth, windowCenter, voiLUTFunction)
    );

    cpuFallbackEnabledElement.image = image;
    cpuFallbackEnabledElement.metadata = {
      ...metadata,
    };
    this.context.setCPUImagePixelData(image.voxelManager.getScalarData());

    const viewportSettingToUse = Object.assign(
      {},
      cpuViewport,
      cpuFallbackEnabledElement.viewport
    );

    cpuFallbackEnabledElement.viewport = this.context.getStackInvalidated()
      ? cpuViewport
      : viewportSettingToUse;

    this.context.setStackInvalidated(false);
    this.context.setCPURenderingInvalidated(true);
    cpuFallbackEnabledElement.transform = calculateTransform(
      cpuFallbackEnabledElement
    );
  }

  /**
   * Creates and registers canvas actors for stack inputs in CPU mode.
   * This enables stack overlays such as labelmap segmentations.
   *
   * @param stackInputs - Stack actor definitions to append to the CPU actor list.
   */
  public addImages(stackInputs: IStackInput[]): void {
    const actors = [...this.context.getCPUActors()];

    stackInputs.forEach((stackInput) => {
      const { imageId, ...rest } = stackInput;
      const image = cache.getImage(imageId);

      if (!image) {
        return;
      }

      const imageActor = this.context.createActorMapper(image);
      const visibility = stackInput.visibility ?? true;
      imageActor.setVisibility?.(visibility);

      actors.push({
        uid: stackInput.actorUID ?? uuidv4(),
        actor: imageActor,
        referencedId: imageId,
        ...rest,
      });

      if (stackInput.callback) {
        stackInput.callback({
          imageActor: imageActor as unknown as ImageActor,
          imageId,
        });
      }
    });

    this.context.setCPUActors(actors);
    this.context.setCPURenderingInvalidated(true);
  }
}
