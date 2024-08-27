import { addAnnotation } from '../../../../stateManagement/annotation/annotationState';
import type { Types, StackViewport } from '@cornerstonejs/core';
import { cache, utilities } from '@cornerstonejs/core';
import { getClosestImageIdForStackViewport } from '../../../../utilities/annotationHydration';

import {
  getConfigCache,
  initializeConfigCache,
  setConfigCache,
} from './contourConfigCache';
import { addContourSegmentationAnnotation } from '../../../../utilities/contourSegmentation';

import { validateGeometry } from './utils';
import type { ContourRepresentation } from '../../../../types/SegmentationStateTypes';
import { getGlobalConfig } from '../../../../stateManagement/segmentation/getGlobalConfig';
import { getHiddenSegmentIndices } from '../../../../stateManagement/segmentation/config/segmentationVisibility';
import { getSegmentIndexConfig } from '../../../../stateManagement/segmentation/config/segmentationConfig';
import { getSegmentationRepresentation } from '../../../../stateManagement/segmentation/getSegmentationRepresentation';

function handleContourSegmentation(
  viewport: StackViewport | Types.IVolumeViewport,
  geometryIds: string[],
  annotationUIDsMap: Map<number, Set<string>>,
  contourRepresentation: ContourRepresentation
) {
  // if contourRepresentation exists, updateContourSets, otherwise addContourSetsToElement
  const { segmentationRepresentationUID } = contourRepresentation;

  const segmentationRepresentation = getSegmentationRepresentation(
    segmentationRepresentationUID
  );

  // if config cache does not exist, initialize it
  if (!getConfigCache(segmentationRepresentationUID)) {
    initializeConfigCache(segmentationRepresentationUID);
  }

  if (segmentationRepresentation && annotationUIDsMap.size) {
    updateContourSets(viewport, geometryIds, contourRepresentation);
  } else {
    addContourSetsToElement(viewport, geometryIds, contourRepresentation);
  }
}

function updateContourSets(
  viewport: Types.IVolumeViewport | StackViewport,
  geometryIds: string[],
  contourRepresentation: ContourRepresentation
) {
  const { segmentationRepresentationUID, config } = contourRepresentation;

  const baseConfig = config?.allSegments;
  const globalContourConfig = getGlobalConfig().representations.Contour;

  const newContourConfig = utilities.deepMerge(globalContourConfig, baseConfig);

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

  const segmentsHidden = getHiddenSegmentIndices(
    viewport.id,
    segmentationRepresentationUID
  );

  for (const segmentIndex of segmentsHidden) {
    if (!cachedConfig.segmentsHidden.has(segmentIndex)) {
      segmentsToSetToInvisible.push(segmentIndex);
    }
  }

  for (const segmentIndex of cachedConfig?.segmentsHidden ?? []) {
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
      const segmentSpecificConfig = getSegmentIndexConfig(
        segmentationRepresentationUID,
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
  contourRepresentation: ContourRepresentation
) {
  const { segmentationRepresentationUID, segmentationId } =
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

    const segmentSpecificConfig = getSegmentIndexConfig(
      segmentationRepresentationUID,
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

  const baseConfig = contourRepresentation.config?.allSegments;
  const globalContourConfig = getGlobalConfig().representations.Contour;

  const newContourConfig = utilities.deepMerge(globalContourConfig, baseConfig);
  const outlineWidthActive = newContourConfig.outlineWidthActive;

  const segmentsHidden = getHiddenSegmentIndices(
    viewport.id,
    segmentationRepresentationUID
  );

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
