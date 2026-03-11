import type { DataProvider, LoadedData } from '../ViewportArchitectureTypes';
import { loadVideoStreamMetadata } from '../../../utilities/VideoUtilities';
import { getViewportV2SourceDataId } from '../viewportV2DataSetAccess';
import type { VideoStreamPayload } from './VideoViewportV2Types';

export class DefaultVideoDataProvider implements DataProvider {
  async load(dataId: string): Promise<LoadedData<VideoStreamPayload>> {
    const sourceDataId = getViewportV2SourceDataId(dataId);
    const stream = loadVideoStreamMetadata(sourceDataId);

    return {
      id: dataId,
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
