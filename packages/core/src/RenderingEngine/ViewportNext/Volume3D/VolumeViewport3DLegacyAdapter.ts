import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import cache from '../../../cache/cache';
import { VIEWPORT_PRESETS } from '../../../constants';
import { Events } from '../../../enums';
import type {
  ActorEntry,
  IVolumeInput,
  VolumeViewportProperties,
  ViewportPreset,
} from '../../../types';
import applyPreset from '../../../utilities/applyPreset';
import triggerEvent from '../../../utilities/triggerEvent';
import viewportNextDataSetMetadataProvider from '../../../utilities/viewportNextDataSetMetadataProvider';
import VolumeViewport3DV2 from './3dViewport';
import type {
  Volume3DDataPresentation,
  Volume3DRegisteredDataSet,
  Volume3DVolumeRendering,
} from './3dViewportTypes';

class VolumeViewport3DLegacyAdapter extends VolumeViewport3DV2 {
  private readonly managedDataIds = new Set<string>();
  private readonly volumeDataIds = new Map<string, string>();
  private readonly legacyProperties = new Map<
    string,
    VolumeViewportProperties
  >();
  private readonly defaultLegacyProperties = new Map<
    string,
    VolumeViewportProperties
  >();

  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, true, suppressEvents);

    if (immediate) {
      this.render();
    }
  }

  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, false, suppressEvents);

    if (immediate) {
      this.render();
    }
  }

  setProperties(
    properties: VolumeViewportProperties = {},
    volumeId?: string,
    suppressEvents = false
  ): void {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const nextProperties: VolumeViewportProperties = {
      ...(this.legacyProperties.get(targetDataId) || {}),
      ...properties,
    };

    if (!this.defaultLegacyProperties.has(targetDataId)) {
      this.defaultLegacyProperties.set(targetDataId, { ...properties });
    }

    this.legacyProperties.set(targetDataId, nextProperties);

    const presentationPatch: Partial<Volume3DDataPresentation> = {};

    if (properties.voiRange !== undefined) {
      presentationPatch.voiRange = properties.voiRange;
    }

    if (properties.invert !== undefined) {
      presentationPatch.invert = properties.invert;
    }

    if (properties.interpolationType !== undefined) {
      presentationPatch.interpolationType = properties.interpolationType;
    }

    if (properties.sampleDistanceMultiplier !== undefined) {
      presentationPatch.sampleDistanceMultiplier =
        properties.sampleDistanceMultiplier;
    }

    if (Object.keys(presentationPatch).length) {
      this.setDataPresentation(targetDataId, presentationPatch);
    }

    if (properties.preset !== undefined) {
      this.applyPresetToBinding(
        targetDataId,
        properties.preset,
        volumeId,
        suppressEvents
      );
    }

    this.render();
  }

  getProperties(volumeId?: string): VolumeViewportProperties {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return {};
    }

    return { ...(this.legacyProperties.get(targetDataId) || {}) };
  }

  resetProperties(volumeId?: string): void {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const defaults = this.defaultLegacyProperties.get(targetDataId) || {};
    this.legacyProperties.set(targetDataId, { ...defaults });

    this.setDataPresentation(targetDataId, {
      voiRange: defaults.voiRange,
      invert: defaults.invert,
      interpolationType: defaults.interpolationType,
      sampleDistanceMultiplier: defaults.sampleDistanceMultiplier,
    });

    if (defaults.preset !== undefined) {
      this.applyPresetToBinding(targetDataId, defaults.preset, volumeId, false);
    }

    this.render();
  }

  setSampleDistanceMultiplier(multiplier: number): void {
    this.setProperties({ sampleDistanceMultiplier: multiplier });
  }

  removeData(dataId: string): void {
    super.removeData(dataId);
    this.forgetData(dataId);
  }

  getActors(): ActorEntry[] {
    return super.getActors();
  }

  getDefaultActor(): ActorEntry | undefined {
    return super.getDefaultActor();
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

        const dataSet: Volume3DRegisteredDataSet = {
          actorUID: volumeInput.actorUID,
          imageIds: cachedVolume.imageIds,
          volumeId: volumeInput.volumeId,
        };

        viewportNextDataSetMetadataProvider.add(dataId, dataSet);
        this.managedDataIds.add(dataId);
        this.volumeDataIds.set(volumeInput.volumeId, dataId);
        dataIds.push(dataId);
      }

      if (replaceExisting) {
        this.removeBindingsExcept(new Set(dataIds));
      }

      await this.setDataList(
        dataIds.map((dataId) => ({
          dataId,
          options: { renderMode: 'vtkVolume3d' as const },
        }))
      );

      volumeInputArray.forEach((volumeInput, index) => {
        const dataId = dataIds[index];

        if (volumeInput.visibility !== undefined) {
          this.setDataPresentation(dataId, {
            visible: volumeInput.visibility,
          });
        }

        if (volumeInput.callback) {
          const actor = this.getBindingActor(dataId) as vtkVolume | undefined;

          if (actor) {
            volumeInput.callback({
              volumeActor: actor as never,
              volumeId: volumeInput.volumeId,
            });
          }
        }
      });

      if (!suppressEvents) {
        triggerEvent(this.element, Events.VOLUME_VIEWPORT_NEW_VOLUME, {
          viewportId: this.id,
          volumeActors: this.buildActorEntries(volumeInputArray, dataIds),
        });
      }
    } catch (error) {
      dataIds.forEach((dataId) => {
        this.forgetData(dataId);
      });

      throw error;
    }
  }

  private buildActorEntries(
    volumeInputArray: IVolumeInput[],
    dataIds: string[]
  ): ActorEntry[] {
    return volumeInputArray.flatMap((volumeInput, index) => {
      const actor = this.getBindingActor(dataIds[index]);

      if (!actor) {
        return [];
      }

      const { actorUID, slabThickness, volumeId, ...rest } = volumeInput;

      return [
        {
          uid: actorUID || volumeId,
          actor: actor as ActorEntry['actor'],
          slabThickness,
          referencedId: volumeId,
          ...rest,
        },
      ];
    });
  }

  private applyPresetToBinding(
    dataId: string,
    presetNameOrObj: string | ViewportPreset,
    requestedVolumeId: string | undefined,
    suppressEvents: boolean
  ): void {
    const preset =
      typeof presetNameOrObj === 'string'
        ? VIEWPORT_PRESETS.find((entry) => entry.name === presetNameOrObj)
        : presetNameOrObj;

    if (!preset) {
      return;
    }

    const actor = this.getBindingActor(dataId) as vtkVolume | undefined;

    if (!actor) {
      return;
    }

    applyPreset(actor as never, preset);

    if (!suppressEvents) {
      triggerEvent(this.element, Events.PRESET_MODIFIED, {
        viewportId: this.id,
        volumeId: requestedVolumeId ?? this.resolveVolumeIdForDataId(dataId),
        actor,
        presetName: preset.name,
      });
    }
  }

  private getBindingActor(dataId: string): unknown {
    const binding = this.getBinding(dataId);

    if (!binding) {
      return;
    }

    const rendering = binding.rendering as Partial<Volume3DVolumeRendering>;

    return rendering?.actor;
  }

  private resolveTargetDataId(volumeId?: string): string | undefined {
    if (volumeId) {
      const mapped = this.volumeDataIds.get(volumeId);

      if (mapped) {
        return mapped;
      }

      for (const [dataId, binding] of this.bindings.entries()) {
        const rendering = binding.rendering as Partial<Volume3DVolumeRendering>;

        if (rendering?.imageVolume?.volumeId === volumeId) {
          return dataId;
        }
      }
    }

    return this.bindings.keys().next().value;
  }

  private resolveVolumeIdForDataId(dataId: string): string | undefined {
    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        return volumeId;
      }
    }
  }

  private removeBindingsExcept(keepDataIds: Set<string>): void {
    for (const dataId of Array.from(this.bindings.keys())) {
      if (!keepDataIds.has(dataId)) {
        this.removeData(dataId);
      }
    }
  }

  private getLegacyVolumeDataId(volumeId: string): string {
    return `__volume3d_v2__:${this.id}:volume:${volumeId}`;
  }

  private forgetData(dataId: string): void {
    if (!this.managedDataIds.delete(dataId)) {
      return;
    }

    viewportNextDataSetMetadataProvider.remove(dataId);
    this.legacyProperties.delete(dataId);
    this.defaultLegacyProperties.delete(dataId);

    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        this.volumeDataIds.delete(volumeId);
      }
    }
  }

  protected override onDestroy(): void {
    for (const dataId of Array.from(this.managedDataIds)) {
      viewportNextDataSetMetadataProvider.remove(dataId);
    }

    this.managedDataIds.clear();
    this.volumeDataIds.clear();
    this.legacyProperties.clear();
    this.defaultLegacyProperties.clear();

    super.onDestroy();
  }
}

export default VolumeViewport3DLegacyAdapter;
