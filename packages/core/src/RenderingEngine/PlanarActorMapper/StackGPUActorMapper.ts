import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import cache from '../../cache/cache';
import uuidv4 from '../../utilities/uuidv4';
import { isImageActor } from '../../utilities/actorCheck';
import { isEqual } from '../../utilities/isEqual';
import { updateVTKImageDataWithCornerstoneImage } from '../../utilities/updateVTKImageDataWithCornerstoneImage';
import * as windowLevelUtil from '../../utilities/windowLevel';

import type {
  IImage,
  IImageData,
  IStackInput,
  ImageActor,
  Mat3,
  Point3,
  VOIRange,
} from '../../types';
import type IStackActorMapper from './IStackActorMapper';
import type { StackGPUActorMapperContext } from './StackActorMapperContext';

export default class StackGPUActorMapper implements IStackActorMapper {
  constructor(private context: StackGPUActorMapperContext) {}

  public reset(): void {
    const renderer = this.context.getRenderer();
    const camera = vtkCamera.newInstance();
    renderer.setActiveCamera(camera);

    const viewPlaneNormal: Point3 = [0, 0, -1];
    const initialViewUp: Point3 = [0, -1, 0];
    this.context.setInitialViewUp(initialViewUp);

    camera.setDirectionOfProjection(
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2]
    );
    camera.setViewUp(...initialViewUp);
    camera.setParallelProjection(true);
    camera.setThicknessFromFocalPoint(0.1);
    camera.setFreezeFocalPoint(true);
  }

  public getImageData(): IImageData | undefined {
    const defaultActor = this.context.getDefaultActor();

    if (!defaultActor || !isImageActor(defaultActor)) {
      return;
    }

    const { actor } = defaultActor;
    const vtkImageData = actor.getMapper().getInputData();
    const csImage = this.context.getCSImage();

    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      get scalarData() {
        return csImage?.voxelManager.getScalarData();
      },
      imageData: actor.getMapper().getInputData(),
      metadata: {
        Modality: this.context.getModality(),
        FrameOfReferenceUID: this.context.getFrameOfReferenceUID(),
      },
      scaling: this.context.getScaling(),
      hasPixelSpacing: this.context.getHasPixelSpacing(),
      calibration: {
        ...csImage?.calibration,
        ...this.context.getCalibration(),
      },
      preScale: {
        ...csImage?.preScale,
      },
      voxelManager: csImage?.voxelManager,
    };
  }

  public addImages(stackInputs: IStackInput[]): void {
    const actors = [];

    stackInputs.forEach((stackInput) => {
      const { imageId, ...rest } = stackInput;
      const image = cache.getImage(imageId);

      const { origin, dimensions, direction, spacing, numberOfComponents } =
        this.context.getImageDataMetadata(image);

      const imagedata = this.createVTKImageData({
        origin,
        dimensions,
        direction,
        spacing,
        numberOfComponents,
        pixelArray: image.voxelManager.getScalarData(),
      });

      const imageActor = this.createActorMapper(imagedata);

      if (imageActor) {
        actors.push({
          uid: stackInput.actorUID ?? uuidv4(),
          actor: imageActor,
          referencedId: imageId,
          ...rest,
        });

        if (stackInput.callback) {
          stackInput.callback({ imageActor, imageId: stackInput.imageId });
        }
      }
    });

    this.context.addActors(actors);
  }

  public updateToDisplayImage(image: IImage): void {
    const sameImageData = this.checkVTKImageDataMatchesCornerstoneImage(
      image,
      this.context.getImageDataObject()
    );

    const viewPresentation = this.context.getViewPresentation();

    if (sameImageData && !this.context.getStackInvalidated()) {
      this.updateVTKImageDataFromCornerstoneImage(image);
      this.context.resetCameraNoEvent();
      this.context.setViewPresentation(viewPresentation);
      this.setPropertiesFromCache();
      this.context.setStackActorReInitialized(false);
      return;
    }

    const {
      origin,
      direction,
      dimensions,
      spacing,
      numberOfComponents,
      imagePixelModule,
    } = this.context.getImageDataMetadata(image);

    const pixelArray = image.voxelManager.getScalarData();
    this.createAndSetVTKImageData({
      origin,
      direction,
      dimensions,
      spacing,
      numberOfComponents,
      pixelArray,
    });

    this.updateVTKImageDataFromCornerstoneImage(image);

    const actor = this.createActorMapper(this.context.getImageDataObject());
    const oldActors = this.context.getActors();
    const viewportId = this.context.getViewportId();

    if (oldActors.length && oldActors[0].uid === viewportId) {
      oldActors[0].actor = actor;
    } else {
      oldActors.unshift({
        uid: viewportId,
        actor,
        referencedId: image.imageId,
      });
    }

    this.context.setActors(oldActors);

    const { viewPlaneNormal, viewUp } = this.getCameraOrientation(direction);
    const previousCamera = this.context.getCamera();

    this.context.setCameraNoEvent({ viewUp, viewPlaneNormal });
    this.context.setInitialViewUp(viewUp);
    this.context.resetCameraNoEvent();
    this.context.setViewPresentation(viewPresentation);
    this.context.triggerCameraEvent(this.context.getCamera(), previousCamera);

    const monochrome1 =
      imagePixelModule.photometricInterpretation === 'MONOCHROME1';

    this.context.setStackInvalidated(true);

    const voiRange = this.getInitialVOIRange(image);
    this.context.setVOI(voiRange, {
      forceRecreateLUTFunction: !!monochrome1,
    });

    this.context.setInitialInvert(!!monochrome1);
    this.context.setInvertColor(
      this.context.getInvert() || this.context.getInitialInvert()
    );
    this.context.setStackInvalidated(false);
    this.context.setStackActorReInitialized(true);

    if (this.context.shouldPublishCalibratedEvent()) {
      this.context.triggerCalibrationEvent();
    }
  }

  private createActorMapper(imageData: vtkImageData) {
    const mapper = vtkImageMapper.newInstance();
    mapper.setInputData(imageData);

    const actor = vtkImageSlice.newInstance();
    actor.setMapper(mapper);

    if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
      actor.getProperty().setIndependentComponents(false);
    }

    return actor;
  }

  private getCameraOrientation(imageDataDirection: Mat3): {
    viewPlaneNormal: Point3;
    viewUp: Point3;
  } {
    const viewPlaneNormal = imageDataDirection.slice(6, 9).map((x) => -x);
    const viewUp = imageDataDirection.slice(3, 6).map((x) => -x);

    return {
      viewPlaneNormal: [
        viewPlaneNormal[0],
        viewPlaneNormal[1],
        viewPlaneNormal[2],
      ],
      viewUp: [viewUp[0], viewUp[1], viewUp[2]],
    };
  }

  private createVTKImageData({
    origin,
    direction,
    dimensions,
    spacing,
    numberOfComponents,
    pixelArray,
  }) {
    const values = new pixelArray.constructor(pixelArray.length);
    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents,
      values,
    });
    const imageData = vtkImageData.newInstance();

    imageData.setDimensions(dimensions);
    imageData.setSpacing(spacing);
    imageData.setDirection(direction);
    imageData.setOrigin(origin);
    imageData.getPointData().setScalars(scalarArray);

    return imageData;
  }

  private createAndSetVTKImageData(params): void {
    try {
      this.context.setImageDataObject(this.createVTKImageData(params));
    } catch (e) {
      console.error(e);
    }
  }

  private checkVTKImageDataMatchesCornerstoneImage(
    image: IImage,
    imageData: vtkImageData
  ): boolean {
    if (!imageData) {
      return false;
    }

    const [xSpacing, ySpacing] = imageData.getSpacing();
    const [xVoxels, yVoxels] = imageData.getDimensions();
    const imagePlaneModule = this.getImagePlaneModule(image.imageId);
    const direction = imageData.getDirection();
    const rowCosines = direction.slice(0, 3);
    const columnCosines = direction.slice(3, 6);
    const dataType = imageData.getPointData().getScalars().getDataType();
    const isSameXSpacing = isEqual(xSpacing, image.columnPixelSpacing);
    const isSameYSpacing = isEqual(ySpacing, image.rowPixelSpacing);
    const isXSpacingValid =
      isSameXSpacing || (image.columnPixelSpacing === null && xSpacing === 1.0);
    const isYSpacingValid =
      isSameYSpacing || (image.rowPixelSpacing === null && ySpacing === 1.0);
    const isXVoxelsMatching = xVoxels === image.columns;
    const isYVoxelsMatching = yVoxels === image.rows;
    const isRowCosinesMatching = isEqual(
      imagePlaneModule.rowCosines,
      rowCosines as Point3
    );
    const isColumnCosinesMatching = isEqual(
      imagePlaneModule.columnCosines,
      columnCosines as Point3
    );
    const isDataTypeMatching =
      dataType === image.voxelManager.getScalarData().constructor.name;

    return (
      isXSpacingValid &&
      isYSpacingValid &&
      isXVoxelsMatching &&
      isYVoxelsMatching &&
      isRowCosinesMatching &&
      isColumnCosinesMatching &&
      isDataTypeMatching
    );
  }

  private updateVTKImageDataFromCornerstoneImage(image: IImage): void {
    const imagePlaneModule = this.getImagePlaneModule(image.imageId);
    let origin = imagePlaneModule.imagePositionPatient;

    if (origin == null) {
      origin = [0, 0, 0];
    }

    const imageData = this.context.getImageDataObject();
    imageData.setOrigin(origin);

    const actor = this.context.getActor(this.context.getViewportId());
    if (actor) {
      actor.referencedId = image.imageId;
    }

    updateVTKImageDataWithCornerstoneImage(imageData, image);
  }

  private getImagePlaneModule(imageId: string) {
    return this.context.getImagePlaneModule(imageId);
  }

  private setPropertiesFromCache(): void {
    const voiRange = this.getVOIFromCache();
    this.context.setVOI(voiRange);
    this.context.setInterpolationType(this.context.getInterpolationType());
    this.context.setInvertColor(this.context.getInvert());
  }

  private getVOIFromCache() {
    if (this.context.getVOIUpdatedWithSetProperties()) {
      return this.context.getVOIRange();
    }

    if (this.context.isCurrentImagePTPrescaled()) {
      return this.context.getDefaultPTPrescaledVOIRange();
    }

    return (
      this.context.getVOIRangeForCurrentImage() ?? this.context.getVOIRange()
    );
  }

  private getInitialVOIRange(image: IImage) {
    if (
      this.context.getVOIRange() &&
      this.context.getVOIUpdatedWithSetProperties()
    ) {
      return this.context.getVOIRange();
    }

    const { windowCenter, windowWidth, voiLUTFunction } = image;
    let voiRange = this.getVOIRangeFromWindowLevel(
      windowWidth,
      windowCenter,
      voiLUTFunction
    );
    voiRange = this.getPTPreScaledRange() || voiRange;

    return voiRange;
  }

  private getPTPreScaledRange() {
    if (!this.context.isCurrentImagePTPrescaled()) {
      return undefined;
    }

    return this.context.getDefaultPTPrescaledVOIRange();
  }

  private getVOIRangeFromWindowLevel(
    windowWidth,
    windowCenter,
    voiLUTFunction
  ): VOIRange | undefined {
    let center;
    let width;

    if (typeof windowCenter === 'number' && typeof windowWidth === 'number') {
      center = windowCenter;
      width = windowWidth;
    } else if (Array.isArray(windowCenter) && Array.isArray(windowWidth)) {
      center = windowCenter[0];
      width = windowWidth[0];
    }

    if (center !== undefined && width !== undefined) {
      return windowLevelUtil.toLowHighRange(width, center, voiLUTFunction);
    }
  }
}
