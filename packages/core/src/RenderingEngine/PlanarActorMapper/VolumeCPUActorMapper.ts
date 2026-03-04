import { EPSILON } from '../../constants';
import { BlendModes, InterpolationType, VOILUTFunctionType } from '../../enums';
import drawImageSync from '../helpers/cpuFallback/drawImageSync';
import getDefaultViewport from '../helpers/cpuFallback/rendering/getDefaultViewport';
import getSpacingInNormalDirection from '../../utilities/getSpacingInNormalDirection';
import snapFocalPointToSlice from '../../utilities/snapFocalPointToSlice';
import VoxelManager from '../../utilities/VoxelManager';
import type {
  CPUFallbackEnabledElement,
  ICamera,
  IImage,
  IImageVolume,
  IVolumeInput,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  Point3,
} from '../../types';
import type {
  VolumeViewportScrollInfo,
  default as IVolumeActorMapper,
} from './IVolumeActorMapper';
import type { VolumeActorMapperContext } from './VolumeActorMapperContext';

type SliceArray = PixelDataTypedArray;

type SampledSliceState = {
  volumeId: string;
  image: IImage;
  interpolationType: InterpolationType;
  slabThickness: number;
  spacingInNormalDirection: number;
  // Camera focal point at sample time (used for resample invalidation checks).
  focalPoint: Point3;
  // Focal reference used to compute CPU fallback translation.
  // For orthogonal fast-path slices, this is the slice-center focal point.
  translationReferenceFocalPoint: Point3;
  right: Point3;
  up: Point3;
  normal: Point3;
  canvasWidth: number;
  canvasHeight: number;
};

type OrthogonalSliceSampleResult = {
  scalarData: SliceArray;
  width: number;
  height: number;
  columnPixelSpacing: number;
  rowPixelSpacing: number;
  minPixelValue: number;
  maxPixelValue: number;
  translationReferenceFocalPoint: Point3;
};

type CPUSliceRangeInfo = VolumeViewportScrollInfo & {
  min: number;
  max: number;
  current: number;
  spacingInNormalDirection: number;
  camera: ICamera;
  normal: Point3;
};

export default class VolumeCPUActorMapper implements IVolumeActorMapper {
  private pendingVolumeLoadCallbacks = new Set<string>();
  private cpuFallbackEnabledElement?: CPUFallbackEnabledElement;
  private sampledSliceState?: SampledSliceState;
  private cpuRenderingInvalidated = true;
  private sampleSequence = 0;
  private debug = {
    waitingForLoad: false,
    firstFrameRendered: false,
  };

  constructor(private context: VolumeActorMapperContext) {}

  /**
   * Replaces viewport volume data for CPU rendering.
   * @param volumeInputArray - Volumes to set on the viewport.
   * @param immediate - If true, render immediately after update.
   * @param suppressEvents - If true, skip event dispatch during setup.
   * @returns Promise resolved when CPU volumes are set.
   */
  public setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    this.invalidateSampledSlice();

    return this.context
      .setCPUVolumes(volumeInputArray, false, suppressEvents)
      .then(() => {
        if (immediate) {
          this.context.render();
        }
      });
  }

  /**
   * Appends viewport volume data for CPU rendering.
   * @param volumeInputArray - Volumes to append on the viewport.
   * @param immediate - If true, render immediately after update.
   * @param suppressEvents - If true, skip event dispatch during setup.
   * @returns Promise resolved when CPU volumes are appended.
   */
  public addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    this.invalidateSampledSlice();

    return this.context
      .setCPUVolumes(volumeInputArray, true, suppressEvents)
      .then(() => {
        if (immediate) {
          this.context.render();
        }
      });
  }

  /**
   * Returns viewport blend mode state for CPU rendering.
   * @param _filterActorUIDs - Unused in CPU path.
   * @returns Current viewport blend mode.
   */
  public getBlendMode(_filterActorUIDs: string[] = []): BlendModes {
    return this.context.getViewportBlendMode();
  }

  /**
   * Sets viewport blend mode for CPU rendering.
   * @param blendMode - Blend mode to apply.
   * @param _filterActorUIDs - Unused in CPU path.
   * @param immediate - If true, triggers an immediate render.
   * @returns void
   */
  public setBlendMode(
    blendMode: BlendModes,
    _filterActorUIDs: string[] = [],
    immediate = false
  ): void {
    this.context.setViewportBlendMode(blendMode);

    if (immediate) {
      this.context.render();
    }
  }

  /**
   * No clipping planes are required in the CPU path.
   * @param _camera - Unused camera argument.
   * @returns void
   */
  public ensureClippingPlanesForActors(_camera: ICamera): void {
    return;
  }

  /**
   * Sets slab thickness used by CPU slice sampling.
   * @param slabThickness - Requested slab thickness in world units.
   * @param _filterActorUIDs - Unused in CPU path.
   * @returns void
   */
  public setSlabThickness(
    slabThickness: number,
    _filterActorUIDs: string[] = []
  ): void {
    this.context.setViewportSlabThickness(Math.max(0.1, slabThickness));
    this.invalidateSampledSlice();
  }

  /**
   * Resets slab thickness override for CPU sampling.
   * @returns void
   */
  public resetSlabThickness(): void {
    this.context.setViewportSlabThickness(undefined);
    this.invalidateSampledSlice();
  }

  /**
   * CPU rendering does not expose clipping planes.
   * @returns Empty array.
   */
  public getSlicesClippingPlanes(): {
    sliceIndex: number;
    planes: {
      normal: Point3;
      origin: Point3;
    }[];
  }[] {
    return [];
  }

  /**
   * Returns scroll bounds/state for the target CPU volume.
   * @param volumeId - Target volume id.
   * @param useSlabThickness - If true, uses slab thickness as step size.
   * @returns Scroll state or undefined when unavailable.
   */
  public getScrollInfo(
    volumeId: string,
    useSlabThickness = false
  ): VolumeViewportScrollInfo | undefined {
    const sliceRangeInfo = this.getCPUSliceRangeInfo(
      volumeId,
      useSlabThickness
    );
    if (!sliceRangeInfo) {
      return;
    }

    const { numScrollSteps, currentStepIndex } = sliceRangeInfo;
    return { numScrollSteps, currentStepIndex };
  }

  /**
   * Scrolls CPU slice position along view normal.
   * @param volumeId - Target volume id.
   * @param delta - Number of scroll steps.
   * @param useSlabThickness - If true, uses slab thickness as step size.
   * @returns Scroll state after applying movement.
   */
  public scroll(
    volumeId: string,
    delta: number,
    useSlabThickness = false
  ): VolumeViewportScrollInfo | undefined {
    const sliceRangeInfo = this.getCPUSliceRangeInfo(
      volumeId,
      useSlabThickness
    );
    if (!sliceRangeInfo) {
      return;
    }

    const {
      min,
      max,
      current,
      spacingInNormalDirection,
      camera,
      normal,
      numScrollSteps,
      currentStepIndex,
    } = sliceRangeInfo;

    if (numScrollSteps === 0) {
      return { numScrollSteps, currentStepIndex };
    }

    const { focalPoint, position } = camera;
    const { newFocalPoint, newPosition } = snapFocalPointToSlice(
      focalPoint as Point3,
      position as Point3,
      { min, max, current },
      normal,
      spacingInNormalDirection,
      delta
    );

    this.context.setCamera({
      focalPoint: newFocalPoint,
      position: newPosition,
    });
    this.context.render();

    return { numScrollSteps, currentStepIndex };
  }

  /**
   * Samples scalar intensity at world coordinate in CPU volume data.
   * @param point - World coordinate.
   * @returns Scalar value if available.
   */
  public getIntensityFromWorld(point: Point3): number | undefined {
    const volume = this.context.getCPUPrimaryVolume();
    if (!volume) {
      return;
    }

    return this.sampleVolume(volume, point);
  }

  /**
   * Renders the current CPU-sampled slice onto the canvas fallback pipeline.
   * @returns void
   */
  public renderToCanvas(): void {
    const volume = this.context.getCPUPrimaryVolume();

    if (!volume) {
      this.fillWithBackgroundColor();
      return;
    }

    if (!this.ensureVolumeIsLoaded(volume)) {
      this.fillWithBackgroundColor();
      return;
    }

    const canvas = this.context.getCanvas();
    const width = canvas.width;
    const height = canvas.height;

    if (!width || !height) {
      return;
    }

    const camera = this.context.getCamera();
    const { right, up, normal } = this.context.getCPUCameraBasis(camera);
    const interpolationType =
      this.context.getViewportInterpolationType() ?? InterpolationType.LINEAR;
    const slabThickness = this.getEffectiveSlabThickness(volume, normal);

    if (
      this.shouldResampleSlice(
        volume,
        width,
        height,
        camera.focalPoint as Point3,
        right,
        up,
        normal,
        interpolationType,
        slabThickness
      )
    ) {
      const sampledSlice = this.sampleSliceImage(
        volume,
        width,
        height,
        camera,
        right,
        up,
        normal,
        interpolationType,
        slabThickness
      );

      this.sampledSliceState = sampledSlice;
      this.cpuRenderingInvalidated = true;
      this.setCPUFallbackImage(sampledSlice.image, volume);
    }

    if (!this.cpuFallbackEnabledElement?.image || !this.sampledSliceState) {
      this.fillWithBackgroundColor();
      return;
    }

    this.updateCPUFallbackViewport(
      this.cpuFallbackEnabledElement,
      this.sampledSliceState,
      camera
    );

    drawImageSync(this.cpuFallbackEnabledElement, this.cpuRenderingInvalidated);
    this.cpuRenderingInvalidated = false;

    if (!this.debug.firstFrameRendered) {
      this.debug.firstFrameRendered = true;
      this.context.logCPU('Rendered first CPU frame', {
        width,
        height,
        volumeId: volume.volumeId,
      });
    }
  }

  private ensureVolumeIsLoaded(volume: IImageVolume): boolean {
    const streamingLoadStatus = (
      volume as unknown as {
        loadStatus?: { loaded?: boolean };
      }
    ).loadStatus;

    if (!streamingLoadStatus || streamingLoadStatus.loaded) {
      return true;
    }

    if (!this.debug.waitingForLoad) {
      this.debug.waitingForLoad = true;
      this.context.logCPU('Waiting for volume streaming load to complete', {
        volumeId: volume.volumeId,
      });
    }

    if (!this.pendingVolumeLoadCallbacks.has(volume.volumeId)) {
      this.pendingVolumeLoadCallbacks.add(volume.volumeId);
      volume.load(() => {
        this.pendingVolumeLoadCallbacks.delete(volume.volumeId);
        this.debug.waitingForLoad = false;
        this.context.logCPU('Volume streaming load callback fired', {
          volumeId: volume.volumeId,
        });
        this.invalidateSampledSlice();
        this.context.render();
      });
    }

    return false;
  }

  private getEffectiveSlabThickness(
    volume: IImageVolume,
    normal: Point3
  ): number {
    const spacingInNormalDirection = Math.max(
      getSpacingInNormalDirection(volume, normal),
      EPSILON
    );

    return Math.max(
      this.context.getViewportSlabThickness() ?? spacingInNormalDirection,
      this.context.getRenderDefaultSlabThickness()
    );
  }

  private shouldResampleSlice(
    volume: IImageVolume,
    canvasWidth: number,
    canvasHeight: number,
    focalPoint: Point3,
    right: Point3,
    up: Point3,
    normal: Point3,
    interpolationType: InterpolationType,
    slabThickness: number
  ): boolean {
    const sampledSliceState = this.sampledSliceState;

    if (!sampledSliceState) {
      return true;
    }

    return (
      sampledSliceState.volumeId !== volume.volumeId ||
      sampledSliceState.canvasWidth !== canvasWidth ||
      sampledSliceState.canvasHeight !== canvasHeight ||
      sampledSliceState.interpolationType !== interpolationType ||
      Math.abs(sampledSliceState.slabThickness - slabThickness) > 1e-4 ||
      !this.arePointsClose(sampledSliceState.right, right) ||
      !this.arePointsClose(sampledSliceState.up, up) ||
      !this.arePointsClose(sampledSliceState.normal, normal) ||
      this.hasOutOfPlaneSliceChange(sampledSliceState, focalPoint) ||
      this.hasLargeInPlaneShift(sampledSliceState, focalPoint)
    );
  }

  private sampleSliceImage(
    volume: IImageVolume,
    width: number,
    height: number,
    camera: ICamera,
    right: Point3,
    up: Point3,
    normal: Point3,
    interpolationType: InterpolationType,
    slabThickness: number
  ): SampledSliceState {
    const orthogonalSlice = this.trySampleOrthogonalSliceFromVoxelManager(
      volume,
      camera,
      right,
      up,
      normal,
      slabThickness
    );

    if (orthogonalSlice) {
      const image = this.createSliceImage(
        volume,
        orthogonalSlice.scalarData,
        orthogonalSlice.width,
        orthogonalSlice.height,
        orthogonalSlice.columnPixelSpacing,
        orthogonalSlice.rowPixelSpacing,
        orthogonalSlice.minPixelValue,
        orthogonalSlice.maxPixelValue
      );

      return {
        volumeId: volume.volumeId,
        image,
        interpolationType,
        slabThickness,
        spacingInNormalDirection: Math.max(
          getSpacingInNormalDirection(volume, normal),
          EPSILON
        ),
        focalPoint: this.copyPoint3(camera.focalPoint as Point3),
        translationReferenceFocalPoint: this.copyPoint3(
          orthogonalSlice.translationReferenceFocalPoint
        ),
        right: this.copyPoint3(right),
        up: this.copyPoint3(up),
        normal: this.copyPoint3(normal),
        canvasWidth: width,
        canvasHeight: height,
      };
    }

    const parallelScale = Math.max(camera.parallelScale ?? 1, EPSILON);
    const worldHeight = parallelScale * 2;
    const worldWidth = worldHeight * (width / height);
    const xStep = worldWidth / width;
    const yStep = worldHeight / height;
    const xStart = -worldWidth / 2 + xStep / 2;
    const yStart = worldHeight / 2 - yStep / 2;
    const focalPoint = camera.focalPoint as Point3;
    const spacingInNormalDirection = Math.max(
      getSpacingInNormalDirection(volume, normal),
      EPSILON
    );
    const sampleCount = Math.max(
      1,
      Math.ceil(slabThickness / spacingInNormalDirection)
    );
    const slabHalfThickness = slabThickness / 2;
    const slabStep =
      sampleCount > 1 ? slabThickness / (sampleCount - 1) : slabThickness;
    const [volumeMin, volumeMax] = volume.voxelManager.getRange();
    const minPixelValue = Math.floor(
      Number.isFinite(volumeMin) ? volumeMin : 0
    );
    const maxPixelValue = Math.ceil(
      Number.isFinite(volumeMax) ? volumeMax : minPixelValue + 1
    );
    const useFloatData = this.isPTPrescaled(volume);
    const SliceArrayConstructor = this.getSliceArrayConstructor(
      minPixelValue,
      maxPixelValue,
      useFloatData
    );
    const sliceScalarData = new SliceArrayConstructor(width * height);

    let pixelIndex = 0;
    for (let y = 0; y < height; y++) {
      const yOffset = yStart - y * yStep;

      for (let x = 0; x < width; x++) {
        const xOffset = xStart + x * xStep;
        const basePoint = [
          focalPoint[0] + right[0] * xOffset + up[0] * yOffset,
          focalPoint[1] + right[1] * xOffset + up[1] * yOffset,
          focalPoint[2] + right[2] * xOffset + up[2] * yOffset,
        ] as Point3;

        let accumulated = 0;
        let validSamples = 0;
        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
          const sampleDistance =
            sampleCount === 1 ? 0 : -slabHalfThickness + sampleIndex * slabStep;
          const samplePoint = [
            basePoint[0] + normal[0] * sampleDistance,
            basePoint[1] + normal[1] * sampleDistance,
            basePoint[2] + normal[2] * sampleDistance,
          ] as Point3;
          const sampledValue = this.sampleVolume(
            volume,
            samplePoint,
            interpolationType
          );

          if (!Number.isNaN(sampledValue)) {
            accumulated += sampledValue;
            validSamples++;
          }
        }

        const intensity =
          validSamples > 0 ? accumulated / validSamples : minPixelValue;
        sliceScalarData[pixelIndex++] = this.toStoredIntensity(
          intensity,
          minPixelValue,
          maxPixelValue,
          useFloatData
        );
      }
    }

    const image = this.createSliceImage(
      volume,
      sliceScalarData,
      width,
      height,
      worldWidth / width,
      worldHeight / height,
      minPixelValue,
      maxPixelValue
    );

    return {
      volumeId: volume.volumeId,
      image,
      interpolationType,
      slabThickness,
      spacingInNormalDirection,
      focalPoint: this.copyPoint3(focalPoint),
      translationReferenceFocalPoint: this.copyPoint3(focalPoint),
      right: this.copyPoint3(right),
      up: this.copyPoint3(up),
      normal: this.copyPoint3(normal),
      canvasWidth: width,
      canvasHeight: height,
    };
  }

  private trySampleOrthogonalSliceFromVoxelManager(
    volume: IImageVolume,
    camera: ICamera,
    right: Point3,
    up: Point3,
    normal: Point3,
    slabThickness: number
  ): OrthogonalSliceSampleResult | undefined {
    const normalAxis = this.getIndexMajorAxis(volume, normal);
    const rightAxis = this.getIndexMajorAxis(volume, right);
    const upAxis = this.getIndexMajorAxis(volume, up);

    if (!normalAxis || !rightAxis || !upAxis) {
      return;
    }

    if (
      normalAxis.axis === rightAxis.axis ||
      normalAxis.axis === upAxis.axis ||
      rightAxis.axis === upAxis.axis
    ) {
      return;
    }

    const spacingInNormalDirection = Math.max(
      getSpacingInNormalDirection(volume, normal),
      EPSILON
    );
    const sampleCount = Math.max(
      1,
      Math.ceil(slabThickness / spacingInNormalDirection)
    );

    if (sampleCount !== 1) {
      return;
    }

    const planeDefinition = this.getSlicePlaneDefinition(normalAxis.axis);
    const downAxis = upAxis.axis;
    const downSign = -upAxis.sign;
    const rightSign = rightAxis.sign;

    const rightMatchesPlane =
      rightAxis.axis === planeDefinition.colAxis ||
      rightAxis.axis === planeDefinition.rowAxis;
    const downMatchesPlane =
      downAxis === planeDefinition.colAxis ||
      downAxis === planeDefinition.rowAxis;

    if (!rightMatchesPlane || !downMatchesPlane) {
      return;
    }

    const isDirect =
      rightAxis.axis === planeDefinition.colAxis &&
      downAxis === planeDefinition.rowAxis;
    const isSwapped =
      rightAxis.axis === planeDefinition.rowAxis &&
      downAxis === planeDefinition.colAxis;

    if (!isDirect && !isSwapped) {
      return;
    }

    const continuousIndex = this.worldToIndexContinuous(
      volume,
      camera.focalPoint as Point3
    );
    const normalIndex = Math.max(
      0,
      Math.min(
        volume.dimensions[normalAxis.axis] - 1,
        Math.round(continuousIndex[normalAxis.axis])
      )
    );

    const sourceData = volume.voxelManager.getSliceData({
      sliceIndex: normalIndex,
      slicePlane: planeDefinition.slicePlane,
    }) as SliceArray;

    const referenceIndex = [
      (volume.dimensions[0] - 1) / 2,
      (volume.dimensions[1] - 1) / 2,
      (volume.dimensions[2] - 1) / 2,
    ] as Point3;
    referenceIndex[normalAxis.axis] = normalIndex;
    const translationReferenceFocalPoint = this.indexToWorld(
      volume,
      referenceIndex
    );

    const sourceWidth = volume.dimensions[planeDefinition.colAxis];
    const sourceHeight = volume.dimensions[planeDefinition.rowAxis];
    const [volumeMin, volumeMax] = volume.voxelManager.getRange();
    const minPixelValue = Math.floor(
      Number.isFinite(volumeMin) ? volumeMin : 0
    );
    const maxPixelValue = Math.ceil(
      Number.isFinite(volumeMax) ? volumeMax : minPixelValue + 1
    );

    const createTypedArray = (length: number): SliceArray =>
      new (sourceData.constructor as new (n: number) => SliceArray)(length);

    if (isDirect) {
      const scalarData = this.reorientSliceData(
        sourceData,
        sourceWidth,
        sourceHeight,
        sourceWidth,
        sourceHeight,
        (x, y) => ({
          sourceX: rightSign > 0 ? x : sourceWidth - 1 - x,
          sourceY: downSign > 0 ? y : sourceHeight - 1 - y,
        }),
        createTypedArray
      );

      return {
        scalarData,
        width: sourceWidth,
        height: sourceHeight,
        columnPixelSpacing: volume.spacing[rightAxis.axis],
        rowPixelSpacing: volume.spacing[downAxis],
        minPixelValue,
        maxPixelValue,
        translationReferenceFocalPoint,
      };
    }

    const outputWidth = sourceHeight;
    const outputHeight = sourceWidth;
    const scalarData = this.reorientSliceData(
      sourceData,
      sourceWidth,
      sourceHeight,
      outputWidth,
      outputHeight,
      (x, y) => ({
        sourceX: downSign > 0 ? y : sourceWidth - 1 - y,
        sourceY: rightSign > 0 ? x : sourceHeight - 1 - x,
      }),
      createTypedArray
    );

    return {
      scalarData,
      width: outputWidth,
      height: outputHeight,
      columnPixelSpacing: volume.spacing[rightAxis.axis],
      rowPixelSpacing: volume.spacing[downAxis],
      minPixelValue,
      maxPixelValue,
      translationReferenceFocalPoint,
    };
  }

  private reorientSliceData(
    sourceData: SliceArray,
    sourceWidth: number,
    sourceHeight: number,
    outputWidth: number,
    outputHeight: number,
    sourceCoordFn: (
      outputX: number,
      outputY: number
    ) => { sourceX: number; sourceY: number },
    createTypedArray: (length: number) => SliceArray
  ): SliceArray {
    const hasIdentityMapping =
      sourceWidth === outputWidth &&
      sourceHeight === outputHeight &&
      sourceCoordFn(0, 0).sourceX === 0 &&
      sourceCoordFn(0, 0).sourceY === 0 &&
      sourceCoordFn(outputWidth - 1, outputHeight - 1).sourceX ===
        sourceWidth - 1 &&
      sourceCoordFn(outputWidth - 1, outputHeight - 1).sourceY ===
        sourceHeight - 1;

    if (hasIdentityMapping) {
      return sourceData;
    }

    const outputData = createTypedArray(outputWidth * outputHeight);
    let outputIndex = 0;

    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        const { sourceX, sourceY } = sourceCoordFn(x, y);
        const sourceIndex = sourceY * sourceWidth + sourceX;
        outputData[outputIndex++] = sourceData[sourceIndex];
      }
    }

    return outputData;
  }

  private getSlicePlaneDefinition(normalAxis: number): {
    slicePlane: 0 | 1 | 2;
    colAxis: 0 | 1 | 2;
    rowAxis: 0 | 1 | 2;
  } {
    if (normalAxis === 0) {
      return { slicePlane: 0, colAxis: 2, rowAxis: 1 };
    }

    if (normalAxis === 1) {
      return { slicePlane: 1, colAxis: 0, rowAxis: 2 };
    }

    return { slicePlane: 2, colAxis: 0, rowAxis: 1 };
  }

  private getIndexMajorAxis(
    volume: IImageVolume,
    worldVector: Point3,
    majorThreshold = 0.995
  ): { axis: 0 | 1 | 2; sign: 1 | -1 } | undefined {
    const row = volume.direction.slice(0, 3) as Point3;
    const col = volume.direction.slice(3, 6) as Point3;
    const scan = volume.direction.slice(6, 9) as Point3;
    const components = [
      this.dot(worldVector, row),
      this.dot(worldVector, col),
      this.dot(worldVector, scan),
    ] as [number, number, number];
    const absComponents = components.map((v) => Math.abs(v)) as [
      number,
      number,
      number,
    ];
    const maxValue = Math.max(...absComponents);
    const axis = absComponents.indexOf(maxValue) as 0 | 1 | 2;

    if (maxValue < majorThreshold) {
      return;
    }

    const secondary = absComponents
      .filter((_v, index) => index !== axis)
      .some((v) => v > 1 - majorThreshold);
    if (secondary) {
      return;
    }

    return {
      axis,
      sign: components[axis] >= 0 ? 1 : -1,
    };
  }

  private getCPUSliceRangeInfo(
    volumeId: string,
    useSlabThickness = false
  ): CPUSliceRangeInfo | undefined {
    const volume = this.context.getCPUPrimaryVolume(volumeId);
    if (!volume) {
      return;
    }

    const camera = this.context.getCamera();
    const { normal } = this.context.getCPUCameraBasis(camera);
    const corners = this.getVolumeCornersWorld(volume);

    let min = Infinity;
    let max = -Infinity;
    for (const point of corners) {
      const projection = this.dot(point as Point3, normal as Point3);
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    }

    const current = this.dot(camera.focalPoint as Point3, normal as Point3);
    const slabThickness = this.context.getViewportSlabThickness();
    const spacingInNormalDirection =
      useSlabThickness && slabThickness
        ? slabThickness
        : getSpacingInNormalDirection(volume, normal);
    const spacing = Math.max(spacingInNormalDirection, EPSILON);
    const numScrollSteps = Math.max(0, Math.round((max - min) / spacing));
    const currentStepIndex = Math.max(
      0,
      Math.min(numScrollSteps, Math.round((current - min) / spacing))
    );

    return {
      min,
      max,
      current,
      spacingInNormalDirection: spacing,
      numScrollSteps,
      currentStepIndex,
      camera,
      normal,
    };
  }

  private getVolumeCornersWorld(volume: IImageVolume): Point3[] {
    const [dx, dy, dz] = volume.dimensions;
    const corners: Point3[] = [
      [0, 0, 0],
      [dx - 1, 0, 0],
      [0, dy - 1, 0],
      [dx - 1, dy - 1, 0],
      [0, 0, dz - 1],
      [dx - 1, 0, dz - 1],
      [0, dy - 1, dz - 1],
      [dx - 1, dy - 1, dz - 1],
    ];

    return corners.map((ijk) => this.indexToWorld(volume, ijk));
  }

  private indexToWorld(volume: IImageVolume, ijk: Point3): Point3 {
    const [i, j, k] = ijk;
    const [sx, sy, sz] = volume.spacing;
    const [ox, oy, oz] = volume.origin;
    const row = volume.direction.slice(0, 3) as Point3;
    const col = volume.direction.slice(3, 6) as Point3;
    const scan = volume.direction.slice(6, 9) as Point3;

    return [
      ox + row[0] * sx * i + col[0] * sy * j + scan[0] * sz * k,
      oy + row[1] * sx * i + col[1] * sy * j + scan[1] * sz * k,
      oz + row[2] * sx * i + col[2] * sy * j + scan[2] * sz * k,
    ];
  }

  private createSliceImage(
    volume: IImageVolume,
    scalarData: SliceArray,
    width: number,
    height: number,
    columnPixelSpacing: number,
    rowPixelSpacing: number,
    minPixelValue: number,
    maxPixelValue: number
  ): IImage {
    const volumeVOIRange = this.getResolvedVOIRange(
      this.context.getViewportVOIRange(),
      minPixelValue,
      maxPixelValue
    );
    const windowWidth = Math.max(
      1,
      volumeVOIRange.upper - volumeVOIRange.lower
    );
    const windowCenter = (volumeVOIRange.lower + volumeVOIRange.upper) / 2;
    const imageId = `cpuVolumeSlice:${volume.volumeId}:${++this.sampleSequence}`;
    const isPTPrescaled = this.isPTPrescaled(volume);
    const voxelManager = VoxelManager.createImageVoxelManager({
      width,
      height,
      scalarData,
      numberOfComponents: 1,
      id: imageId,
    });

    return {
      imageId,
      intercept: 0,
      windowCenter,
      windowWidth,
      voiLUTFunction:
        this.context.getViewportVOILUTFunction() ?? VOILUTFunctionType.LINEAR,
      isPreScaled: isPTPrescaled,
      preScale: isPTPrescaled
        ? {
            enabled: true,
            scaled: true,
            scalingParameters: {
              modality: volume.metadata?.Modality,
            },
          }
        : undefined,
      scaling: volume.scaling,
      color: false,
      numberOfComponents: 1,
      dataType: scalarData.constructor.name as PixelDataTypedArrayString,
      slope: 1,
      minPixelValue,
      maxPixelValue,
      rows: height,
      columns: width,
      getCanvas: undefined,
      height,
      width,
      rgba: false,
      columnPixelSpacing,
      rowPixelSpacing,
      FrameOfReferenceUID: volume.metadata?.FrameOfReferenceUID,
      invert: false,
      getPixelData: () => scalarData,
      voxelManager,
      sizeInBytes: scalarData.byteLength,
    } as IImage;
  }

  private setCPUFallbackImage(image: IImage, volume: IImageVolume): void {
    const canvas = this.context.getCanvas();
    const previousRenderingTools =
      this.cpuFallbackEnabledElement?.renderingTools ?? {};

    this.cpuFallbackEnabledElement = {
      canvas,
      image,
      renderingTools: previousRenderingTools,
      viewport: getDefaultViewport(canvas, image, volume.metadata?.Modality),
    };
  }

  private updateCPUFallbackViewport(
    enabledElement: CPUFallbackEnabledElement,
    sampledSliceState: SampledSliceState,
    camera: ICamera
  ): void {
    const viewport = enabledElement.viewport;
    const parallelScale = Math.max(camera.parallelScale ?? 1, EPSILON);
    const rowPixelSpacing = sampledSliceState.image.rowPixelSpacing || 1;
    const columnPixelSpacing = sampledSliceState.image.columnPixelSpacing || 1;
    const clientHeight = Math.max(enabledElement.canvas.height, 1);
    const viewportVOIRange = this.getResolvedVOIRange(
      this.context.getViewportVOIRange(),
      sampledSliceState.image.minPixelValue ?? 0,
      sampledSliceState.image.maxPixelValue ?? 1
    );
    const lower = viewportVOIRange.lower;
    const upper = viewportVOIRange.upper;

    const translation = this.getInPlaneTranslation(sampledSliceState, camera);
    viewport.translation = translation;
    // CPU fallback transform applies non-square pixel correction separately
    // (via row/column spacing ratio), so use the base spacing axis here.
    const basePixelSpacing = Math.min(rowPixelSpacing, columnPixelSpacing);
    viewport.scale = (clientHeight * basePixelSpacing * 0.5) / parallelScale;
    viewport.parallelScale = parallelScale;
    viewport.invert = this.context.getViewportInvert();
    viewport.pixelReplication =
      this.context.getViewportInterpolationType() === InterpolationType.NEAREST;
    viewport.hflip = camera.flipHorizontal ?? false;
    viewport.vflip = camera.flipVertical ?? false;
    viewport.voi = {
      windowCenter: (lower + upper) / 2,
      windowWidth: Math.max(upper - lower, 1),
      voiLUTFunction:
        this.context.getViewportVOILUTFunction() ?? VOILUTFunctionType.LINEAR,
    };
  }

  private fillWithBackgroundColor(): void {
    this.context.fillCanvasWithBackgroundColor();
  }

  private sampleVolume(
    volume: IImageVolume,
    worldPos: Point3,
    interpolationType = this.context.getViewportInterpolationType() ??
      InterpolationType.LINEAR
  ): number {
    return interpolationType === InterpolationType.NEAREST
      ? this.sampleVolumeNearest(volume, worldPos)
      : this.sampleVolumeLinear(volume, worldPos);
  }

  private sampleVolumeNearest(volume: IImageVolume, worldPos: Point3): number {
    const [iC, jC, kC] = this.worldToIndexContinuous(volume, worldPos);
    const i = Math.round(iC);
    const j = Math.round(jC);
    const k = Math.round(kC);
    const [dx, dy, dz] = volume.dimensions;

    if (i < 0 || i >= dx || j < 0 || j >= dy || k < 0 || k >= dz) {
      return NaN;
    }

    return Number(volume.voxelManager.getAtIJK(i, j, k));
  }

  private sampleVolumeLinear(volume: IImageVolume, worldPos: Point3): number {
    const [i, j, k] = this.worldToIndexContinuous(volume, worldPos);
    const [dx, dy, dz] = volume.dimensions;

    if (i < 0 || i > dx - 1 || j < 0 || j > dy - 1 || k < 0 || k > dz - 1) {
      return NaN;
    }

    const i0 = Math.floor(i);
    const j0 = Math.floor(j);
    const k0 = Math.floor(k);
    const i1 = Math.min(i0 + 1, dx - 1);
    const j1 = Math.min(j0 + 1, dy - 1);
    const k1 = Math.min(k0 + 1, dz - 1);

    const di = i - i0;
    const dj = j - j0;
    const dk = k - k0;

    const c000 = Number(volume.voxelManager.getAtIJK(i0, j0, k0));
    const c100 = Number(volume.voxelManager.getAtIJK(i1, j0, k0));
    const c010 = Number(volume.voxelManager.getAtIJK(i0, j1, k0));
    const c110 = Number(volume.voxelManager.getAtIJK(i1, j1, k0));
    const c001 = Number(volume.voxelManager.getAtIJK(i0, j0, k1));
    const c101 = Number(volume.voxelManager.getAtIJK(i1, j0, k1));
    const c011 = Number(volume.voxelManager.getAtIJK(i0, j1, k1));
    const c111 = Number(volume.voxelManager.getAtIJK(i1, j1, k1));

    const c00 = c000 * (1 - di) + c100 * di;
    const c10 = c010 * (1 - di) + c110 * di;
    const c01 = c001 * (1 - di) + c101 * di;
    const c11 = c011 * (1 - di) + c111 * di;
    const c0 = c00 * (1 - dj) + c10 * dj;
    const c1 = c01 * (1 - dj) + c11 * dj;
    return c0 * (1 - dk) + c1 * dk;
  }

  private worldToIndexContinuous(
    volume: IImageVolume,
    worldPos: Point3
  ): Point3 {
    const delta = [
      worldPos[0] - volume.origin[0],
      worldPos[1] - volume.origin[1],
      worldPos[2] - volume.origin[2],
    ] as Point3;

    const row = volume.direction.slice(0, 3) as Point3;
    const col = volume.direction.slice(3, 6) as Point3;
    const scan = volume.direction.slice(6, 9) as Point3;

    return [
      (delta[0] * row[0] + delta[1] * row[1] + delta[2] * row[2]) /
        volume.spacing[0],
      (delta[0] * col[0] + delta[1] * col[1] + delta[2] * col[2]) /
        volume.spacing[1],
      (delta[0] * scan[0] + delta[1] * scan[1] + delta[2] * scan[2]) /
        volume.spacing[2],
    ];
  }

  private getSliceArrayConstructor(
    minPixelValue: number,
    maxPixelValue: number,
    useFloatData: boolean
  ): new (length: number) => SliceArray {
    if (useFloatData) {
      return Float32Array;
    }

    if (minPixelValue >= 0 && maxPixelValue <= 65535) {
      return Uint16Array;
    }

    if (minPixelValue >= -32768 && maxPixelValue <= 32767) {
      return Int16Array;
    }

    return Int32Array;
  }

  private toStoredIntensity(
    intensity: number,
    minPixelValue: number,
    maxPixelValue: number,
    useFloatData = false
  ): number {
    if (!Number.isFinite(intensity)) {
      return minPixelValue;
    }

    if (useFloatData) {
      return intensity;
    }

    const clamped = Math.min(maxPixelValue, Math.max(minPixelValue, intensity));
    return Math.round(clamped);
  }

  private isPTPrescaled(volume: IImageVolume): boolean {
    return volume.metadata?.Modality === 'PT' && volume.isPreScaled === true;
  }

  private getResolvedVOIRange(
    voiRange: { lower?: number; upper?: number } | undefined,
    fallbackLower: number,
    fallbackUpper: number
  ): { lower: number; upper: number } {
    const lower = voiRange?.lower;
    const upper = voiRange?.upper;
    const hasValidVOI =
      Number.isFinite(lower) &&
      Number.isFinite(upper) &&
      (upper as number) > (lower as number);

    if (hasValidVOI) {
      return { lower: lower as number, upper: upper as number };
    }

    if (fallbackUpper > fallbackLower) {
      return { lower: fallbackLower, upper: fallbackUpper };
    }

    return { lower: fallbackLower, upper: fallbackLower + 1 };
  }

  private arePointsClose(a: Point3, b: Point3, tolerance = 1e-4): boolean {
    return (
      Math.abs(a[0] - b[0]) <= tolerance &&
      Math.abs(a[1] - b[1]) <= tolerance &&
      Math.abs(a[2] - b[2]) <= tolerance
    );
  }

  private copyPoint3(point: Point3): Point3 {
    return [point[0], point[1], point[2]];
  }

  private hasOutOfPlaneSliceChange(
    sampledSliceState: SampledSliceState,
    focalPoint: Point3
  ): boolean {
    const focalDelta = this.subtractPoints(
      focalPoint,
      sampledSliceState.focalPoint
    );
    const deltaInNormal = Math.abs(
      this.dot(focalDelta, sampledSliceState.normal)
    );
    const outOfPlaneTolerance =
      sampledSliceState.spacingInNormalDirection * 0.5;

    return deltaInNormal > outOfPlaneTolerance;
  }

  private hasLargeInPlaneShift(
    sampledSliceState: SampledSliceState,
    focalPoint: Point3
  ): boolean {
    const focalDelta = this.subtractPoints(
      focalPoint,
      sampledSliceState.focalPoint
    );
    const columnPixelSpacing = sampledSliceState.image.columnPixelSpacing || 1;
    const rowPixelSpacing = sampledSliceState.image.rowPixelSpacing || 1;
    const shiftXPixels =
      Math.abs(this.dot(focalDelta, sampledSliceState.right)) /
      columnPixelSpacing;
    const shiftYPixels =
      Math.abs(this.dot(focalDelta, sampledSliceState.up)) / rowPixelSpacing;
    const maxShiftX = sampledSliceState.image.width * 0.35;
    const maxShiftY = sampledSliceState.image.height * 0.35;

    return shiftXPixels > maxShiftX || shiftYPixels > maxShiftY;
  }

  private getInPlaneTranslation(
    sampledSliceState: SampledSliceState,
    camera: ICamera
  ): { x: number; y: number } {
    const focalPoint = camera.focalPoint as Point3;
    const focalDelta = this.subtractPoints(
      focalPoint,
      sampledSliceState.translationReferenceFocalPoint
    );
    const columnPixelSpacing = sampledSliceState.image.columnPixelSpacing || 1;
    const rowPixelSpacing = sampledSliceState.image.rowPixelSpacing || 1;
    const shiftXPixels =
      this.dot(focalDelta, sampledSliceState.right) / columnPixelSpacing;
    const shiftYPixels =
      this.dot(focalDelta, sampledSliceState.up) / rowPixelSpacing;

    return {
      x: -shiftXPixels,
      y: shiftYPixels,
    };
  }

  private subtractPoints(a: Point3, b: Point3): Point3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  private dot(a: Point3, b: Point3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  private invalidateSampledSlice(): void {
    this.sampledSliceState = undefined;
    this.cpuRenderingInvalidated = true;
  }
}
