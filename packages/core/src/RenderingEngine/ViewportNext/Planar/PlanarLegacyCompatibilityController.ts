import cache from '../../../cache/cache';
import type BlendModes from '../../../enums/BlendModes';
import { Events } from '../../../enums';
import { getShouldUseCPURendering } from '../../../init';
import { ActorRenderMode } from '../../../types';
import type { ActorEntry, ColormapPublic, IVolumeInput } from '../../../types';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  findMatchingColormap,
  getMaxOpacity,
  getThresholdValue,
} from '../../../utilities/colormap';
import { getTransferFunctionNodes } from '../../../utilities/transferFunctionUtils';
import viewportNextDataSetMetadataProvider from '../../../utilities/viewportNextDataSetMetadataProvider';
import type { PlanarRendering } from './planarRuntimeTypes';
import {
  clonePlanarLegacyProperties,
  mergePlanarLegacyProperties,
  clonePlanarOrientation,
  type PlanarLegacyViewportProperties,
  toPlanarDataPresentation,
} from './planarLegacyCompatibility';
import { mapSlabTypeToBlendMode } from './planarVolumeSliceBlendMode';
import type {
  PlanarCamera,
  PlanarDataPresentation,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
} from './PlanarViewportTypes';

export type PlanarLegacyCompatibilityHost = {
  getElement(): HTMLDivElement;
  getViewportId(): string;
  getRequestedOrientation(): PlanarCamera['orientation'];
  prepareVolumeCompatibilityCamera(): void;
  setData(dataId: string, options: PlanarSetDataOptions): Promise<string>;
  setDataList(
    entries: Array<{ dataId: string; options?: PlanarSetDataOptions }>
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
  getDefaultVOIRange(
    dataId: string
  ): { lower: number; upper: number } | undefined;
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
  private readonly globalDefaultProperties = new Map<
    string,
    PlanarLegacyViewportProperties
  >();
  private readonly perImageIdDefaultProperties = new Map<
    string,
    PlanarLegacyViewportProperties
  >();

  private readonly onStackNewImage = (event: Event) => {
    if (this.perImageIdDefaultProperties.size === 0) {
      return;
    }

    const detail = (event as CustomEvent<{ imageId?: string }>).detail;
    const imageId = detail?.imageId;
    const targetDataId = this.resolveTargetDataId();

    if (!targetDataId) {
      return;
    }

    const perImageProps = imageId
      ? this.perImageIdDefaultProperties.get(imageId)
      : undefined;
    const globalProps = this.globalDefaultProperties.get(targetDataId);
    const propsToApply = perImageProps || globalProps;

    if (!propsToApply) {
      return;
    }

    this.setProperties(propsToApply);
  };

  constructor(private readonly host: PlanarLegacyCompatibilityHost) {
    host
      .getElement()
      .addEventListener(Events.STACK_NEW_IMAGE, this.onStackNewImage);
  }

  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    if (!imageIds.length) {
      throw new Error('[PlanarViewport] Cannot set an empty stack');
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
    try {
      this.host.removeBindingsExcept(new Set([dataId]));

      await this.host.setData(dataId, {
        orientation: this.host.getRequestedOrientation(),
      });

      const resolvedImageId =
        await this.host.setImageIdIndex(clampedImageIdIndex);

      return this.host.getCurrentImageId() || resolvedImageId;
    } catch (error) {
      this.removeData(dataId);
      throw error;
    }
  }

  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, true, suppressEvents);

    if (immediate) {
      this.host.render();
    }
  }

  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, false, suppressEvents);

    if (immediate) {
      this.host.render();
    }
  }

  setProperties(
    properties: PlanarLegacyViewportProperties = {},
    volumeIdOrSuppressEvents?: string | boolean,
    suppressEvents = false
  ): void {
    const volumeId =
      typeof volumeIdOrSuppressEvents === 'string'
        ? volumeIdOrSuppressEvents
        : undefined;
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const nextProperties = mergePlanarLegacyProperties(
      this.properties.get(targetDataId) || {},
      properties
    );

    const currentDefaults =
      this.globalDefaultProperties.get(targetDataId) || {};
    this.globalDefaultProperties.set(
      targetDataId,
      mergePlanarLegacyProperties(properties, currentDefaults)
    );

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

    if (!suppressEvents && properties.colormap !== undefined) {
      this.emitColormapModified(targetDataId, volumeId);
    }
  }

  setDefaultProperties(
    properties: PlanarLegacyViewportProperties = {},
    imageId?: string
  ): void {
    if (imageId == null) {
      const targetDataId = this.resolveTargetDataId();
      if (!targetDataId) {
        return;
      }
      this.globalDefaultProperties.set(
        targetDataId,
        clonePlanarLegacyProperties(properties)
      );
      return;
    }

    this.perImageIdDefaultProperties.set(
      imageId,
      clonePlanarLegacyProperties(properties)
    );

    if (this.host.getCurrentImageId() === imageId) {
      this.setProperties(properties);
    }
  }

  clearDefaultProperties(imageId?: string): void {
    if (imageId == null) {
      const targetDataId = this.resolveTargetDataId();
      if (targetDataId) {
        this.globalDefaultProperties.delete(targetDataId);
      }
      this.resetProperties();
      return;
    }

    this.perImageIdDefaultProperties.delete(imageId);
    this.resetToDefaultProperties();
  }

  resetToDefaultProperties(): void {
    const targetDataId = this.resolveTargetDataId();
    if (!targetDataId) {
      return;
    }

    const currentImageId = this.host.getCurrentImageId();
    const defaultProperties =
      (currentImageId
        ? this.perImageIdDefaultProperties.get(currentImageId)
        : undefined) ||
      this.globalDefaultProperties.get(targetDataId) ||
      {};

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

  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    const targetDataId = this.resolveTargetDataId(volumeId);
    const dataPresentation = targetDataId
      ? this.host.getDataPresentation(targetDataId)
      : undefined;
    const legacyProperties = targetDataId
      ? this.properties.get(targetDataId)
      : undefined;
    const merged: PlanarLegacyViewportProperties = {
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

    if (!merged.voiRange && targetDataId) {
      const defaultVOIRange = this.host.getDefaultVOIRange(targetDataId);
      if (defaultVOIRange) {
        merged.voiRange = { ...defaultVOIRange };
      }
    }

    return merged;
  }

  resetProperties(volumeId?: string): void {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    this.properties.set(targetDataId, {});
    this.host.setDataPresentationState(targetDataId, {});
  }

  getBlendMode(filterActorUIDs: string[] = []): BlendModes | undefined {
    const targetDataId = this.getBlendModeTargetDataIds(filterActorUIDs)[0];

    if (!targetDataId) {
      return;
    }

    const storedBlendMode =
      this.host.getDataPresentation(targetDataId)?.blendMode;

    if (storedBlendMode !== undefined) {
      return storedBlendMode;
    }

    const actor = this.host.getBindingActor(targetDataId) as
      | {
          getMapper?: () => {
            getBlendMode?: () => BlendModes;
            getSlabType?: () => number;
          };
        }
      | undefined;

    const mapper = actor?.getMapper?.();
    const blendMode = mapper?.getBlendMode?.();

    if (blendMode !== undefined) {
      return blendMode;
    }

    return mapSlabTypeToBlendMode(mapper?.getSlabType?.());
  }

  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs: string[] = [],
    immediate = false
  ): void {
    const targetDataIds = this.getBlendModeTargetDataIds(filterActorUIDs);

    if (!targetDataIds.length) {
      return;
    }

    targetDataIds.forEach((dataId) => {
      const nextProperties = mergePlanarLegacyProperties(
        this.properties.get(dataId) || {},
        { blendMode }
      );

      this.properties.set(dataId, nextProperties);
      this.host.setDataPresentation(dataId, { blendMode });
    });

    if (immediate) {
      this.host.render();
    }
  }

  getNumberOfSlices(): number {
    return Math.max(
      this.host.getImageCount(),
      this.host.getMaxImageIdIndex() + 1
    );
  }

  removeData(dataId: string): void {
    if (!this.managedDataIds.delete(dataId)) {
      return;
    }

    this.unregisterDataId(dataId);
  }

  destroy(): void {
    let cleanupError: unknown;

    this.host
      .getElement()
      .removeEventListener(Events.STACK_NEW_IMAGE, this.onStackNewImage);

    for (const dataId of Array.from(this.managedDataIds)) {
      try {
        this.unregisterDataId(dataId);
      } catch (error) {
        cleanupError ??= error;
      }
    }

    this.managedDataIds.clear();
    this.volumeDataIds.clear();
    this.properties.clear();
    this.globalDefaultProperties.clear();
    this.perImageIdDefaultProperties.clear();

    if (cleanupError !== undefined) {
      throw cleanupError;
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
    viewportNextDataSetMetadataProvider.add(dataId, dataSet);
    this.managedDataIds.add(dataId);
  }

  private async mountVolumes(
    volumeInputArray: IVolumeInput[],
    replaceExisting: boolean,
    suppressEvents: boolean
  ): Promise<void> {
    if (!volumeInputArray.length) {
      return;
    }

    const dataIds: string[] = [];

    try {
      for (const volumeInput of volumeInputArray) {
        const cachedVolume = cache.getVolume(volumeInput.volumeId);

        if (!cachedVolume) {
          throw new Error(
            `imageVolume with id: ${volumeInput.volumeId} does not exist, you need to create/allocate the volume first`
          );
        }

        const dataId = this.getLegacyVolumeDataId(volumeInput.volumeId);

        this.registerDataSet(dataId, {
          actorUID: volumeInput.actorUID,
          imageIds: cachedVolume.imageIds,
          initialImageIdIndex: this.getInitialVolumeImageIdIndex(
            cachedVolume.imageIds.length
          ),
          referencedId: volumeInput.volumeId,
          representationUID:
            typeof volumeInput.representationUID === 'string'
              ? volumeInput.representationUID
              : undefined,
          volumeId: volumeInput.volumeId,
        });
        this.volumeDataIds.set(volumeInput.volumeId, dataId);
        dataIds.push(dataId);
      }

      if (replaceExisting) {
        this.host.removeBindingsExcept(new Set(dataIds));
      }

      this.host.prepareVolumeCompatibilityCamera();

      const sharedOptions: PlanarSetDataOptions = {
        orientation: this.host.getRequestedOrientation(),
        renderMode: getShouldUseCPURendering()
          ? ActorRenderMode.CPU_VOLUME
          : ActorRenderMode.VTK_VOLUME_SLICE,
      };
      const existingSourceDataId = this.host.getActiveDataId();

      await this.host.setDataList(
        dataIds.map((dataId, index) => {
          const shouldMountAsSource =
            index === 0 && (replaceExisting || !existingSourceDataId);

          return {
            dataId,
            options: {
              ...sharedOptions,
              role: shouldMountAsSource ? 'source' : 'overlay',
            },
          };
        })
      );

      volumeInputArray.forEach((volumeInput, index) => {
        const dataId = dataIds[index];

        if (volumeInput.visibility !== undefined) {
          this.host.setDataPresentation(dataId, {
            visible: volumeInput.visibility,
          });
        }

        if (volumeInput.blendMode !== undefined) {
          const nextProperties = mergePlanarLegacyProperties(
            this.properties.get(dataId) || {},
            { blendMode: volumeInput.blendMode }
          );

          this.properties.set(dataId, nextProperties);
          this.host.setDataPresentation(dataId, {
            blendMode: volumeInput.blendMode,
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

          const volumePresentation =
            this.buildVolumePresentationFromActor(dataId);

          if (volumePresentation) {
            this.applyVolumePresentation(dataId, volumePresentation);
          }
        }
      });

      if (!suppressEvents) {
        triggerEvent(
          this.host.getElement(),
          Events.VOLUME_VIEWPORT_NEW_VOLUME,
          {
            viewportId: this.host.getViewportId(),
            volumeActors: this.buildVolumeActorEntries(
              volumeInputArray,
              dataIds
            ),
          }
        );
      }
    } catch (error) {
      dataIds.forEach((dataId) => {
        this.removeData(dataId);
      });

      throw error;
    }
  }

  private getInitialVolumeImageIdIndex(imageCount: number): number {
    const rendering = this.host.getCurrentPlanarRendering();

    if (
      rendering &&
      (rendering.renderMode === ActorRenderMode.CPU_VOLUME ||
        rendering.renderMode === ActorRenderMode.VTK_VOLUME_SLICE)
    ) {
      return Math.min(
        Math.max(0, rendering.currentImageIdIndex),
        Math.max(imageCount - 1, 0)
      );
    }

    // Match legacy VolumeViewport startup behavior: resetCamera positions
    // the focal point at the center of the volume, which is the middle slice.
    return Math.floor((imageCount - 1) / 2);
  }

  private getBlendModeTargetDataIds(filterActorUIDs: string[]): string[] {
    const volumeDataIds = Array.from(new Set(this.volumeDataIds.values()));

    if (!filterActorUIDs.length) {
      return volumeDataIds;
    }

    return volumeDataIds.filter((dataId) => {
      const actor = this.host.getBindingActor(dataId) as
        | {
            get?: (propertyName?: string) => unknown;
            getUID?: () => string;
            uid?: string;
          }
        | undefined;
      const actorUid =
        actor?.getUID?.() ||
        actor?.uid ||
        ((actor?.get?.('uid') as { uid?: string } | undefined)?.uid ??
          undefined);

      return actorUid ? filterActorUIDs.includes(actorUid) : false;
    });
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

  private emitColormapModified(
    dataId: string,
    requestedVolumeId?: string
  ): void {
    const volumeId = requestedVolumeId || this.resolveVolumeIdForDataId(dataId);
    const colormap =
      (volumeId ? this.buildVolumeColormap(dataId) : undefined) ||
      this.properties.get(dataId)?.colormap;

    if (!colormap) {
      return;
    }

    triggerEvent(this.host.getElement(), Events.COLORMAP_MODIFIED, {
      viewportId: this.host.getViewportId(),
      volumeId,
      colormap,
    });
  }

  private applyVolumePresentation(
    dataId: string,
    volumePresentation: PlanarLegacyViewportProperties
  ): void {
    const nextProperties = mergePlanarLegacyProperties(
      this.properties.get(dataId) || {},
      volumePresentation
    );

    this.properties.set(dataId, nextProperties);

    const currentDefaults = this.globalDefaultProperties.get(dataId) || {};
    this.globalDefaultProperties.set(
      dataId,
      mergePlanarLegacyProperties(nextProperties, currentDefaults)
    );

    this.host.setDataPresentationState(
      dataId,
      toPlanarDataPresentation(nextProperties)
    );
  }

  private buildVolumeActorEntries(
    volumeInputArray: IVolumeInput[],
    dataIds: string[]
  ): ActorEntry[] {
    return volumeInputArray.flatMap((volumeInput, index) => {
      const actor = this.host.getBindingActor(dataIds[index]) as
        | ActorEntry['actor']
        | undefined;

      if (!actor) {
        return [];
      }

      const { actorUID, slabThickness, volumeId, ...rest } = volumeInput;

      return [
        {
          uid: actorUID || volumeId,
          actor,
          slabThickness,
          referencedId: volumeId,
          ...rest,
        },
      ];
    });
  }

  private buildVolumeColormap(dataId: string): ColormapPublic | undefined {
    const actor = this.host.getBindingActor(dataId) as
      | {
          getProperty?: () => {
            getRGBTransferFunction?: (index: number) => {
              getNodeValue?: (index: number, values: number[]) => void;
              getSize?: () => number;
            };
          };
        }
      | undefined;

    const transferFunction = actor?.getProperty?.().getRGBTransferFunction?.(0);

    if (!actor || !transferFunction) {
      return;
    }

    const rgbPoints = getTransferFunctionNodes(transferFunction).reduce(
      (points, node) => {
        points.push(node[0], node[1], node[2], node[3]);
        return points;
      },
      [] as number[]
    );
    const matchedColormap =
      findMatchingColormap(rgbPoints, actor as never) || {};
    const threshold = getThresholdValue(actor as never);

    if (matchedColormap.opacity === undefined) {
      matchedColormap.opacity = getMaxOpacity(actor as never);
    }

    if (threshold !== null) {
      matchedColormap.threshold = threshold;
    }

    return Object.keys(matchedColormap).length ? matchedColormap : undefined;
  }

  private buildVolumePresentationFromActor(
    dataId: string
  ): PlanarLegacyViewportProperties | undefined {
    const actor = this.host.getBindingActor(dataId) as
      | {
          getMapper?: () => {
            getBlendMode?: () => BlendModes;
            getSlabType?: () => number;
          };
          getProperty?: () => {
            getRGBTransferFunction?: (index: number) => {
              getRange?: () => [number, number];
            };
          };
        }
      | undefined;

    const transferFunction = actor?.getProperty?.().getRGBTransferFunction?.(0);
    const volumeColormap = this.buildVolumeColormap(dataId);
    const mapper = actor?.getMapper?.();
    const blendMode =
      mapper?.getBlendMode?.() ??
      mapSlabTypeToBlendMode(mapper?.getSlabType?.());
    const range = transferFunction?.getRange?.();
    const volumePresentation: PlanarLegacyViewportProperties = {};

    if (volumeColormap) {
      volumePresentation.colormap = volumeColormap;
    }

    if (range && range[1] > range[0]) {
      volumePresentation.voiRange = {
        lower: range[0],
        upper: range[1],
      };
    }

    if (blendMode !== undefined) {
      volumePresentation.blendMode = blendMode;
    }

    return Object.keys(volumePresentation).length
      ? volumePresentation
      : undefined;
  }

  private resolveVolumeIdForDataId(dataId: string): string | undefined {
    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        return volumeId;
      }
    }
  }

  private unregisterDataId(dataId: string): void {
    try {
      viewportNextDataSetMetadataProvider.remove(dataId);
    } finally {
      this.properties.delete(dataId);
      this.globalDefaultProperties.delete(dataId);
      this.removeVolumeDataId(dataId);
    }
  }

  private removeVolumeDataId(dataId: string): void {
    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        this.volumeDataIds.delete(volumeId);
      }
    }
  }
}

export default PlanarLegacyCompatibilityController;
