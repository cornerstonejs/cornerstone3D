import type {
  DataProvider,
  LogicalDataObject,
} from '../ViewportArchitectureTypes';
import type { VideoStreamPayload } from './VideoViewportV2Types';
import { loadVideoStreamMetadata } from '../../../utilities/VideoUtilities';
import * as metaData from '../../../metaData';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';

export class DefaultVideoDataProvider implements DataProvider {
  private getSourceDataId(dataId: string): string {
    const registered = metaData.get(
      viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
      dataId
    );

    if (typeof registered === 'string') {
      return registered;
    }

    if (Array.isArray(registered) && registered[0]) {
      return registered[0];
    }

    return dataId;
  }

  async load(dataId: string): Promise<LogicalDataObject> {
    const sourceDataId = this.getSourceDataId(dataId);
    const stream = loadVideoStreamMetadata(sourceDataId);

    return {
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
  }
}
