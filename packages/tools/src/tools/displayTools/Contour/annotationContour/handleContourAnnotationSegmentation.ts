/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

import { Types } from '@cornerstonejs/core';
import { getAnnotation } from '../../../../stateManagement';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../../types';

function handleContourAnnotationSegmentation(
  viewport: Types.IVolumeViewport,
  annotationUIDsMap: Map<number, Set<string>>,
  representationConfig: ToolGroupSpecificContourRepresentation,
  toolGroupConfig: SegmentationRepresentationConfig
) {}

export { handleContourAnnotationSegmentation };
