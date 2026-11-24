import type { DataProvider, LoadedData } from '../ViewportArchitectureTypes';
import { loadVideoStreamMetadata } from '../../../utilities/VideoUtilities';
import {
  displaySetShapeError,
  getDisplaySetImageId,
} from '../displaySetAccess';
import type { VideoStreamPayload } from './VideoViewportTypes';

export class DefaultVideoDataProvider implements DataProvider {
  async load(displaySetId: string): Promise<LoadedData<VideoStreamPayload>> {
    const sourceImageId = getDisplaySetImageId(displaySetId);

    if (!sourceImageId) {
      throw displaySetShapeError('VideoViewport', displaySetId, 'imageId');
    }

    const stream = loadVideoStreamMetadata(sourceImageId);

    return {
      id: displaySetId,
      type: 'video',
      renderedUrl: stream.renderedUrl,
      fps: stream.cineRate || 30,
      numberOfFrames: stream.numberOfFrames || 1,
      frameRange: [1, stream.numberOfFrames || 1],
      modality: stream.modality,
      metadata: stream.metadata,
    };
  }
}
