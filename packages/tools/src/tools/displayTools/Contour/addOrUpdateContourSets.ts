import { Types } from '@cornerstonejs/core';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../types';
import { addContourSetsToElement } from './addContourSetsToElement';
import { updateContourSets } from './updateContourSets';

export function addOrUpdateContourSets(
  viewport: Types.IVolumeViewport,
  geometryIds: string[],
  contourRepresentation: ToolGroupSpecificContourRepresentation,
  contourRepresentationConfig: SegmentationRepresentationConfig
) {
  const { segmentationRepresentationUID } = contourRepresentation;
  const actorUID = `CONTOUR_${segmentationRepresentationUID}`;
  const actor = viewport.getActor(actorUID);

  const addOrUpdateFn = actor ? updateContourSets : addContourSetsToElement;
  addOrUpdateFn(
    viewport,
    geometryIds,
    contourRepresentation,
    contourRepresentationConfig,
    actorUID
  );
}
