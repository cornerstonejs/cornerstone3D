import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

import { Types } from '@cornerstonejs/core';

import {
  ToolGroupSpecificLabelmapRepresentation,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';
import { ContourConfig } from '../../../types/ContourTypes';

import {
  addContourToElement,
  addContourSetToElement,
} from './addContourToElement';

type ContourRenderingConfig = ContourConfig & {
  visibility?: boolean;
};

const contourDisplayCache = new Map<string, ContourRenderingConfig>();

function renderContourSet(
  viewport: Types.IVolumeViewport,
  contourSet: Types.IContourSet,
  segmentationRepresentationUID: string,
  representationConfig: ToolGroupSpecificRepresentation,
  segmentSpecificConfig: ContourConfig,
  separated = false
): void {
  if (separated) {
    // todo: add visibility. I'm not even sure we need this separated option any more
    _renderSeparatedContours(
      contourSet,
      segmentationRepresentationUID,
      viewport
    );
    viewport.render();
    return;
  }

  const id = contourSet.id;
  const contourUID = `${segmentationRepresentationUID}_${id}`;
  const actorUID = contourUID;

  const actorEntry = viewport.getActor(actorUID);
  let actor = actorEntry?.actor as vtkActor;

  if (!actor) {
    contourDisplayCache.set(contourUID, {});
    actor = addContourSetToElement(viewport.element, contourSet, actorUID);
    viewport.resetCamera();
  }

  // // update the actor base on provided representation and segment specific config
  _handleCustomConfig(
    contourUID,
    representationConfig,
    actor,
    segmentSpecificConfig
  );

  viewport.render();
}

function _handleCustomConfig(
  contourUID: string,
  representationConfig: ToolGroupSpecificLabelmapRepresentation,
  actor: vtkActor,
  segmentSpecificConfig: ContourConfig
) {
  const contourDisplay = contourDisplayCache.get(contourUID);

  if (
    representationConfig?.visibility !== undefined &&
    contourDisplay.visibility !== representationConfig.visibility
  ) {
    actor.setVisibility(representationConfig.visibility);
    contourDisplay.visibility = representationConfig.visibility;
  }

  if (
    segmentSpecificConfig?.outlineWidthActive !== undefined &&
    contourDisplay.outlineWidthActive !==
      segmentSpecificConfig.outlineWidthActive
  ) {
    actor.getProperty().setLineWidth(segmentSpecificConfig.outlineWidthActive);
    contourDisplay.outlineWidthActive =
      segmentSpecificConfig.outlineWidthActive;
  }

  if (
    segmentSpecificConfig?.outlineOpacity !== undefined &&
    contourDisplay.outlineOpacity !== segmentSpecificConfig.outlineOpacity
  ) {
    actor.getProperty().setOpacity(segmentSpecificConfig.outlineOpacity);
    contourDisplay.outlineOpacity = segmentSpecificConfig.outlineOpacity;
  }

  // segment specific visibility overrides representation visibility
  if (
    segmentSpecificConfig?.renderOutline !== undefined &&
    contourDisplay.renderOutline !== segmentSpecificConfig.renderOutline
  ) {
    actor.setVisibility(segmentSpecificConfig.renderOutline);
    contourDisplay.renderOutline = segmentSpecificConfig.renderOutline;
  }
}

function _renderSeparatedContours(
  contourSet: Types.IContourSet,
  segmentationRepresentationUID: string,
  viewport: Types.IVolumeViewport
) {
  contourSet.getContours().forEach((contour: Types.IContour, index) => {
    const contourUID = `${segmentationRepresentationUID}_${contourSet.id}_${index}}`;
    const actorUID = contourUID;
    const actorEntry = viewport.getActor(actorUID);

    // TODO: We need to add the contour color to the colorLUT instead
    // of directly setting the color here
    if (!actorEntry) {
      addContourToElement(viewport.element, contour, actorUID);
    } else {
      throw new Error('Not implemented yet. (Update contour)');
    }
  });
  return;
}

export default renderContourSet;
