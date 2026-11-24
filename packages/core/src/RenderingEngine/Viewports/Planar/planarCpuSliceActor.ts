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
import { updateVolumeSliceActorDepthOffset } from './VtkGpuVolumeSliceRenderPath';

/** Returns an empty vector that holds double precision numbers. */
function createVector(): vec3 {
  return [0, 0, 0] as unknown as vec3;
}

/**
 * The draw step of the sampled slice render path, and the only part of that
 * path that knows vtk.js image classes. It owns one vtkImageData, one
 * vtkImageMapper and one vtkImageSlice, and draws a `PlanarCpuSlice` in
 * world coordinates.
 *
 * The vtkImageData and its scalar array are reused while the size and the
 * array type of the slice stay the same, as the image path does (see
 * `canReuseImageDataForImage`): a new vtkImageData builds a new texture, and
 * the first render after that draws before the upload, a one-frame flash. The
 * actor owns its scalar array and copies each slice into it, because the
 * sampler reuses the pixel arrays of the slices it drops from its cache.
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
  private appearanceVisible = true;

  constructor(options: { voxelManager?: unknown; viewportId?: string } = {}) {
    this.imageData = vtkImageData.newInstance();
    this.imageData.setDimensions(1, 1, 1);
    this.imageData.getPointData().setScalars(
      vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values: new Float32Array(1),
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
   * volume, and none for a slice inside the volume (`insideVolume`).
   */
  private updateClipping(): void {
    const clipping = !!this.clipPlanes.length && !this.slice?.insideVolume;

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
   * volume path.
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
    const values = scalars?.getData();
    const [width, height] = imageData.getDimensions();

    if (
      values &&
      values !== slice.pixelData &&
      values.length === slice.pixelData.length &&
      values.constructor === slice.pixelData.constructor
    ) {
      (values as typeof slice.pixelData).set(slice.pixelData);
      scalars.dataChange();
    } else {
      imageData.getPointData().setScalars(
        vtkDataArray.newInstance({
          name: 'Pixels',
          numberOfComponents: 1,
          values: slice.pixelData.slice(),
        })
      );
    }

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
