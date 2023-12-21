import { Volume, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

type LoadStatus = {
  loaded: boolean;
  loading: boolean;
  callbacks: Array<(...args: unknown[]) => void>;
};

type NiftiImageProperties = {
  loadStatus: LoadStatus;
  controller: AbortController;
};

/**
 * NiftiImageVolume Class that extends ImageVolume base class.
 * It implements load method to load the data from the Nifti file, and insert them into the volume.
 */
export default class NiftiImageVolume extends Volume {
  loadStatus: LoadStatus;
  controller: AbortController;

  constructor(
    imageVolumeProperties: Types.VolumeProps,
    streamingProperties: NiftiImageProperties
  ) {
    super(imageVolumeProperties);

    this.loadStatus = streamingProperties.loadStatus;
    this.controller = streamingProperties.controller;
  }

  /**
   * It cancels loading the images of the volume. It sets the loading status to false
   * and filters any imageLoad request in the requestPoolManager that has the same
   * volumeId
   */
  public cancelLoading = () => {
    const { loadStatus } = this;

    if (!loadStatus || !loadStatus.loading) {
      return;
    }

    // Set to not loading.
    loadStatus.loading = false;

    // Remove all the callback listeners
    this.clearLoadCallbacks();

    this.controller.abort();
  };

  /**
   * Clear the load callbacks
   */
  public clearLoadCallbacks(): void {
    this.loadStatus.callbacks = [];
  }

  /**
   * It triggers a prefetch for images in the volume.
   * @param callback - A callback function to be called when the volume is fully loaded
   * @param priority - The priority for loading the volume images, lower number is higher priority
   * @returns
   */
  public load = (
    callback: (...args: unknown[]) => void,
    priority = 5
  ): void => {
    // This is a noop since we have to do the loading during volume creation,
    // as the whole NIFTI comes in one file.
    // With a clever backend you could eventually do a range read on the NIFTI
    // instead, at which point the load() method would search frame by frame
    // for the data, and the actual volume loader would just fetch the header.
  };

  public decache(): void {
    cache.removeVolumeLoadObject(this.volumeId);
  }
}
