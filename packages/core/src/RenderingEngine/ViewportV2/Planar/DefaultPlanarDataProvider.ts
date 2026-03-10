import { loadAndCacheImage } from '../../../loaders/imageLoader';
import type { LogicalDataObject } from '../ViewportArchitectureTypes';
import type {
  PlanarDataProvider,
  PlanarRegisteredDataSet,
  PlanarStackPayload,
} from './PlanarViewportV2Types';

export class DefaultPlanarDataProvider implements PlanarDataProvider {
  private cache = new Map<string, LogicalDataObject>();
  private registeredDataSets = new Map<string, PlanarRegisteredDataSet>();

  register(dataId: string, dataSet: PlanarRegisteredDataSet): void {
    this.registeredDataSets.set(dataId, dataSet);
    this.cache.delete(dataId);
  }

  async load(dataId: string): Promise<LogicalDataObject> {
    const cached = this.cache.get(dataId);

    if (cached) {
      return cached;
    }

    const dataSet = this.registeredDataSets.get(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewportV2] No registered stack dataset for ${dataId}`
      );
    }

    const clampedImageIdIndex = Math.min(
      Math.max(0, dataSet.initialImageIdIndex),
      dataSet.imageIds.length - 1
    );
    const initialImage = await loadAndCacheImage(
      dataSet.imageIds[clampedImageIdIndex]
    );
    const logicalDataObject: LogicalDataObject<PlanarStackPayload> = {
      id: dataId,
      role: 'image',
      kind: 'imageStack',
      metadata: {
        imageIds: dataSet.imageIds,
        initialImageIdIndex: clampedImageIdIndex,
        imageId: initialImage.imageId,
      },
      payload: {
        imageIds: dataSet.imageIds,
        initialImageIdIndex: clampedImageIdIndex,
        initialImage,
        volumeId:
          dataSet.volumeId || `cornerstoneStreamingImageVolume:${dataId}`,
      },
    };

    this.cache.set(dataId, logicalDataObject);
    return logicalDataObject;
  }
}
