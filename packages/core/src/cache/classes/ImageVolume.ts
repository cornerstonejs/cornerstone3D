import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import imageIdToURI from '../../utilities/imageIdToURI';
import VoxelManager from '../../utilities/VoxelManager';
import CompositeVoxelManager from '../../utilities/CompositeVoxelManager';
import volumeTextureStore from '../volumeTextureStore';
import { isMutableSlab } from './VolumeTextureSet';
import { boundsOfFrame } from '../../utilities/voxelGrid';
import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import type {
  CreateVoxelRepresentationOptions,
  VoxelRepresentation,
  VoxelRepresentationSelector,
} from '../../utilities/CompositeVoxelManager';
import type { VolumeTextureSet, VolumeTextureSlot } from './VolumeTextureSet';
import type { ProvisionTextureSetOptions } from '../volumeTextureStore';
import type {
  Metadata,
  Point3,
  Mat3,
  ImageVolumeProps,
  IImage,
  PixelDataTypedArrayString,
  RGB,
  IVoxelManager,
  VoxelGrid,
  VoxelQualityRecord,
} from '../../types';
import cache from '../cache';
import type vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';

/** The name of the set that holds the full-resolution data of the whole volume. */
export const FULL_RESOLUTION_TEXTURE_SET = 'full-resolution/full-extent';

/**
 * What a caller states to provision one named set of a volume. The volume
 * itself states the identity, the grid, the type and the factories.
 */
export type VolumeProvisionTextureSetOptions = Omit<
  ProvisionTextureSetOptions<vtkStreamingOpenGLTexture>,
  | 'volumeId'
  | 'volumeGrid'
  | 'dataType'
  | 'numberOfComponents'
  | 'createTexture'
  | 'destroyTexture'
  | 'applyGrid'
>;

/**
 * Marks one z slice of one texture for a refill.
 *
 * A slab that re-points holds two textures, and the mark belongs to the back
 * texture, which is the one that the owner fills.
 */
function markSlice(
  slot: VolumeTextureSlot<vtkStreamingOpenGLTexture>,
  slice: number
): void {
  const texture = isMutableSlab(slot) ? slot.writeTarget() : slot.texture;

  texture.setUpdatedFrame(slice);
}

export interface vtkStreamingOpenGLTexture extends vtkOpenGLTexture {
  setUpdatedFrame: (frame: number) => void;
  setVolumeId: (volumeId: string) => void;
  releaseGraphicsResources: () => void;
  hasUpdatedFrames: () => boolean;
  /** States the grid that this texture holds. */
  setGrid: (grid: VoxelGrid) => void;
  /** The grid that this texture holds. */
  getGrid: () => VoxelGrid | undefined;
}

/** The base class for volume data. It includes the volume metadata
 * and the volume data along with the loading status.
 */
export class ImageVolume {
  private _imageIds: string[];
  private _imageIdsIndexMap = new Map();
  private _imageURIsIndexMap = new Map();
  /** volume scalar data 3D or 4D */
  protected totalNumFrames: number;
  protected cornerstoneImageMetaData = null;

  /** Read-only unique identifier for the volume */
  readonly volumeId: string;

  isPreScaled = false;

  /** Dimensions of the volume */
  dimensions: Point3;
  /** volume direction in world space */
  direction: Mat3;
  /** volume metadata */
  metadata: Metadata;
  /** volume origin, Note this is an opinionated origin for the volume */
  origin: Point3;
  /** Whether preScaling has been performed on the volume */
  /** volume scaling parameters if it contains scaled data */
  scaling?: {
    PT?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      // accessed in ProbeTool
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  /** volume spacing in 3d world space */
  spacing: Point3;
  /** volume number of voxels */
  numVoxels: number;
  /** volume image data */
  imageData?: vtkImageData;
  /** load status object for the volume */
  loadStatus?: Record<string, unknown>;
  /** optional reference volume id if the volume is derived from another volume */
  referencedVolumeId?: string;
  /** optional reference image ids if the volume is derived from a set of images in the image cache */
  referencedImageIds?: string[];
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;
  /** Property to store additional information */
  additionalDetails?: Record<string, unknown>;
  /**
   *  Property to store the number of dimension groups.
   * @deprecated
   */
  numDimensionGroups: number;

  /**
   * The new volume model which solely relies on the separate image data
   * and do not cache the volume data at all
   */
  voxelManager?: IVoxelManager<number> | IVoxelManager<RGB>;
  dataType?: PixelDataTypedArrayString;

  /**
   * The composite of the alternate representations, which the volume builds on
   * the first request. See `compositeVoxelManager`.
   */
  private _compositeVoxelManager?: CompositeVoxelManager<number | RGB>;

  /** The number of components of one voxel, which gives the cost of a texture. */
  private _numberOfComponents: number;

  /**
   * Calculates the number of time points to be the number of dimension groups
   * as a fallback for existing handling.
   * @deprecated
   */
  get numTimePoints(): number {
    return typeof this.numDimensionGroups === 'number'
      ? this.numDimensionGroups
      : 1;
  }
  numFrames = null as number;
  suppressWarnings: boolean;

  constructor(props: ImageVolumeProps) {
    const {
      imageIds,
      scaling,
      dimensions,
      spacing,
      origin,
      direction,
      dataType,
      volumeId,
      referencedVolumeId,
      metadata,
      referencedImageIds,
      additionalDetails,
      voxelManager,
      numberOfComponents,
    } = props;

    if (!dataType) {
      throw new Error(
        'Data type is required, please provide a data type as string such as "Uint8Array", "Float32Array", etc.'
      );
    }

    let { imageData } = props;

    this.suppressWarnings = true;
    this.imageIds = imageIds;
    this.volumeId = volumeId;
    this.metadata = metadata;
    this.dimensions = dimensions;
    this.spacing = spacing;
    this.origin = origin;
    this.direction = direction;
    this.dataType = dataType;
    this._numberOfComponents = numberOfComponents || 1;
    this.hasPixelSpacing =
      Number.isFinite(spacing[0]) &&
      spacing[0] > 0 &&
      Number.isFinite(spacing[1]) &&
      spacing[1] > 0;

    // The constructor builds no texture. A caller provisions a named texture
    // set when a render path needs one, so a volume that nothing draws costs no
    // texture at all, and no oversized allocation is issued for a volume that
    // no device can hold.
    this.voxelManager =
      voxelManager ??
      VoxelManager.createImageVolumeVoxelManager({
        dimensions,
        imageIds,
        numberOfComponents,
        id: volumeId,
      });

    this.numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2];

    if (!imageData) {
      imageData = vtkImageData.newInstance();
      imageData.setDimensions(dimensions);
      imageData.setSpacing(spacing);
      imageData.setDirection(direction);
      imageData.setOrigin(origin);
    }

    imageData.set(
      {
        dataType: dataType,
        voxelManager: this.voxelManager,
        id: volumeId,
        numberOfComponents: numberOfComponents || 1,
      },
      this.suppressWarnings
    );

    imageData.set(
      {
        hasScalarVolume: false,
      },
      this.suppressWarnings
    );

    this.imageData = imageData;

    this.numFrames = this._getNumFrames();
    this._reprocessImageIds();

    if (scaling) {
      this.scaling = scaling;
    }

    if (referencedVolumeId) {
      this.referencedVolumeId = referencedVolumeId;
    }

    if (referencedImageIds) {
      this.referencedImageIds = referencedImageIds;
    }

    if (additionalDetails) {
      this.additionalDetails = additionalDetails;
    }
  }

  public get sizeInBytes(): number {
    return this.voxelManager.sizeInBytes;
  }

  // ==========================================================================
  // The multi-resolution API
  //
  // The existing public surface does not change. `dimensions`, `spacing`,
  // `origin`, `direction`, `imageIds`, `getImageIdIndex`, `voxelManager` and
  // `getCompleteScalarDataArray` keep their behaviour, so a tool, a
  // segmentation and a measurement see no difference. MR-API-IV-1 and
  // MR-API-IV-9 require that.
  //
  // The members below are new, and they give the alternate representations of
  // the voxel data to a caller, which MR-API-IV-4 requires. A render path reads
  // them to select the grid that it draws, and a loader reads them to deliver
  // data at a grid that is not the grid of this volume.
  // ==========================================================================

  /**
   * The grid descriptor of the data of this volume.
   *
   * The grid states the origin, the direction, the spacing and the dimensions
   * that the volume already holds, and it states nothing else. There is no
   * level index: the grid of this volume is the primary representation of the
   * composite, and it carries no ordinal that would make it "level 0".
   *
   * Each call gives a new record, and the record holds a copy of each array, so
   * a consumer that stores the grid is not exposed to a later change of
   * `this.origin` or of `this.dimensions`.
   */
  public get voxelGrid(): VoxelGrid {
    return {
      origin: [...this.origin] as Point3,
      direction: [...this.direction] as Mat3,
      spacing: [...this.spacing] as Point3,
      dimensions: [...this.dimensions] as Point3,
    };
  }

  /**
   * The composite of this volume, which holds every representation of the voxel
   * data. The volume builds it on the first request, and the representation of
   * `voxelManager` is the primary one.
   *
   * `voxelManager` stays the primary voxel manager, so a read through it reads
   * the data of this grid alone. A caller that wants the best data for a
   * region, at a resolution that it states, reads the composite.
   *
   * The volume discards the composite when a caller assigns a new
   * `voxelManager`, because the alternate representations describe the data of
   * the voxel manager that produced them. `volumeLoader.createLocalVolume`
   * assigns a new voxel manager immediately after the construction, and the
   * discard makes that assignment safe.
   *
   * `sizeInBytes` counts the primary voxel manager alone. A derived
   * representation is extra memory that the cache does not count yet.
   */
  public get compositeVoxelManager(): CompositeVoxelManager<number | RGB> {
    const primary = this.voxelManager as IVoxelManager<number | RGB>;

    if (
      !this._compositeVoxelManager ||
      this._compositeVoxelManager.primary !== primary
    ) {
      this._compositeVoxelManager = new CompositeVoxelManager<number | RGB>({
        primary,
        grid: this.voxelGrid,
        id: `composite-${this.volumeId}`,
      });
    }

    return this._compositeVoxelManager;
  }

  /**
   * Every representation of the voxel data, the primary one included.
   *
   * Many representations can exist at one resolution, each one covering a
   * different part of the volume, because a set of bricks is exactly that. A
   * caller must not assume one representation for each spacing.
   */
  public getVoxelRepresentations(): VoxelRepresentation<number | RGB>[] {
    return this.compositeVoxelManager.getRepresentations();
  }

  /**
   * The representation that a reader gets for a region, at a statistic, under a
   * ceiling. The ceiling is the resolution that the caller will use, so a
   * render path that fills a texture at one eighth passes the spacing of that
   * texture, and the selection does not return the full-resolution data.
   *
   * The selection never creates. `createVoxelRepresentation` creates, and the
   * caller decides whether a new representation is worth its cost.
   */
  public selectVoxelRepresentation(
    selector: VoxelRepresentationSelector = {}
  ): VoxelRepresentation<number | RGB> {
    return this.compositeVoxelManager.selectRepresentation(selector);
  }

  /**
   * Derives a new representation from the data that the volume already holds,
   * and adds that representation to the composite.
   *
   * A derivation always goes from a higher resolution to a lower one. Data that
   * no derivation can give arrives through `compositeVoxelManager.acceptData`,
   * which is the member that a loader calls.
   */
  public createVoxelRepresentation(
    options: CreateVoxelRepresentationOptions
  ): VoxelRepresentation<number | RGB> {
    return this.compositeVoxelManager.createRepresentation(options);
  }

  /**
   * The absolute record of the data that a reader would get for a region, under
   * the same three inputs that the selection takes.
   *
   * The record states no verdict. A reader compares it against its own
   * requirement with `compareVoxelQuality`, so two viewports over one volume
   * can report a different verdict at the same moment.
   */
  public getVoxelQuality(
    selector: VoxelRepresentationSelector = {}
  ): VoxelQualityRecord {
    return this.compositeVoxelManager.getQuality(selector);
  }

  // ==========================================================================
  // The named texture sets
  //
  // The set is the unit of storage, of cost and of eviction, and the store that
  // holds the sets is global, because a device holds one amount of texture
  // memory and one volume does not know what the other volumes take. The list
  // below is a view of that store.
  //
  // The two costs are deliberately different. `provisionTextureSet` derives
  // voxels and allocates textures, and it never runs on the frame path. A
  // selection reads `textureSets` and touches neither.
  // ==========================================================================

  /** The number of bytes that the textures of every volume take. */
  public static get textureBytesUsed(): number {
    return volumeTextureStore.bytesUsed;
  }

  /** The number of bytes that the textures of every volume may take. */
  public static get textureBudget(): number {
    return volumeTextureStore.budget;
  }

  /**
   * States the budget of the texture memory of every volume. An application
   * states it from a capability profile, and a budget that nobody states is no
   * limit, so the behaviour of a viewport does not change.
   */
  public static setTextureBudget(bytes: number): void {
    volumeTextureStore.setBudget(bytes);
  }

  /** Removes every texture set of every volume. */
  public static clearTextureSets(): void {
    volumeTextureStore.clear();
  }

  /** The named texture sets of this volume, which the global store holds. */
  public get textureSets(): VolumeTextureSet<vtkStreamingOpenGLTexture>[] {
    return volumeTextureStore.setsOfVolume<vtkStreamingOpenGLTexture>(
      this.volumeId
    );
  }

  /** One named texture set of this volume. */
  public getTextureSet(
    name: string
  ): VolumeTextureSet<vtkStreamingOpenGLTexture> | undefined {
    return volumeTextureStore.getSet<vtkStreamingOpenGLTexture>(
      this.volumeId,
      name
    );
  }

  /**
   * Provisions a named texture set. This is the expensive step: it counts the
   * cost, evicts if it must, and allocates the textures.
   *
   * A set of this name that already exists comes back as it is, so a caller may
   * ask without a test of its own.
   *
   * `ownerId` gives a set of slabs that re-point, and exactly one owner holds
   * such a set, because the owner is the only party that knows when a draw
   * starts and stops.
   *
   * @returns the set, or `undefined` when the store refuses it
   */
  public provisionTextureSet(
    options: VolumeProvisionTextureSetOptions
  ): VolumeTextureSet<vtkStreamingOpenGLTexture> | undefined {
    return volumeTextureStore.provision<vtkStreamingOpenGLTexture>({
      volumeId: this.volumeId,
      volumeGrid: this.voxelGrid,
      dataType: this.dataType,
      numberOfComponents: this._numberOfComponents,
      createTexture: ({ grid }) => {
        const texture = vtkStreamingOpenGLTexture.newInstance();

        texture.setVolumeId(this.volumeId);
        texture.setGrid(grid);

        return texture;
      },
      destroyTexture: (texture) => {
        texture.releaseGraphicsResources();
        texture.delete();
      },
      applyGrid: (texture, grid) => {
        texture.setGrid(grid);
      },
      ...options,
    });
  }

  /** Adds one holder of a named set, so an eviction cannot take it. */
  public claimTextureSet(name: string): boolean {
    return volumeTextureStore.claim(this.volumeId, name);
  }

  /** Gives one holder of a named set back. */
  public releaseTextureSet(name: string): boolean {
    return volumeTextureStore.release(this.volumeId, name);
  }

  /**
   * The texture of the full-resolution grid. The member provisions the set
   * named `full-resolution/full-extent` when the store does not hold it.
   *
   * @returns the texture, or `undefined` when the store refuses it
   */
  public getFullResolutionTexture(): vtkStreamingOpenGLTexture | undefined {
    if (this.vtkOpenGLTexture) {
      return this.vtkOpenGLTexture;
    }

    this.provisionTextureSet({
      name: FULL_RESOLUTION_TEXTURE_SET,
      grids: [this.voxelGrid],
      coverage: 'full-extent',
      backstop: true,
    });

    return this.vtkOpenGLTexture;
  }

  /**
   * The texture of the full-resolution grid, and not every texture of the
   * volume. The volume holds named sets of textures, and this member names the
   * one member of the set `full-resolution/full-extent`.
   *
   * The value follows the store. It is `undefined` until something provisions
   * that set, and it returns to `undefined` when the store evicts that set. A
   * render path that draws a reduced grid reads a different set, and this value
   * stays `undefined`.
   */
  public get vtkOpenGLTexture(): vtkStreamingOpenGLTexture | undefined {
    const member = this.getTextureSet(
      FULL_RESOLUTION_TEXTURE_SET
    )?.members()[0];

    return member && !isMutableSlab(member) ? member.texture : undefined;
  }

  /**
   * Marks one frame of the volume for a refill, in every texture of every set
   * whose grid covers that frame.
   *
   * A loader calls this member when the data of a frame arrives. One frame
   * changes several textures, because each texture that covers the frame reads
   * the same voxels, and MR-API-IV-6 states that rule. A mark uploads nothing:
   * the refill happens at the next render of each texture.
   */
  public markFrameDirty(frameIndex: number): void {
    const sets = this.textureSets;

    if (sets.length === 0) {
      return;
    }

    const bounds = boundsOfFrame(this.voxelGrid, frameIndex);

    for (const set of sets) {
      set.markDirty(bounds, markSlice);
    }
  }

  /** Marks every voxel of every texture of every set for a refill. */
  public markAllTexturesDirty(): void {
    for (const set of this.textureSets) {
      set.markAllDirty(markSlice);
    }
  }

  /** return the image ids for the volume if it is made of separated images */
  public get imageIds(): string[] {
    return this._imageIds;
  }

  /** updates the image ids */
  public set imageIds(newImageIds: string[]) {
    this._imageIds = newImageIds;
    this._reprocessImageIds();
  }

  private _reprocessImageIds() {
    this._imageIdsIndexMap.clear();
    this._imageURIsIndexMap.clear();

    this._imageIds.forEach((imageId, i) => {
      const imageURI = imageIdToURI(imageId);

      this._imageIdsIndexMap.set(imageId, i);
      this._imageURIsIndexMap.set(imageURI, i);
    });
  }

  cancelLoading: () => void;

  /** return true if it is a 4D volume or false if it is 3D volume */
  public isDynamicVolume(): boolean {
    if (this.numTimePoints) {
      return this.numTimePoints > 1;
    }

    return false;
  }

  /**
   * return the index of a given imageId
   * @param imageId - imageId
   * @returns imageId index
   */
  public getImageIdIndex(imageId: string): number {
    return this._imageIdsIndexMap.get(imageId);
  }

  public getImageIdByIndex(imageIdIndex: number): string {
    return this._imageIds[imageIdIndex];
  }

  /**
   * return the index of a given imageURI
   * @param imageId - imageURI
   * @returns imageURI index
   */
  public getImageURIIndex(imageURI: string): number {
    return this._imageURIsIndexMap.get(imageURI);
  }

  public load(callback?: (...args: unknown[]) => void): void {
    // TODO: Implement
  }

  /**
   * destroy the volume and make it unusable
   */
  destroy(): void {
    // TODO: GPU memory associated with volume is not cleared.
    this.imageData.delete();
    this.imageData = null;
    this.voxelManager.clear();
    // The alternate representations hold their own voxels, and nothing else
    // refers to them, so the discard of the composite releases that memory.
    this._compositeVoxelManager = undefined;

    // Every texture set of this volume, and not one texture. The eviction
    // releases the graphics resources of each member.
    volumeTextureStore.evictVolume(this.volumeId);
  }

  public invalidate() {
    this.markAllTexturesDirty();

    this.imageData.modified();
  }

  /**
   * Updates the internals of the volume to reflect the changes in the
   * underlying scalar data. This should be called when the scalar data
   * is modified externally
   */
  public modified() {
    this.imageData.modified();
    this.markAllTexturesDirty();

    this.numFrames = this._getNumFrames();
  }

  public removeFromCache() {
    cache.removeVolumeLoadObject(this.volumeId);
  }

  public getScalarDataLength(): number {
    return this.voxelManager.getScalarDataLength();
  }

  /**
   * Returns the number of frames stored in a scalarData object. The number of
   * frames is equal to the number of images for 3D volumes or the number of
   * frames per time poins for 4D volumes.
   * @returns number of frames per volume
   */
  private _getNumFrames(): number {
    if (!this.isDynamicVolume()) {
      return this.imageIds.length;
    }

    return this.numTimePoints;
  }

  /**
   * Converts imageIdIndex into frameIndex which will be the same
   * for 3D volumes but different for 4D volumes. The indices are 0 based.
   */
  protected imageIdIndexToFrameIndex(imageIdIndex: number): number {
    return imageIdIndex % this.numFrames;
  }

  /**
   * Returns an array of all the volume's images as Cornerstone images.
   * It iterates over all the imageIds and converts them to Cornerstone images.
   *
   * @returns An array of Cornerstone images.
   */
  public getCornerstoneImages(): IImage[] {
    const { imageIds } = this;

    return imageIds.map((imageId) => {
      return cache.getImage(imageId);
    });
  }
}

export default ImageVolume;
