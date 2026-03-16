import cache from '../../../cache/cache';
import { getShouldUseCPURendering } from '../../../init';
import type { IVolumeInput } from '../../../types';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';
import type { PlanarRendering } from './planarRuntimeTypes';
import {
  clonePlanarLegacyProperties,
  clonePlanarOrientation,
  type PlanarLegacyViewportProperties,
  toPlanarDataPresentation,
} from './planarLegacyCompatibility';
import type {
  PlanarCamera,
  PlanarDataPresentation,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
} from './PlanarViewportV2Types';

type PlanarLegacyCompatibilityHost = {
  getViewportId(): string;
  getRequestedOrientation(): PlanarCamera['orientation'];
  prepareVolumeCompatibilityCamera(): void;
  setDataId(dataId: string, options: PlanarSetDataOptions): Promise<string>;
  setDataIds(
    dataIds: string[],
    options: PlanarSetDataOptions
  ): Promise<string[]>;
  setImageIdIndex(imageIdIndex: number): Promise<string>;
  getCurrentImageId(): string | undefined;
  render(): void;
  removeBindingsExcept(keepDataIds: Set<string>): void;
  setCameraOrientation(orientation: PlanarCamera['orientation']): void;
  setDataPresentationState(
    dataId: string,
    presentation: PlanarDataPresentation
  ): void;
  setDataPresentation(
    dataId: string,
    presentation: Partial<PlanarDataPresentation>
  ): void;
  getDataPresentation(dataId: string): PlanarDataPresentation | undefined;
  getCameraOrientation(): PlanarCamera['orientation'];
  getCurrentPlanarRendering(): PlanarRendering | undefined;
  getActiveDataId(): string | undefined;
  getFirstBoundDataId(): string | undefined;
  findDataIdByVolumeId(volumeId: string): string | undefined;
  getBindingActor(dataId: string): unknown;
  getImageCount(): number;
  getMaxImageIdIndex(): number;
};

class PlanarLegacyCompatibilityController {
  private readonly managedDataIds = new Set<string>();
  private readonly volumeDataIds = new Map<string, string>();
  private readonly properties = new Map<
    string,
    PlanarLegacyViewportProperties
  >();
  private readonly defaultProperties = new Map<
    string,
    PlanarLegacyViewportProperties
  >();

  constructor(private readonly host: PlanarLegacyCompatibilityHost) {}

  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    if (!imageIds.length) {
      throw new Error('[PlanarViewportV2] Cannot set an empty stack');
    }

    const dataId = this.getLegacyStackDataId();
    const clampedImageIdIndex = Math.min(
      Math.max(0, currentImageIdIndex),
      imageIds.length - 1
    );

    this.registerDataSet(dataId, {
      imageIds,
      initialImageIdIndex: clampedImageIdIndex,
    });
    this.host.removeBindingsExcept(new Set([dataId]));

    await this.host.setDataId(dataId, {
      orientation: this.host.getRequestedOrientation(),
    });

    const resolvedImageId =
      await this.host.setImageIdIndex(clampedImageIdIndex);

    return this.host.getCurrentImageId() || resolvedImageId;
  }

  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    void suppressEvents;
    await this.mountVolumes(volumeInputArray, true);

    if (immediate) {
      this.host.render();
    }
  }

  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    void suppressEvents;
    await this.mountVolumes(volumeInputArray, false);

    if (immediate) {
      this.host.render();
    }
  }

  setProperties(
    properties: PlanarLegacyViewportProperties = {},
    volumeIdOrSuppressEvents?: string | boolean,
    suppressEvents = false
  ): void {
    void suppressEvents;

    const volumeId =
      typeof volumeIdOrSuppressEvents === 'string'
        ? volumeIdOrSuppressEvents
        : undefined;
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const currentProperties = clonePlanarLegacyProperties(
      this.properties.get(targetDataId) || {}
    );
    const nextProperties = {
      ...currentProperties,
      ...clonePlanarLegacyProperties(properties),
    };

    if (!this.defaultProperties.has(targetDataId)) {
      this.defaultProperties.set(
        targetDataId,
        clonePlanarLegacyProperties(properties)
      );
    }

    this.properties.set(targetDataId, nextProperties);

    if (properties.orientation !== undefined) {
      this.host.setCameraOrientation(
        clonePlanarOrientation(properties.orientation)
      );
    }

    this.host.setDataPresentationState(
      targetDataId,
      toPlanarDataPresentation(nextProperties)
    );
  }

  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    const targetDataId = this.resolveTargetDataId(volumeId);
    const dataPresentation = targetDataId
      ? this.host.getDataPresentation(targetDataId)
      : undefined;
    const legacyProperties = targetDataId
      ? this.properties.get(targetDataId)
      : undefined;

    return {
      ...clonePlanarLegacyProperties(legacyProperties || {}),
      ...(dataPresentation
        ? clonePlanarLegacyProperties(dataPresentation)
        : {}),
      ...(this.host.getCameraOrientation()
        ? {
            orientation: clonePlanarOrientation(
              this.host.getCameraOrientation()
            ),
          }
        : {}),
    };
  }

  resetProperties(volumeId?: string): void {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const defaultProperties = this.defaultProperties.get(targetDataId) || {};

    this.properties.set(
      targetDataId,
      clonePlanarLegacyProperties(defaultProperties)
    );

    if (defaultProperties.orientation !== undefined) {
      this.host.setCameraOrientation(
        clonePlanarOrientation(defaultProperties.orientation)
      );
    }

    this.host.setDataPresentationState(
      targetDataId,
      toPlanarDataPresentation(defaultProperties)
    );
  }

  getNumberOfSlices(): number {
    return Math.max(
      this.host.getImageCount(),
      this.host.getMaxImageIdIndex() + 1
    );
  }

  removeDataId(dataId: string): void {
    if (!this.managedDataIds.delete(dataId)) {
      return;
    }

    viewportV2DataSetMetadataProvider.remove(dataId);
    this.properties.delete(dataId);
    this.defaultProperties.delete(dataId);

    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        this.volumeDataIds.delete(volumeId);
      }
    }
  }

  private getLegacyStackDataId(): string {
    return `__planar_v2__:${this.host.getViewportId()}:stack`;
  }

  private getLegacyVolumeDataId(volumeId: string): string {
    return `__planar_v2__:${this.host.getViewportId()}:volume:${volumeId}`;
  }

  private registerDataSet(
    dataId: string,
    dataSet: PlanarRegisteredDataSet
  ): void {
    viewportV2DataSetMetadataProvider.add(dataId, dataSet);
    this.managedDataIds.add(dataId);
  }

  private async mountVolumes(
    volumeInputArray: IVolumeInput[],
    replaceExisting: boolean
  ): Promise<void> {
    if (!volumeInputArray.length) {
      return;
    }

    const dataIds = volumeInputArray.map((volumeInput) => {
      const cachedVolume = cache.getVolume(volumeInput.volumeId);

      if (!cachedVolume) {
        throw new Error(
          `imageVolume with id: ${volumeInput.volumeId} does not exist, you need to create/allocate the volume first`
        );
      }

      const dataId = this.getLegacyVolumeDataId(volumeInput.volumeId);

      this.registerDataSet(dataId, {
        imageIds: cachedVolume.imageIds,
        initialImageIdIndex: this.getInitialVolumeImageIdIndex(
          cachedVolume.imageIds.length
        ),
        volumeId: volumeInput.volumeId,
      });
      this.volumeDataIds.set(volumeInput.volumeId, dataId);

      return dataId;
    });

    if (replaceExisting) {
      this.host.removeBindingsExcept(new Set(dataIds));
    }

    this.host.prepareVolumeCompatibilityCamera();

    await this.host.setDataIds(dataIds, {
      orientation: this.host.getRequestedOrientation(),
      renderMode: getShouldUseCPURendering() ? 'cpuVolume' : 'vtkVolume',
    });

    volumeInputArray.forEach((volumeInput, index) => {
      const dataId = dataIds[index];

      if (volumeInput.visibility !== undefined) {
        this.host.setDataPresentation(dataId, {
          visible: volumeInput.visibility,
        });
      }

      if (volumeInput.slabThickness !== undefined) {
        this.host.setDataPresentation(dataId, {
          slabThickness: volumeInput.slabThickness,
        });
      }

      const actor = this.host.getBindingActor(dataId);

      if (actor && volumeInput.callback) {
        volumeInput.callback({
          volumeActor: actor as never,
          volumeId: volumeInput.volumeId,
        });
      }
    });
  }

  private getInitialVolumeImageIdIndex(imageCount: number): number {
    const rendering = this.host.getCurrentPlanarRendering();

    if (
      rendering &&
      (rendering.renderMode === 'cpuVolume' ||
        rendering.renderMode === 'vtkVolume')
    ) {
      return Math.min(
        Math.max(0, rendering.currentImageIdIndex),
        Math.max(imageCount - 1, 0)
      );
    }

    return Math.max(0, Math.round((imageCount - 1) / 2));
  }

  private resolveTargetDataId(volumeId?: string): string | undefined {
    if (volumeId) {
      const dataId =
        this.volumeDataIds.get(volumeId) ||
        this.host.findDataIdByVolumeId(volumeId);

      if (dataId) {
        return dataId;
      }
    }

    return this.host.getActiveDataId() || this.host.getFirstBoundDataId();
  }
}

export default PlanarLegacyCompatibilityController;
