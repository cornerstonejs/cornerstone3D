/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

import { addAnnotation } from '../../../../stateManagement';
import { cache, Types, utilities, StackViewport } from '@cornerstonejs/core';
import { getClosestImageIdForStackViewport } from '../../../../utilities/annotationHydration';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../../types';
import { getConfigCache, setConfigCache } from './contourConfigCache';
import { getSegmentSpecificConfig } from './utils';
import { addContourSegmentationAnnotation } from '../../../../utilities/contourSegmentation';

import { validateGeometry } from './utils';

function handleContourSegmentation(
  viewport: StackViewport | Types.IVolumeViewport,
  geometryIds: string[],
  annotationUIDsMap: Map<number, Set<string>>,
  contourRepresentation: ToolGroupSpecificContourRepresentation,
  contourRepresentationConfig: SegmentationRepresentationConfig
) {
  const addOrUpdateFn = annotationUIDsMap.size
    ? updateContourSets
    : addContourSetsToElement;
  addOrUpdateFn(
    viewport,
    geometryIds,
    contourRepresentation,
    contourRepresentationConfig
  );
}

function updateContourSets(
  viewport: Types.IVolumeViewport | StackViewport,
  geometryIds: string[],
  contourRepresentation: ToolGroupSpecificContourRepresentation,
  contourRepresentationConfig: SegmentationRepresentationConfig
) {
  const { segmentationRepresentationUID, segmentsHidden } =
    contourRepresentation;
  const newContourConfig = contourRepresentationConfig.representations.CONTOUR;
  const cachedConfig = getConfigCache(segmentationRepresentationUID);

  const newOutlineWithActive = newContourConfig.outlineWidthActive;

  if (cachedConfig?.outlineWidthActive !== newOutlineWithActive) {
    setConfigCache(
      segmentationRepresentationUID,
      Object.assign({}, cachedConfig, {
        outlineWidthActive: newOutlineWithActive,
      })
    );
  }

  const segmentsToSetToInvisible = [];
  const segmentsToSetToVisible = [];

  for (const segmentIndex of segmentsHidden) {
    if (!cachedConfig.segmentsHidden.has(segmentIndex)) {
      segmentsToSetToInvisible.push(segmentIndex);
    }
  }

  for (const segmentIndex of cachedConfig.segmentsHidden) {
    if (!segmentsHidden.has(segmentIndex)) {
      segmentsToSetToVisible.push(segmentIndex);
    }
  }

  const mergedInvisibleSegments = Array.from(cachedConfig.segmentsHidden)
    .filter((segmentIndex) => !segmentsToSetToVisible.includes(segmentIndex))
    .concat(segmentsToSetToInvisible);

  const { segmentSpecificConfigs } = geometryIds.reduce(
    (acc, geometryId) => {
      const geometry = cache.getGeometry(geometryId);
      const { data: contourSet } = geometry;
      const segmentIndex = (contourSet as Types.IContourSet).getSegmentIndex();
      const segmentSpecificConfig = getSegmentSpecificConfig(
        contourRepresentation,
        geometryId,
        segmentIndex
      );
      acc.segmentSpecificConfigs[segmentIndex] = segmentSpecificConfig ?? {};

      return acc;
    },
    { contourSets: [], segmentSpecificConfigs: {} }
  );

  const affectedSegments = [
    ...mergedInvisibleSegments,
    ...segmentsToSetToVisible,
  ];

  const hasCustomSegmentSpecificConfig = Object.values(
    segmentSpecificConfigs
  ).some((config) => Object.keys(config).length > 0);

  if (affectedSegments.length || hasCustomSegmentSpecificConfig) {
    setConfigCache(
      segmentationRepresentationUID,
      Object.assign({}, cachedConfig, {
        segmentsHidden: new Set(segmentsHidden),
      })
    );
  }

  viewport.render();
}

function addContourSetsToElement(
  viewport: StackViewport | Types.IVolumeViewport,
  geometryIds: string[],
  contourRepresentation: ToolGroupSpecificContourRepresentation,
  contourRepresentationConfig: SegmentationRepresentationConfig
) {
  const { segmentationRepresentationUID, segmentationId, segmentsHidden } =
    contourRepresentation;
  const segmentSpecificMap = new Map();
  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId);

    if (!geometry) {
      console.warn(
        `No geometry found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }

    const segmentIndex = (geometry.data as Types.IContourSet).getSegmentIndex();

    validateGeometry(geometry);

    const segmentSpecificConfig = getSegmentSpecificConfig(
      contourRepresentation,
      geometryId,
      segmentIndex
    );

    const contourSet = geometry.data as Types.IContourSet;

    contourSet.contours.forEach((contour) => {
      const { points, color, id } = contour;
      const contourSegmentationAnnotation = {
        annotationUID: utilities.uuidv4(),
        data: {
          contour: {
            closed: true,
            polyline: points,
          },
          segmentation: {
            segmentationId,
            segmentIndex,
            color,
            id,
          },
          handles: {},
        },
        handles: {},
        highlighted: false,
        autoGenerated: false,
        invalidated: false,
        isLocked: true,
        isVisible: true,
        metadata: {
          referencedImageId: getClosestImageIdForStackViewport(
            viewport as StackViewport,
            points[0],
            viewport.getCamera().viewPlaneNormal
          ),
          toolName: 'PlanarFreehandContourSegmentationTool',
          FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
          viewPlaneNormal: viewport.getCamera().viewPlaneNormal,
        },
      };
      const annotationGroupSelector = viewport.element;

      addAnnotation(contourSegmentationAnnotation, annotationGroupSelector);

      addContourSegmentationAnnotation(contourSegmentationAnnotation);
    });

    if (segmentSpecificConfig) {
      segmentSpecificMap.set(segmentIndex, segmentSpecificConfig);
    }
  });

  const outlineWidthActive =
    contourRepresentationConfig.representations.CONTOUR.outlineWidthActive;

  setConfigCache(
    segmentationRepresentationUID,
    Object.assign({}, getConfigCache(segmentationRepresentationUID), {
      segmentsHidden: new Set(segmentsHidden),
      segmentSpecificMap,
      outlineWidthActive,
    })
  );

  viewport.resetCamera();
  viewport.render();
}

export {
  handleContourSegmentation,
  updateContourSets,
  addContourSetsToElement,
};
