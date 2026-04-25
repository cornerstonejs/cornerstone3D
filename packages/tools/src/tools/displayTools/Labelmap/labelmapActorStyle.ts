import { ActorRenderMode, type Types } from '@cornerstonejs/core';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { getActiveSegmentation } from '../../../stateManagement/segmentation/activeSegmentation';
import { getActiveSegmentIndex } from '../../../stateManagement/segmentation/getActiveSegmentIndex';
import { getColorLUT } from '../../../stateManagement/segmentation/getColorLUT';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { internalGetHiddenSegmentIndices } from '../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices';
import { getSegmentBinding } from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { segmentationStyle } from '../../../stateManagement/segmentation/SegmentationStyle';
import type { LabelmapStyle } from '../../../types/LabelmapTypes';
import type { SegmentationRepresentation } from '../../../types/SegmentationStateTypes';
import { getLabelmapForActorReference } from './volumeLabelmapImageMapper';

const MAX_NUMBER_COLORS = 255;

function setLabelmapColorAndOpacity(
  viewportId: string,
  labelmapActorEntry: Types.ActorEntry,
  segmentationRepresentation: SegmentationRepresentation
): void {
  const { segmentationId } = segmentationRepresentation;
  const { colorLUTIndex } = segmentationRepresentation;
  const activeSegmentation = getActiveSegmentation(viewportId);

  const isActiveLabelmap =
    activeSegmentation?.segmentationId === segmentationId;

  const labelmapStyle = segmentationStyle.getStyle({
    viewportId,
    type: SegmentationRepresentations.Labelmap,
    segmentationId,
  });

  const renderInactiveSegmentations =
    segmentationStyle.getRenderInactiveSegmentations(viewportId);

  const colorLUT = getColorLUT(colorLUTIndex);
  const segmentation = getSegmentation(segmentationId);
  const layer = getLabelmapForActorReference(
    segmentation,
    labelmapActorEntry.referencedId
  );
  const layerBindings = Object.keys(segmentation.segments)
    .map(Number)
    .map((segmentIndex) => ({
      segmentIndex,
      binding: getSegmentBinding(segmentation, segmentIndex),
    }))
    .filter(
      (entry) => !layer || entry.binding?.labelmapId === layer.labelmapId
    );
  const maxLabelValue = Math.max(
    1,
    ...layerBindings.map(
      (entry) => entry.binding?.labelValue ?? entry.segmentIndex
    )
  );
  const numColors = Math.max(colorLUT.length, maxLabelValue + 1);
  const labelValueEntries = Array.from(
    { length: numColors - 1 },
    (_, index) => {
      const labelValue = index + 1;
      const segmentIndex =
        layer?.labelToSegmentIndex?.[labelValue] ?? labelValue;

      return {
        labelValue,
        segmentIndex,
      };
    }
  );

  const {
    outlineWidth,
    renderOutline,
    outlineOpacity,
    activeSegmentOutlineWidthDelta,
  } = getLabelmapConfig(labelmapStyle as LabelmapStyle, isActiveLabelmap);

  const segmentsHidden = internalGetHiddenSegmentIndices(viewportId, {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  });

  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();

  const colorNodes = [{ x: 0, r: 0, g: 0, b: 0, midpoint: 0.5, sharpness: 0 }];
  const opacityNodes = [{ x: 0, y: 0, midpoint: 0.5, sharpness: 0 }];

  labelValueEntries.forEach(({ labelValue, segmentIndex }) => {
    const segmentColor = colorLUT[segmentIndex];
    if (!segmentColor) {
      return;
    }

    const perSegmentStyle = segmentationStyle.getStyle({
      viewportId,
      type: SegmentationRepresentations.Labelmap,
      segmentationId,
      segmentIndex,
    });

    const { fillAlpha, renderFill } = getLabelmapConfig(
      labelmapStyle as LabelmapStyle,
      isActiveLabelmap,
      perSegmentStyle
    );

    colorNodes.push({
      x: labelValue,
      r: segmentColor[0] / MAX_NUMBER_COLORS,
      g: segmentColor[1] / MAX_NUMBER_COLORS,
      b: segmentColor[2] / MAX_NUMBER_COLORS,
      midpoint: 0.5,
      sharpness: 0,
    });

    if (renderFill) {
      const segmentOpacity = segmentsHidden.has(segmentIndex)
        ? 0
        : (segmentColor[3] / 255) * fillAlpha;

      opacityNodes.push({
        x: labelValue,
        y: segmentOpacity,
        midpoint: 0.5,
        sharpness: 0,
      });
    } else {
      opacityNodes.push({
        x: labelValue,
        y: 0.01,
        midpoint: 0.5,
        sharpness: 0,
      });
    }
  });

  cfun.setNodes(colorNodes);
  ofun.setNodes(opacityNodes);

  ofun.setClamping(false);
  const labelmapActor = labelmapActorEntry.actor as vtkVolume | vtkImageSlice;
  const actorMapper = labelmapActorEntry.actorMapper as
    | {
        mapper?: {
          modified?: () => void;
        };
      }
    | undefined;
  const labelmapMapper = actorMapper?.mapper
    ? actorMapper.mapper
    : labelmapActor.getMapper();

  // @ts-ignore - fix type in vtk
  const { preLoad } = labelmapActor.get?.('preLoad') || { preLoad: null };

  if (preLoad) {
    preLoad({ cfun, ofun, actor: labelmapActor });
  } else {
    labelmapActor.getProperty().setRGBTransferFunction(0, cfun);
    labelmapActor.getProperty().setScalarOpacity(0, ofun);
    labelmapActor.getProperty().setInterpolationTypeToNearest();
  }

  if (
    labelmapActorEntry.actorMapper?.renderMode === ActorRenderMode.VTK_IMAGE ||
    labelmapActorEntry.actorMapper?.renderMode ===
      ActorRenderMode.VTK_VOLUME_SLICE
  ) {
    const imageSlice = labelmapActor as vtkImageSlice;

    imageSlice.setForceTranslucent(true);
    imageSlice.setForceOpaque(false);
    imageSlice.getProperty().setUseLookupTableScalarRange(true);
  }

  if (renderOutline) {
    // @ts-ignore - fix type in vtk
    labelmapActor.getProperty().setUseLabelOutline(renderOutline);
    // @ts-ignore - fix type in vtk
    labelmapActor.getProperty().setLabelOutlineOpacity(outlineOpacity);

    const activeSegmentIndex = getActiveSegmentIndex(
      segmentationRepresentation.segmentationId
    );
    const outlineWidths = new Array(numColors - 1).fill(0);

    labelValueEntries.forEach(({ labelValue, segmentIndex }) => {
      const isHidden = segmentsHidden.has(segmentIndex);
      if (isHidden) {
        return;
      }

      outlineWidths[labelValue - 1] =
        segmentIndex === activeSegmentIndex
          ? outlineWidth + activeSegmentOutlineWidthDelta
          : outlineWidth;
    });

    labelmapActor.getProperty().setLabelOutlineThickness(outlineWidths);
    labelmapActor.modified();
    labelmapActor.getProperty().modified();
    labelmapMapper?.modified?.();
  } else {
    labelmapActor
      .getProperty()
      .setLabelOutlineThickness(new Array(numColors - 1).fill(0));
  }

  const visible = isActiveLabelmap || renderInactiveSegmentations;
  labelmapActor.setVisibility(visible);
  labelmapActor.modified();
  labelmapActor.getProperty().modified();
  labelmapMapper?.modified?.();
}

function getLabelmapConfig(
  labelmapConfig: LabelmapStyle,
  isActiveLabelmap: boolean,
  segmentsLabelmapConfig?: LabelmapStyle
) {
  const segmentLabelmapConfig = segmentsLabelmapConfig || {};

  const configToUse = {
    ...labelmapConfig,
    ...segmentLabelmapConfig,
  };

  return {
    fillAlpha: isActiveLabelmap
      ? configToUse.fillAlpha
      : configToUse.fillAlphaInactive,
    outlineWidth: isActiveLabelmap
      ? configToUse.outlineWidth
      : configToUse.outlineWidthInactive,
    renderFill: isActiveLabelmap
      ? configToUse.renderFill
      : configToUse.renderFillInactive,
    renderOutline: isActiveLabelmap
      ? configToUse.renderOutline
      : configToUse.renderOutlineInactive,
    outlineOpacity: isActiveLabelmap
      ? configToUse.outlineOpacity
      : configToUse.outlineOpacityInactive,
    activeSegmentOutlineWidthDelta: configToUse.activeSegmentOutlineWidthDelta,
  };
}

export { MAX_NUMBER_COLORS, setLabelmapColorAndOpacity };
