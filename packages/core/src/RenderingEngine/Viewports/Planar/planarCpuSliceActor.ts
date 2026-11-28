import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { mat3, mat4, vec3 } from 'gl-matrix';
import type { Point3, VOIRange } from '../../../types';
import type {
  PlanarDisplaySetAppearance,
  PlanarResolvedICamera,
} from './PlanarViewportTypes';
import type { PlanarCpuSlice, PlanarSliceClipPlane } from './planarCpuSlice';
import { applyPlanarICameraToActor } from './planarRenderCamera';
import { applyPlanarVolumeAppearance } from './planarVolumeAppearance';
import { ensureFullOpacityFunction } from '../../helpers/planarImageRendering';
import { updateVolumeSliceActorDepthOffset } from './VtkGpuVolumeSliceRenderPath';
import { requestImageTextureRows } from '../../vtkClasses/vtkStreamingOpenGLImageMapper';

/** Returns an empty vector that holds double precision numbers. */
function createVector(): vec3 {
  return [0, 0, 0] as unknown as vec3;
}

/**
 * Gives the scalars of the image the range of the slice, which the sampler
 * knows, so that vtk.js does not read every pixel for it at the upload.
 */
function setScalarRange(
  scalars: ReturnType<ReturnType<vtkImageData['getPointData']>['getScalars']>,
  slice: PlanarCpuSlice
): void {
  if (Number.isFinite(slice.min) && Number.isFinite(slice.max)) {
    scalars.setRange({ min: slice.min, max: slice.max }, 0);
  }
}

/** The typed array of the voxels of a volume (`getConstructor`). */
type VoxelArrayConstructor = new (length: number) => ArrayLike<number>;

/**
 * The array type of the voxels that a voxel manager holds, or Float32Array
 * when it does not say.
 */
function getVoxelArrayType(voxelManager: unknown): VoxelArrayConstructor {
  const ArrayType = (
    voxelManager as { getConstructor?: () => unknown } | undefined
  )?.getConstructor?.();

  return typeof ArrayType === 'function'
    ? (ArrayType as VoxelArrayConstructor)
    : Float32Array;
}

/**
 * Has vtk.js build what the layers of one pane draw with before their first
 * slice: the layers that have drawn no slice show their image of one texel,
 * which covers no pixel, while `draw` draws the pane without showing it,
 * and are hidden again. vtk.js then compiles the program of each layer,
 * makes its colour, opacity and image textures and, for a translucent layer,
 * the buffers and the program of the translucent pass. The layers of a pane
 * are drawn together because vtk.js builds some of that by their
 * combination: with a translucent layer it asks the opaque layers of the
 * pane for their depth, which gives them another program.
 *
 * @param layers - The layers of one pane
 * @param draw - Draws the pane into its WebGL context, without showing it;
 *   returns false when it drew nothing
 * @returns true when a layer was shown and `draw` drew the pane
 */
export function drawLayersWithoutSlice(
  layers: PlanarCpuSliceActor[],
  draw: () => boolean
): boolean {
  const shown = layers.filter((layer) => layer.showWithoutSlice());

  if (!shown.length) {
    return false;
  }

  try {
    return draw();
  } finally {
    shown.forEach((layer) => layer.hideWithoutSlice());
  }
}

/**
 * The draw step of the sampled slice render path, and the only part of that
 * path that knows vtk.js image classes. It owns one vtkImageData, one
 * vtkImageMapper and one vtkImageSlice, and draws a `PlanarCpuSlice` in
 * world coordinates.
 *
 * Until its first slice the image data is one texel of the data type of the
 * volume, with a spacing of 0, so that the quad of the image covers no
 * pixel: `drawLayersWithoutSlice` draws it once so that vtk.js builds the
 * program of the layer, its colour and opacity textures and its image
 * texture before the first slice, which then only uploads its pixels.
 *
 * The vtkImageData and its scalar array object are reused, as the image path
 * does (see `canReuseImageDataForImage`): a new vtkImageData builds a new
 * texture, and the first render after that draws before the upload, a
 * one-frame flash. The scalar array holds the pixel array of the slice itself,
 * with no copy: the array of a frame of the volume for the acquisition plane,
 * the array of the sampler for any other slice, which the sampler does not
 * reuse while it is on screen. A slice that names its updated rows
 * (`updatedRows`, rows of a slice across the frames written in place) has
 * only those rows uploaded (`requestImageTextureRows`); any other slice is
 * uploaded whole. The range of the scalars is the range of the slice, so
 * vtk.js does not read the pixels again for it.
 *
 * The mapper clips the slice to the faces of the volume, so that the pixels
 * of an oblique slice outside the volume are not drawn, as with the GPU volume
 * path, which draws the cut of its slice plane with the faces and nothing
 * outside them. The planes follow the transform of the actor (appearance
 * scale and depth offset), because vtk.js compares them with the transformed
 * slice. A slice that lies inside the volume (`insideVolume`) is drawn
 * without clip planes: its image already ends on the faces, and the edges of
 * the drawn image are then antialiased like the edges of the cut of the GPU
 * volume path, which a clip plane, tested once per pixel, does not do.
 */
export class PlanarCpuSliceActor {
  readonly actor: vtkImageSlice;
  readonly mapper: vtkImageMapper;
  private readonly imageData: vtkImageData;
  private readonly clipPlanes: vtkPlane[] = [];
  private volumeClipPlanes: PlanarSliceClipPlane[] = [];
  private clipping = false;
  private slice?: PlanarCpuSlice;
  private drewSlice = false;
  private appearanceVisible = true;

  constructor(options: { voxelManager?: unknown; viewportId?: string } = {}) {
    const VoxelArrayType = getVoxelArrayType(options.voxelManager);

    this.imageData = vtkImageData.newInstance();
    this.imageData.setDimensions(1, 1, 1);
    this.imageData.setSpacing([0, 0, 0]);
    this.imageData.getPointData().setScalars(
      vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values: new VoxelArrayType(1),
      })
    );

    if (options.voxelManager) {
      this.imageData.set({ voxelManager: options.voxelManager }, true);
    }

    this.mapper = vtkImageMapper.newInstance();
    this.mapper.setInputData(this.imageData);
    this.actor = vtkImageSlice.newInstance();
    this.actor.setMapper(this.mapper);

    if (options.viewportId) {
      this.actor.getProperty().set({ viewportId: options.viewportId }, true);
    }

    this.updateVisibility();
  }

  /**
   * Draws a slice. The same slice object again changes nothing; undefined
   * hides the actor, for a plane that does not cut the volume.
   *
   * @returns true when the drawn pixels or their place changed.
   */
  setSlice(slice: PlanarCpuSlice | undefined): boolean {
    if (slice === this.slice) {
      return false;
    }

    this.slice = slice;

    if (slice) {
      this.drewSlice = true;
      this.writeSlice(slice);
    }

    this.updateClipping();

    this.updateVisibility();

    return true;
  }

  /** The slice that the actor draws, or undefined. */
  getSlice(): PlanarCpuSlice | undefined {
    return this.slice;
  }

  /**
   * Shows the image of one texel of a layer that has drawn no slice yet and
   * that its appearance shows, for `drawLayersWithoutSlice`: it covers no
   * pixel and adds nothing to the bounds of the renderer. The clip planes are
   * those of a slice inside the volume (none), as for the slices of the
   * planes of the volume grid.
   *
   * @returns false when the layer is not shown: it has drawn a slice, or its
   *   appearance hides it
   */
  showWithoutSlice(): boolean {
    if (this.slice || this.drewSlice || !this.appearanceVisible) {
      return false;
    }

    this.actor.setUseBounds(false);
    this.actor.setVisibility(true);

    return true;
  }

  /** Hides again a layer that `showWithoutSlice` showed. */
  hideWithoutSlice(): void {
    this.actor.setUseBounds(true);
    this.updateVisibility();
  }

  /** Sets the faces of the volume that the slice is clipped to (at most six). */
  setClipPlanes(planes: PlanarSliceClipPlane[]): void {
    this.volumeClipPlanes = planes.slice(0, 6);
    this.mapper.removeAllClippingPlanes();
    this.clipping = false;
    this.clipPlanes.length = 0;

    this.volumeClipPlanes.forEach(() => {
      this.clipPlanes.push(vtkPlane.newInstance());
    });

    this.updateClipPlanes();
    this.updateClipping();
  }

  /**
   * Gives the mapper the clip planes for a slice that can reach outside the
   * volume, and none for a slice inside the volume (`insideVolume`) or for no
   * slice, so that a layer drawn before its first slice (`drawWithoutSlice`)
   * and the first slice of a plane of the volume grid draw with one program.
   */
  private updateClipping(): void {
    const clipping =
      !!this.clipPlanes.length && !!this.slice && !this.slice.insideVolume;

    if (clipping === this.clipping) {
      return;
    }

    this.clipping = clipping;
    this.mapper.removeAllClippingPlanes();

    if (clipping) {
      this.clipPlanes.forEach((plane) => this.mapper.addClippingPlane(plane));
    }
  }

  /**
   * Applies the appearance (VOI, colormap with its opacity table, invert,
   * opacity, visibility, interpolation) with the appearance function of the
   * volume path. A layer with no opacity ramp gets an opacity function of 1
   * (`ensureFullOpacityFunction`), so that vtk.js keeps its opacity texture.
   */
  applyAppearance(
    props: PlanarDisplaySetAppearance | undefined,
    defaultVOIRange: VOIRange | undefined
  ): void {
    applyPlanarVolumeAppearance({
      actor: this.actor,
      mapper: this.mapper,
      defaultVOIRange,
      props,
    });

    ensureFullOpacityFunction(this.actor);

    this.appearanceVisible = props?.visible !== false;
    this.updateVisibility();
  }

  /**
   * Places the actor for the camera of the source: the framing scale,
   * then a move along the view normal that puts the slice on the view plane
   * and in front of the slice actors drawn before it (`overlayOrder`).
   */
  followCamera(
    camera: PlanarResolvedICamera | undefined,
    overlayOrder: number
  ): void {
    applyPlanarICameraToActor({
      actor: this.actor,
      activeSourceICamera: camera,
    });
    updateVolumeSliceActorDepthOffset(
      this.actor,
      camera,
      overlayOrder,
      this.getDistanceToViewPlane(camera)
    );
    this.updateClipPlanes();
  }

  /** Removes the actor from a renderer and drops the slice. */
  remove(renderer: { removeActor(actor: vtkImageSlice): unknown }): void {
    renderer.removeActor(this.actor);
    this.slice = undefined;
  }

  private writeSlice(slice: PlanarCpuSlice): void {
    const { imageData } = this;
    const scalars = imageData.getPointData().getScalars();
    const values = scalars.getData();
    const [width, height] = imageData.getDimensions();

    if (
      values === slice.pixelData &&
      slice.updatedRows &&
      width === slice.width &&
      height === slice.height
    ) {
      setScalarRange(scalars, slice);
      requestImageTextureRows(this.mapper, slice.updatedRows);
      return;
    }

    if (values === slice.pixelData) {
      scalars.dataChange();
    } else {
      scalars.setData(slice.pixelData, 1);
    }

    setScalarRange(scalars, slice);

    if (width !== slice.width || height !== slice.height) {
      imageData.setDimensions(slice.width, slice.height, 1);
    }

    imageData.setSpacing([slice.spacing[0], slice.spacing[1], 1]);
    imageData.setDirection([
      ...slice.xDirection,
      ...slice.yDirection,
      ...slice.zDirection,
    ]);
    imageData.setOrigin(slice.origin);
    imageData.modified();
  }

  /**
   * The move along the view normal that brings the slice onto the view plane.
   * A nearest slice lies on the centre of its slice of voxels, which can be
   * half a voxel off the plane of the focal point.
   */
  private getDistanceToViewPlane(
    camera: PlanarResolvedICamera | undefined
  ): number {
    if (!this.slice || !camera?.focalPoint || !camera.viewPlaneNormal) {
      return 0;
    }

    const normal = vec3.normalize(
      createVector(),
      camera.viewPlaneNormal as unknown as vec3
    );
    const { origin } = this.slice;
    const { focalPoint } = camera;

    return -(
      (origin[0] - focalPoint[0]) * normal[0] +
      (origin[1] - focalPoint[1]) * normal[1] +
      (origin[2] - focalPoint[2]) * normal[2]
    );
  }

  private updateClipPlanes(): void {
    if (!this.clipPlanes.length) {
      return;
    }

    const matrix = mat4.transpose(
      new Float64Array(16) as unknown as mat4,
      this.actor.getMatrix() as unknown as mat4
    );
    const normalMatrix =
      mat3.normalFromMat4(new Float64Array(9) as unknown as mat3, matrix) ??
      mat3.identity(new Float64Array(9) as unknown as mat3);

    this.volumeClipPlanes.forEach((plane, index) => {
      const origin = vec3.transformMat4(
        createVector(),
        plane.origin as unknown as vec3,
        matrix
      );
      const normal = vec3.normalize(
        createVector(),
        vec3.transformMat3(
          createVector(),
          plane.normal as unknown as vec3,
          normalMatrix
        )
      );

      this.clipPlanes[index].setOrigin(...(Array.from(origin) as Point3));
      this.clipPlanes[index].setNormal(...(Array.from(normal) as Point3));
    });
  }

  private updateVisibility(): void {
    this.actor.setVisibility(this.appearanceVisible && !!this.slice);
  }
}
