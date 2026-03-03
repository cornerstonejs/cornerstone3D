import canvasToPixel from '../helpers/cpuFallback/rendering/canvasToPixel';
import getDefaultViewport from '../helpers/cpuFallback/rendering/getDefaultViewport';
import pixelToCanvas from '../helpers/cpuFallback/rendering/pixelToCanvas';
import calculateTransform from '../helpers/cpuFallback/rendering/calculateTransform';
import { Transform } from '../helpers/cpuFallback/rendering/transform';
import * as windowLevelUtil from '../../utilities/windowLevel';

import type { CPUIImageData, IImage, Point3, IStackInput } from '../../types';
import type IStackActorMapper from './IStackActorMapper';
import type { StackCPUActorMapperContext } from './StackActorMapperContext';

export default class StackCPUActorMapper implements IStackActorMapper {
  constructor(private context: StackCPUActorMapperContext) {}

  public reset(): void {
    this.context.setCPUFallbackEnabledElement({
      canvas: this.context.getCanvas(),
      renderingTools: {},
      transform: new Transform(),
      viewport: { rotation: 0 },
    });
  }

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

  public addImages(_stackInputs: IStackInput[]): void {
    throw this.context.getCPUFallbackError('addImages');
  }
}
