import type {
  DataProvider,
  LogicalDataObject,
} from '../ViewportArchitectureTypes';
import type { VideoStreamPayload } from './VideoViewportV2Types';
import { loadVideoStreamMetadata } from '../../../utilities/VideoUtilities';

export class DefaultVideoDataProvider implements DataProvider {
  private cache = new Map<string, LogicalDataObject>();

  async load(dataId: string): Promise<LogicalDataObject> {
    const cached = this.cache.get(dataId);

    if (cached) {
      return cached;
    }

    const stream = loadVideoStreamMetadata(dataId);
    const logicalDataObject: LogicalDataObject<VideoStreamPayload> = {
      id: dataId,
      role: 'video',
      kind: 'videoStream',
      metadata: {
        modality: stream.modality,
        imageDataMetadata: stream.metadata,
      },
      payload: {
        renderedUrl: stream.renderedUrl,
        fps: stream.cineRate || 30,
        numberOfFrames: stream.numberOfFrames || 1,
        frameRange: [1, stream.numberOfFrames || 1],
        modality: stream.modality,
        metadata: stream.metadata,
      },
    };

    this.cache.set(dataId, logicalDataObject);
    return logicalDataObject;
  }
}
