import { vec3 } from 'gl-matrix';
import { EPSILON } from '../../../constants';
import { InterpolationType, VOILUTFunctionType } from '../../../enums';
import { resolveCPUFallbackColormap } from '../../helpers/cpuFallback/colors';
import type {
  CPUFallbackEnabledElement,
  ICamera,
  IImage,
  IImageVolume,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  Point2,
  Point3,
  VOIRange,
} from '../../../types';
import VoxelManager from '../../../utilities/VoxelManager';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import getSpacingInNormalDirection from '../../../utilities/getSpacingInNormalDirection';
import type { PlanarDataPresentation } from './PlanarViewportTypes';
import { getPlanarScaleRatio } from './planarCameraScale';

type SliceArray = PixelDataTypedArray;
type ColorSample = number[];
type SampledVoxelValue = number | ColorSample;

export type PlanarCPUSampledSliceState = {
  image: IImage;
  focalPoint: Point3;
  translationReferenceFocalPoint: Point3;
  right: Point3;
  up: Point3;
  normal: Point3;
  spacingInNormalDirection: number;
  canvasWidth: number;
  canvasHeight: number;
  interpolationType: InterpolationType;
};

type OrthogonalSliceSampleResult = {
  scalarData: SliceArray;
  width: number;
  height: number;
  columnPixelSpacing: number;
  rowPixelSpacing: number;
  minPixelValue: number;
  maxPixelValue: number;
  numberOfComponents: number;
  translationReferenceFocalPoint: Point3;
};

function dot(a: Point3, b: Point3): number {
  return vec3.dot(a as unknown as vec3, b as unknown as vec3);
}

function subtractPoints(a: Point3, b: Point3): Point3 {
  return vec3.subtract(
    [0, 0, 0] as vec3,
    a as unknown as vec3,
    b as unknown as vec3
  ) as Point3;
}

function arePointsClose(a: Point3, b: Point3, tolerance = 1e-4): boolean {
  return vec3.distance(a as unknown as vec3, b as unknown as vec3) <= tolerance;
}

function getIndexMajorAxis(
  volume: IImageVolume,
  worldVector: Point3,
  majorThreshold = 0.995
): { axis: 0 | 1 | 2; sign: 1 | -1 } | undefined {
  const row = volume.direction.slice(0, 3) as Point3;
  const col = volume.direction.slice(3, 6) as Point3;
  const scan = volume.direction.slice(6, 9) as Point3;
  const components = [
    dot(worldVector, row),
    dot(worldVector, col),
    dot(worldVector, scan),
  ] as [number, number, number];
  const absComponents = components.map((value) => Math.abs(value)) as [
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
    .filter((_value, index) => index !== axis)
    .some((value) => value > 1 - majorThreshold);

  if (secondary) {
    return;
  }

  return {
    axis,
    sign: components[axis] >= 0 ? 1 : -1,
  };
}

function indexToWorld(volume: IImageVolume, ijk: Point3): Point3 {
  const [i, j, k] = ijk;
  const [sx, sy, sz] = volume.spacing;
  const row = volume.direction.slice(0, 3) as Point3;
  const col = volume.direction.slice(3, 6) as Point3;
  const scan = volume.direction.slice(6, 9) as Point3;
  const world = vec3.copy(
    [0, 0, 0] as vec3,
    volume.origin as unknown as vec3
  ) as Point3;

  vec3.scaleAndAdd(
    world as unknown as vec3,
    world as unknown as vec3,
    row as unknown as vec3,
    sx * i
  );
  vec3.scaleAndAdd(
    world as unknown as vec3,
    world as unknown as vec3,
    col as unknown as vec3,
    sy * j
  );
  vec3.scaleAndAdd(
    world as unknown as vec3,
    world as unknown as vec3,
    scan as unknown as vec3,
    sz * k
  );

  return world;
}

function worldVectorToContinuousIndexDelta(
  volume: IImageVolume,
  worldVector: Point3
): Point3 {
  const row = volume.direction.slice(0, 3) as Point3;
  const col = volume.direction.slice(3, 6) as Point3;
  const scan = volume.direction.slice(6, 9) as Point3;

  return [
    dot(worldVector, row) / volume.spacing[0],
    dot(worldVector, col) / volume.spacing[1],
    dot(worldVector, scan) / volume.spacing[2],
  ];
}

export default class PlanarCPUVolumeSampler {
  private sampleSequence = 0;
  private scalarRangeCache = new WeakMap<
    NonNullable<IImageVolume['voxelManager']>,
    { min: number; max: number }
  >();

  public clearCachedScalarRange(
    voxelManager: NonNullable<IImageVolume['voxelManager']>
  ): void {
    this.scalarRangeCache.delete(voxelManager);
  }

  private getScalarDataRange(
    voxelManager: NonNullable<IImageVolume['voxelManager']>
  ): { min: number; max: number } {
    let scalarData: ArrayLike<number>;

    if (voxelManager.getCompleteScalarDataArray) {
      scalarData = voxelManager.getCompleteScalarDataArray();
    } else {
      scalarData = voxelManager.getScalarData();
    }

    let min = Infinity;
    let max = -Infinity;

    for (let index = 0; index < scalarData.length; index++) {
      const value = Number(scalarData[index]);

      if (!Number.isFinite(value)) {
        continue;
      }

      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }
    }

    return { min, max };
  }

  public getCameraBasis(camera: ICamera<unknown>): {
    right: Point3;
    up: Point3;
    normal: Point3;
  } {
    const normal = vec3.normalize(
      vec3.create(),
      camera.viewPlaneNormal as Point3
    ) as Point3;
    const rawUp = vec3.normalize(vec3.create(), camera.viewUp as Point3);
    let right = vec3.cross(vec3.create(), rawUp, normal);

    if (vec3.length(right) < EPSILON) {
      right = vec3.cross(vec3.create(), [0, 1, 0], normal);
    }

    right = vec3.normalize(vec3.create(), right) as Point3;
    const up = vec3.normalize(
      vec3.create(),
      vec3.cross(vec3.create(), normal, right)
    ) as Point3;

    return { right, up, normal };
  }

  public getResolvedVOIRange(
    voiRange: VOIRange | undefined,
    fallbackLower: number,
    fallbackUpper: number
  ): VOIRange {
    if (
      voiRange &&
      Number.isFinite(voiRange.lower) &&
      Number.isFinite(voiRange.upper) &&
      voiRange.upper > voiRange.lower
    ) {
      return voiRange;
    }

    if (fallbackUpper > fallbackLower) {
      return { lower: fallbackLower, upper: fallbackUpper };
    }

    return { lower: fallbackLower, upper: fallbackLower + 1 };
  }

  public getFallbackStoredRange(volume: IImageVolume): {
    min: number;
    max: number;
  } {
    const voxelManager = volume.voxelManager;
    const [volumeMin, volumeMax] = voxelManager.getRange();
    let min = Number.isFinite(volumeMin) ? Math.floor(volumeMin) : 0;
    let max = Number.isFinite(volumeMax) ? Math.ceil(volumeMax) : min + 1;

    if (max <= min) {
      const cachedRange = this.scalarRangeCache.get(voxelManager);

      if (cachedRange) {
        return cachedRange;
      }

      const resolvedRange = this.getScalarDataRange(voxelManager);

      if (Number.isFinite(resolvedRange.min)) {
        min = Math.floor(resolvedRange.min);
      }

      if (Number.isFinite(resolvedRange.max)) {
        max = Math.ceil(resolvedRange.max);
      }
    }

    if (max <= min) {
      max = min + 1;
    }

    const resolvedRange = { min, max };

    this.scalarRangeCache.set(voxelManager, resolvedRange);

    return resolvedRange;
  }

  public createOrUpdateEnabledElement(args: {
    enabledElement?: CPUFallbackEnabledElement;
    canvas: HTMLCanvasElement;
    image: IImage;
    modality?: string;
  }): CPUFallbackEnabledElement {
    const { enabledElement, canvas, image, modality } = args;

    if (enabledElement) {
      enabledElement.canvas = canvas;
      enabledElement.image = image;
      enabledElement.options ||= {};
      enabledElement.options.transparentBackground = true;
      // Orthogonal CPU volume slices can change dimensions and pixel spacing
      // when the camera orientation changes, so the fallback viewport geometry
      // must be rebuilt to keep displayedArea in sync with the sampled image.
      enabledElement.viewport = getDefaultViewport(canvas, image, modality);
      return enabledElement;
    }

    return {
      canvas,
      image,
      options: {
        transparentBackground: true,
      },
      renderingTools: {},
      viewport: getDefaultViewport(canvas, image, modality),
    } as CPUFallbackEnabledElement;
  }

  public updateCPUFallbackViewport(args: {
    enabledElement: CPUFallbackEnabledElement;
    sampledSliceState: PlanarCPUSampledSliceState;
    camera: ICamera<unknown> & { presentationScale?: Point2 };
    dataPresentation?: PlanarDataPresentation;
    defaultVOIRange?: VOIRange;
  }): void {
    const {
      enabledElement,
      sampledSliceState,
      camera,
      dataPresentation,
      defaultVOIRange,
    } = args;
    const rowPixelSpacing = sampledSliceState.image.rowPixelSpacing || 1;
    const columnPixelSpacing = sampledSliceState.image.columnPixelSpacing || 1;
    const focalDelta = subtractPoints(
      camera.focalPoint as Point3,
      sampledSliceState.translationReferenceFocalPoint
    );
    const viewport = enabledElement.viewport as Omit<
      CPUFallbackEnabledElement['viewport'],
      'scale'
    > & {
      scale?: number | Point2;
    };
    const resolvedVOI = this.getResolvedVOIRange(
      dataPresentation?.voiRange ?? defaultVOIRange,
      sampledSliceState.image.minPixelValue ?? 0,
      sampledSliceState.image.maxPixelValue ?? 1
    );

    viewport.translation = {
      x: -dot(focalDelta, sampledSliceState.right) / columnPixelSpacing,
      y: dot(focalDelta, sampledSliceState.up) / rowPixelSpacing,
    };
    viewport.scale = resolveViewportScale({
      canvas: enabledElement.canvas,
      camera,
      columnPixelSpacing,
      rowPixelSpacing,
    });
    viewport.parallelScale = camera.parallelScale;
    viewport.colormap = resolveCPUFallbackColormap(
      dataPresentation?.colormap,
      sampledSliceState.image.colormap,
      {
        voiRange: resolvedVOI,
      }
    );
    viewport.invert = dataPresentation?.invert ?? false;
    viewport.pixelReplication =
      dataPresentation?.interpolationType === InterpolationType.NEAREST;
    viewport.voi = {
      windowCenter: (resolvedVOI.lower + resolvedVOI.upper) / 2,
      windowWidth: Math.max(resolvedVOI.upper - resolvedVOI.lower, 1),
      voiLUTFunction: VOILUTFunctionType.LINEAR,
    };
  }

  public needsResample(args: {
    sampledSliceState?: PlanarCPUSampledSliceState;
    width: number;
    height: number;
    camera: ICamera<unknown>;
    dataPresentation?: PlanarDataPresentation;
  }): boolean {
    const { sampledSliceState, width, height, camera, dataPresentation } = args;

    if (!sampledSliceState) {
      return true;
    }

    const { right, up, normal } = this.getCameraBasis(camera);
    const focalPoint = camera.focalPoint as Point3;
    const interpolationType =
      dataPresentation?.interpolationType ?? InterpolationType.LINEAR;
    const focalDelta = subtractPoints(focalPoint, sampledSliceState.focalPoint);
    const deltaInNormal = Math.abs(dot(focalDelta, sampledSliceState.normal));
    const columnPixelSpacing = sampledSliceState.image.columnPixelSpacing || 1;
    const rowPixelSpacing = sampledSliceState.image.rowPixelSpacing || 1;
    const shiftXPixels =
      Math.abs(dot(focalDelta, sampledSliceState.right)) / columnPixelSpacing;
    const shiftYPixels =
      Math.abs(dot(focalDelta, sampledSliceState.up)) / rowPixelSpacing;

    return (
      sampledSliceState.canvasWidth !== width ||
      sampledSliceState.canvasHeight !== height ||
      sampledSliceState.interpolationType !== interpolationType ||
      !arePointsClose(sampledSliceState.right, right) ||
      !arePointsClose(sampledSliceState.up, up) ||
      !arePointsClose(sampledSliceState.normal, normal) ||
      deltaInNormal > sampledSliceState.spacingInNormalDirection * 0.5 ||
      shiftXPixels > sampledSliceState.image.width * 0.35 ||
      shiftYPixels > sampledSliceState.image.height * 0.35
    );
  }

  public sampleSliceImage(args: {
    volume: IImageVolume;
    width: number;
    height: number;
    camera: ICamera<unknown> & { presentationScale?: Point2 };
    dataPresentation?: PlanarDataPresentation;
  }): PlanarCPUSampledSliceState {
    const { volume, width, height, camera, dataPresentation } = args;
    const { right, up, normal } = this.getCameraBasis(camera);
    const numberOfComponents = this.getVolumeNumberOfComponents(volume);
    const preserveFloatScalarSamples =
      numberOfComponents === 1 && this.shouldPreserveFloatScalarSamples(volume);
    const interpolationType =
      dataPresentation?.interpolationType ?? InterpolationType.LINEAR;
    // The orthogonal fast path extracts source voxels directly. Keep it for
    // nearest-neighbor rendering, but use the continuous sampler for linear
    // interpolation so fused PET slices are sampled at canvas resolution.
    const orthogonalSlice =
      interpolationType === InterpolationType.NEAREST
        ? this.trySampleOrthogonalSliceFromVoxelManager(
            volume,
            camera,
            right,
            up,
            normal
          )
        : undefined;
    const fallbackRange = this.getFallbackStoredRange(volume);
    const voiRange = this.getResolvedVOIRange(
      dataPresentation?.voiRange,
      fallbackRange.min,
      fallbackRange.max
    );

    if (orthogonalSlice) {
      return {
        image: this.createSliceImage(
          volume,
          orthogonalSlice.scalarData,
          orthogonalSlice.width,
          orthogonalSlice.height,
          orthogonalSlice.columnPixelSpacing,
          orthogonalSlice.rowPixelSpacing,
          orthogonalSlice.minPixelValue,
          orthogonalSlice.maxPixelValue,
          orthogonalSlice.numberOfComponents,
          voiRange
        ),
        focalPoint: vec3.clone(camera.focalPoint as unknown as vec3) as Point3,
        translationReferenceFocalPoint: vec3.clone(
          orthogonalSlice.translationReferenceFocalPoint as unknown as vec3
        ) as Point3,
        right: vec3.clone(right as unknown as vec3) as Point3,
        up: vec3.clone(up as unknown as vec3) as Point3,
        normal: vec3.clone(normal as unknown as vec3) as Point3,
        spacingInNormalDirection: Math.max(
          getSpacingInNormalDirection(volume, normal),
          EPSILON
        ),
        canvasWidth: width,
        canvasHeight: height,
        interpolationType,
      };
    }

    const voxelManager = volume.voxelManager;

    if (!voxelManager) {
      throw new Error('[PlanarViewport] CPU volume rendering requires voxels');
    }

    const parallelScale = Math.max(camera.parallelScale ?? 1, EPSILON);
    const worldHeight = parallelScale * 2;
    const worldWidth =
      worldHeight *
      (width / Math.max(height, 1)) *
      (1 / getPlanarScaleRatio(camera.presentationScale));
    const xStep = worldWidth / Math.max(width, 1);
    const yStep = worldHeight / Math.max(height, 1);
    const xStart = -worldWidth / 2 + xStep / 2;
    const yStart = worldHeight / 2 - yStep / 2;
    const centerIndex = VoxelManager.worldToIndexContinuous(
      volume,
      camera.focalPoint as Point3
    );
    const startIndexDelta = worldVectorToContinuousIndexDelta(volume, [
      right[0] * xStart + up[0] * yStart,
      right[1] * xStart + up[1] * yStart,
      right[2] * xStart + up[2] * yStart,
    ]);
    const xStepIndexDelta = worldVectorToContinuousIndexDelta(volume, [
      right[0] * xStep,
      right[1] * xStep,
      right[2] * xStep,
    ]);
    const yStepIndexDelta = worldVectorToContinuousIndexDelta(volume, [
      -up[0] * yStep,
      -up[1] * yStep,
      -up[2] * yStep,
    ]);
    const SliceArrayConstructor = this.getSliceArrayConstructor(
      volume,
      fallbackRange.min,
      fallbackRange.max,
      numberOfComponents,
      preserveFloatScalarSamples
    );
    const sliceScalarData = new SliceArrayConstructor(
      width * height * numberOfComponents
    );
    const rowStartIndex = [
      centerIndex[0] + startIndexDelta[0],
      centerIndex[1] + startIndexDelta[1],
      centerIndex[2] + startIndexDelta[2],
    ] as Point3;
    const sampleIndex = [...rowStartIndex] as Point3;
    let sampledMin = Infinity;
    let sampledMax = -Infinity;

    for (let y = 0; y < height; y++) {
      sampleIndex[0] = rowStartIndex[0];
      sampleIndex[1] = rowStartIndex[1];
      sampleIndex[2] = rowStartIndex[2];

      for (let x = 0; x < width; x++) {
        const sampledValue = this.sampleVoxelAtContinuousIndex(
          voxelManager,
          volume.dimensions,
          sampleIndex,
          numberOfComponents,
          interpolationType
        );
        const valueRange = this.writeVoxelValue({
          pixelData: sliceScalarData,
          pixelIndex: y * width + x,
          voxelValue: sampledValue,
          numberOfComponents,
          fallbackMin: fallbackRange.min,
          fallbackMax: fallbackRange.max,
        });

        sampledMin = Math.min(sampledMin, valueRange.min);
        sampledMax = Math.max(sampledMax, valueRange.max);
        sampleIndex[0] += xStepIndexDelta[0];
        sampleIndex[1] += xStepIndexDelta[1];
        sampleIndex[2] += xStepIndexDelta[2];
      }

      rowStartIndex[0] += yStepIndexDelta[0];
      rowStartIndex[1] += yStepIndexDelta[1];
      rowStartIndex[2] += yStepIndexDelta[2];
    }

    const minPixelValue = Number.isFinite(sampledMin)
      ? preserveFloatScalarSamples
        ? sampledMin
        : Math.floor(sampledMin)
      : fallbackRange.min;
    const maxPixelValue =
      Number.isFinite(sampledMax) && sampledMax > sampledMin
        ? preserveFloatScalarSamples
          ? sampledMax
          : Math.ceil(sampledMax)
        : Math.max(minPixelValue + 1, fallbackRange.max);

    return {
      image: this.createSliceImage(
        volume,
        sliceScalarData,
        width,
        height,
        worldWidth / Math.max(width, 1),
        worldHeight / Math.max(height, 1),
        minPixelValue,
        maxPixelValue,
        numberOfComponents,
        voiRange
      ),
      focalPoint: vec3.clone(camera.focalPoint as unknown as vec3) as Point3,
      translationReferenceFocalPoint: vec3.clone(
        camera.focalPoint as unknown as vec3
      ) as Point3,
      right: vec3.clone(right as unknown as vec3) as Point3,
      up: vec3.clone(up as unknown as vec3) as Point3,
      normal: vec3.clone(normal as unknown as vec3) as Point3,
      spacingInNormalDirection: Math.max(
        getSpacingInNormalDirection(volume, normal),
        EPSILON
      ),
      canvasWidth: width,
      canvasHeight: height,
      interpolationType,
    };
  }

  private trySampleOrthogonalSliceFromVoxelManager(
    volume: IImageVolume,
    camera: ICamera<unknown>,
    right: Point3,
    up: Point3,
    normal: Point3
  ): OrthogonalSliceSampleResult | undefined {
    const voxelManager = volume.voxelManager;

    if (!voxelManager) {
      return;
    }

    const normalAxis = getIndexMajorAxis(volume, normal);
    const rightAxis = getIndexMajorAxis(volume, right);
    const upAxis = getIndexMajorAxis(volume, up);

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

    const downAxis = upAxis.axis;
    const downSign = -upAxis.sign;
    const rightSign = rightAxis.sign;
    const numberOfComponents = this.getVolumeNumberOfComponents(volume);
    const continuousIndex = VoxelManager.worldToIndexContinuous(
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
    const referenceIndex = [
      (volume.dimensions[0] - 1) / 2,
      (volume.dimensions[1] - 1) / 2,
      (volume.dimensions[2] - 1) / 2,
    ] as Point3;
    const preserveFloatScalarSamples =
      numberOfComponents === 1 && this.shouldPreserveFloatScalarSamples(volume);

    referenceIndex[normalAxis.axis] = normalIndex;

    const translationReferenceFocalPoint = indexToWorld(volume, referenceIndex);
    const outputWidth = volume.dimensions[rightAxis.axis];
    const outputHeight = volume.dimensions[downAxis];
    const fallbackRange = this.getFallbackStoredRange(volume);
    const SliceArrayConstructor = this.getSliceArrayConstructor(
      volume,
      fallbackRange.min,
      fallbackRange.max,
      numberOfComponents,
      preserveFloatScalarSamples
    );
    const scalarData = new SliceArrayConstructor(
      outputWidth * outputHeight * numberOfComponents
    );
    let min = Infinity;
    let max = -Infinity;

    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        const ijk = [0, 0, 0] as Point3;

        ijk[normalAxis.axis] = normalIndex;
        ijk[rightAxis.axis] = rightSign > 0 ? x : outputWidth - 1 - x;
        ijk[downAxis] = downSign > 0 ? y : outputHeight - 1 - y;

        const valueRange = this.writeVoxelValue({
          pixelData: scalarData,
          pixelIndex: y * outputWidth + x,
          voxelValue: voxelManager.getAtIJK(
            ijk[0],
            ijk[1],
            ijk[2]
          ) as SampledVoxelValue,
          numberOfComponents,
          fallbackMin: fallbackRange.min,
          fallbackMax: fallbackRange.max,
        });

        min = Math.min(min, valueRange.min);
        max = Math.max(max, valueRange.max);
      }
    }

    if (!Number.isFinite(min)) {
      min = fallbackRange.min;
    }

    if (!Number.isFinite(max) || max <= min) {
      max = Math.max(min + 1, fallbackRange.max);
    }

    return {
      scalarData,
      width: outputWidth,
      height: outputHeight,
      columnPixelSpacing: volume.spacing[rightAxis.axis],
      rowPixelSpacing: volume.spacing[downAxis],
      minPixelValue: preserveFloatScalarSamples ? min : Math.floor(min),
      maxPixelValue: preserveFloatScalarSamples ? max : Math.ceil(max),
      numberOfComponents,
      translationReferenceFocalPoint,
    };
  }

  private sampleVoxelAtContinuousIndex(
    voxelManager: NonNullable<IImageVolume['voxelManager']>,
    dimensions: Point3,
    continuousIndex: Point3,
    numberOfComponents: number,
    interpolationType: InterpolationType
  ): SampledVoxelValue {
    if (numberOfComponents < 2) {
      return VoxelManager.sampleAtContinuousIndex(
        voxelManager,
        dimensions,
        continuousIndex,
        interpolationType
      );
    }

    return interpolationType === InterpolationType.NEAREST
      ? this.sampleNearestColorAtContinuousIndex(
          voxelManager,
          dimensions,
          continuousIndex,
          numberOfComponents
        )
      : this.sampleLinearColorAtContinuousIndex(
          voxelManager,
          dimensions,
          continuousIndex,
          numberOfComponents
        );
  }

  private sampleNearestColorAtContinuousIndex(
    voxelManager: NonNullable<IImageVolume['voxelManager']>,
    dimensions: Point3,
    continuousIndex: Point3,
    numberOfComponents: number
  ): ColorSample {
    const i = Math.floor(continuousIndex[0] + 0.5 - 1e-6);
    const j = Math.floor(continuousIndex[1] + 0.5 - 1e-6);
    const k = Math.floor(continuousIndex[2] + 0.5 - 1e-6);

    if (
      i < 0 ||
      i >= dimensions[0] ||
      j < 0 ||
      j >= dimensions[1] ||
      k < 0 ||
      k >= dimensions[2]
    ) {
      return this.createDefaultColorSample(numberOfComponents);
    }

    return this.toColorSample(
      voxelManager.getAtIJK(i, j, k) as SampledVoxelValue,
      numberOfComponents
    );
  }

  private sampleLinearColorAtContinuousIndex(
    voxelManager: NonNullable<IImageVolume['voxelManager']>,
    dimensions: Point3,
    continuousIndex: Point3,
    numberOfComponents: number
  ): ColorSample {
    const [i, j, k] = continuousIndex;

    if (
      i < 0 ||
      i > dimensions[0] - 1 ||
      j < 0 ||
      j > dimensions[1] - 1 ||
      k < 0 ||
      k > dimensions[2] - 1
    ) {
      return this.createDefaultColorSample(numberOfComponents);
    }

    const i0 = Math.floor(i);
    const j0 = Math.floor(j);
    const k0 = Math.floor(k);
    const i1 = Math.min(i0 + 1, dimensions[0] - 1);
    const j1 = Math.min(j0 + 1, dimensions[1] - 1);
    const k1 = Math.min(k0 + 1, dimensions[2] - 1);
    const di = i - i0;
    const dj = j - j0;
    const dk = k - k0;
    const oneMinusDi = 1 - di;
    const oneMinusDj = 1 - dj;
    const oneMinusDk = 1 - dk;
    const c000 = this.toColorSample(
      voxelManager.getAtIJK(i0, j0, k0) as SampledVoxelValue,
      numberOfComponents
    );
    const c100 = this.toColorSample(
      voxelManager.getAtIJK(i1, j0, k0) as SampledVoxelValue,
      numberOfComponents
    );
    const c010 = this.toColorSample(
      voxelManager.getAtIJK(i0, j1, k0) as SampledVoxelValue,
      numberOfComponents
    );
    const c110 = this.toColorSample(
      voxelManager.getAtIJK(i1, j1, k0) as SampledVoxelValue,
      numberOfComponents
    );
    const c001 = this.toColorSample(
      voxelManager.getAtIJK(i0, j0, k1) as SampledVoxelValue,
      numberOfComponents
    );
    const c101 = this.toColorSample(
      voxelManager.getAtIJK(i1, j0, k1) as SampledVoxelValue,
      numberOfComponents
    );
    const c011 = this.toColorSample(
      voxelManager.getAtIJK(i0, j1, k1) as SampledVoxelValue,
      numberOfComponents
    );
    const c111 = this.toColorSample(
      voxelManager.getAtIJK(i1, j1, k1) as SampledVoxelValue,
      numberOfComponents
    );
    const sample = this.createDefaultColorSample(numberOfComponents);

    for (let component = 0; component < numberOfComponents; component++) {
      const c00 = c000[component] * oneMinusDi + c100[component] * di;
      const c10 = c010[component] * oneMinusDi + c110[component] * di;
      const c01 = c001[component] * oneMinusDi + c101[component] * di;
      const c11 = c011[component] * oneMinusDi + c111[component] * di;
      const c0 = c00 * oneMinusDj + c10 * dj;
      const c1 = c01 * oneMinusDj + c11 * dj;

      sample[component] = c0 * oneMinusDk + c1 * dk;
    }

    return sample;
  }

  private toColorSample(
    voxelValue: SampledVoxelValue,
    numberOfComponents: number
  ): ColorSample {
    if (Array.isArray(voxelValue)) {
      return Array.from({ length: numberOfComponents }, (_unused, index) =>
        Number(voxelValue[index] ?? 0)
      );
    }

    const scalar = Number(voxelValue) || 0;

    return Array.from({ length: numberOfComponents }, () => scalar);
  }

  private createDefaultColorSample(numberOfComponents: number): ColorSample {
    return Array.from({ length: numberOfComponents }, () => 0);
  }

  private writeVoxelValue(args: {
    pixelData: SliceArray;
    pixelIndex: number;
    voxelValue: SampledVoxelValue;
    numberOfComponents: number;
    fallbackMin: number;
    fallbackMax: number;
  }): { min: number; max: number } {
    const {
      pixelData,
      pixelIndex,
      voxelValue,
      numberOfComponents,
      fallbackMin,
      fallbackMax,
    } = args;

    if (numberOfComponents < 2) {
      const scalar = Number(voxelValue);
      const preserveFloatScalarSamples =
        pixelData instanceof Float32Array || pixelData instanceof Float64Array;
      const clampedValue = Number.isFinite(scalar)
        ? preserveFloatScalarSamples
          ? Math.min(fallbackMax, Math.max(fallbackMin, scalar))
          : Math.round(Math.min(fallbackMax, Math.max(fallbackMin, scalar)))
        : fallbackMin;

      pixelData[pixelIndex] = clampedValue;

      return {
        min: clampedValue,
        max: clampedValue,
      };
    }

    const color = this.toColorSample(voxelValue, numberOfComponents);
    const baseIndex = pixelIndex * numberOfComponents;
    let min = Infinity;
    let max = -Infinity;

    for (let component = 0; component < numberOfComponents; component++) {
      const value = Number(color[component]);
      const clampedValue = Number.isFinite(value)
        ? Math.round(Math.min(fallbackMax, Math.max(fallbackMin, value)))
        : fallbackMin;

      pixelData[baseIndex + component] = clampedValue;
      min = Math.min(min, clampedValue);
      max = Math.max(max, clampedValue);
    }

    return {
      min: Number.isFinite(min) ? min : fallbackMin,
      max: Number.isFinite(max) ? max : fallbackMin,
    };
  }

  private getVolumeNumberOfComponents(volume: IImageVolume): number {
    const imageDataNumberOfComponents = volume.imageData?.get(
      'numberOfComponents'
    ) as
      | {
          numberOfComponents?: number;
        }
      | undefined;

    return Math.max(
      1,
      imageDataNumberOfComponents?.numberOfComponents ??
        volume.voxelManager?.numberOfComponents ??
        1
    );
  }

  private getSliceArrayConstructor(
    volume: IImageVolume,
    minPixelValue: number,
    maxPixelValue: number,
    numberOfComponents: number,
    preserveFloatScalarSamples = false
  ): new (length: number) => SliceArray {
    if (numberOfComponents > 1) {
      return volume.voxelManager?.getConstructor() || Uint8Array;
    }

    if (preserveFloatScalarSamples) {
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

  private createSliceImage(
    volume: IImageVolume,
    scalarData: SliceArray,
    width: number,
    height: number,
    columnPixelSpacing: number,
    rowPixelSpacing: number,
    minPixelValue: number,
    maxPixelValue: number,
    numberOfComponents: number,
    voiRange?: VOIRange
  ): IImage {
    const resolvedVOI =
      voiRange && voiRange.upper > voiRange.lower
        ? voiRange
        : { lower: minPixelValue, upper: maxPixelValue };
    const windowWidth = Math.max(1, resolvedVOI.upper - resolvedVOI.lower);
    const windowCenter = (resolvedVOI.lower + resolvedVOI.upper) / 2;
    const imageId = `cpuVolumeSlice:${volume.volumeId}:${++this.sampleSequence}`;
    const voxelManager = VoxelManager.createImageVoxelManager({
      width,
      height,
      scalarData,
      numberOfComponents,
      id: imageId,
    });

    return {
      imageId,
      intercept: 0,
      windowCenter,
      windowWidth,
      voiLUTFunction: VOILUTFunctionType.LINEAR,
      isPreScaled: volume.isPreScaled,
      scaling: volume.scaling,
      color: numberOfComponents > 1,
      numberOfComponents,
      dataType: scalarData.constructor.name as PixelDataTypedArrayString,
      slope: 1,
      minPixelValue,
      maxPixelValue,
      rows: height,
      columns: width,
      getCanvas: undefined,
      height,
      width,
      rgba: numberOfComponents === 4,
      columnPixelSpacing,
      rowPixelSpacing,
      FrameOfReferenceUID: volume.metadata?.FrameOfReferenceUID,
      invert: false,
      photometricInterpretation: numberOfComponents > 1 ? 'RGB' : undefined,
      getPixelData: () => scalarData,
      voxelManager,
      sizeInBytes: scalarData.byteLength,
    } as IImage;
  }

  private shouldPreserveFloatScalarSamples(volume: IImageVolume): boolean {
    // PT fusion relies on continuous sampled SUV values. Rounding the derived
    // slice back to integers before the CPU colormap step makes linear
    // interpolation look coarse again.
    return volume.metadata?.Modality === 'PT';
  }
}

function resolveViewportScale(args: {
  canvas: HTMLCanvasElement;
  camera: ICamera<unknown> & { presentationScale?: Point2 };
  rowPixelSpacing: number;
  columnPixelSpacing: number;
}): number | Point2 {
  const { camera, canvas, columnPixelSpacing, rowPixelSpacing } = args;
  const worldHeight = Math.max((camera.parallelScale ?? 1) * 2, EPSILON);
  const worldToCanvasScale = canvas.height / worldHeight;
  const scaleRatio = getPlanarScaleRatio(camera.presentationScale);

  if (Math.abs(scaleRatio - 1) > EPSILON) {
    const safeCanvasHeight = Math.max(canvas.height, 1);
    const safeCanvasWidth = Math.max(canvas.width, 1);
    const worldWidth =
      worldHeight * (safeCanvasWidth / safeCanvasHeight) * (1 / scaleRatio);

    return [
      Math.max(
        (safeCanvasWidth * (columnPixelSpacing || 1)) /
          Math.max(worldWidth, EPSILON),
        EPSILON
      ),
      Math.max(
        (safeCanvasHeight * (rowPixelSpacing || 1)) / worldHeight,
        EPSILON
      ),
    ];
  }

  return Math.max(
    Math.min(rowPixelSpacing || 1, columnPixelSpacing || 1) *
      worldToCanvasScale,
    EPSILON
  );
}
