import { Types } from '@cornerstonejs/core';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../types/index.js';
import { addContourSetsToElement } from './addContourSetsToElement.js';
import { updateContourSets } from './updateContourSets.js';

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
