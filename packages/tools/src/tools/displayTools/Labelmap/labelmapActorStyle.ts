import type { Types } from '@cornerstonejs/core';
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
import type { LabelmapRepresentation } from '../../../types/SegmentationStateTypes';
import { getLabelmapForActorReference } from './volumeLabelmapImageMapper';

type LabelmapTransferFunctions = {
  cfun: vtkColorTransferFunction;
  ofun: vtkPiecewiseFunction;
};

// Each labelmap actor needs its own cfun/ofun because overlap mode can produce
// multiple actors per representation (one per labelmap layer), and each layer
// has its own labelValue -> segmentIndex mapping. Sharing a single pair via
// representation.config caused the second actor's rebuild to overwrite the
// first actor's color table, since both actors held the same reference. We
// still mutate in place to avoid resetting cached vtkVolumeProperty state.
const actorTransferFunctions = new WeakMap<
  vtkVolume | vtkImageSlice,
  LabelmapTransferFunctions
>();

// Signature of the last style applied to each actor. setLabelmapColorAndOpacity
// runs on every segmentation render (e.g. every scroll), but the labelmap
// transfer functions only change when colors, per-segment style, segment
// visibility, outline config, or active/visibility state change. Caching the
// applied signature lets us skip the expensive vtk transfer-function rebuild
// and actor/mapper invalidation when nothing relevant changed.
const lastAppliedLabelmapStyle = new WeakMap<
  vtkVolume | vtkImageSlice,
  string
>();

const MAX_NUMBER_COLORS = 255;

function setLabelmapColorAndOpacity(
  viewportId: string,
  labelmapActorEntry: Types.ActorEntry,
  segmentationRepresentation: LabelmapRepresentation
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

  const labelmapActor = labelmapActorEntry.actor as vtkVolume | vtkImageSlice;

  // sharpness=1.0 gives sharp/step-like transitions between adjacent label
  // values; sharpness=0 would interpolate opacities between labels, which for
  // a discrete labelmap means the volume raycaster gets reduced effective
  // opacity at sub-voxel sample positions (visible as faint segmentations).
  const colorNodes = [
    { x: 0, r: 0, g: 0, b: 0, midpoint: 0.5, sharpness: 1.0 },
  ];
  const opacityNodes = [{ x: 0, y: 0, midpoint: 0.5, sharpness: 1.0 }];

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
      sharpness: 1.0,
    });

    if (renderFill) {
      const segmentOpacity = segmentsHidden.has(segmentIndex)
        ? 0
        : (segmentColor[3] / 255) * fillAlpha;

      opacityNodes.push({
        x: labelValue,
        y: segmentOpacity,
        midpoint: 0.5,
        sharpness: 1.0,
      });
    } else {
      opacityNodes.push({
        x: labelValue,
        y: 0.01,
        midpoint: 0.5,
        sharpness: 1.0,
      });
    }
  });

  const activeSegmentIndex = getActiveSegmentIndex(
    segmentationRepresentation.segmentationId
  );

  const outlineWidths = new Array(numColors - 1).fill(0);

  if (renderOutline) {
    labelValueEntries.forEach(({ labelValue, segmentIndex }) => {
      if (segmentsHidden.has(segmentIndex)) {
        return;
      }

      outlineWidths[labelValue - 1] =
        segmentIndex === activeSegmentIndex
          ? outlineWidth + activeSegmentOutlineWidthDelta
          : outlineWidth;
    });
  }

  const visible = isActiveLabelmap || renderInactiveSegmentations;

  // Any vtk image-slice based labelmap actor needs the translucent/LUT-range
  // slice properties — detect by actor class rather than enumerating render
  // modes so extension backends (e.g. the webgpu image mode) are covered.
  const useImageSliceProperties =
    (labelmapActor as { isA?: (className: string) => boolean }).isA?.(
      'vtkImageSlice'
    ) === true;

  // @ts-ignore - fix type in vtk
  const { preLoad } = labelmapActor.get?.('preLoad') || { preLoad: null };

  // The signature captures everything that is applied to the actor below, so an
  // identical signature means re-applying would be a no-op. preLoad consumers
  // run a custom apply path with effects we cannot observe here, so they always
  // rebuild.
  const styleSignature = JSON.stringify({
    colorNodes,
    opacityNodes,
    renderOutline,
    outlineOpacity,
    outlineWidths,
    visible,
    useImageSliceProperties,
  });
  const canUseStyleCache = !preLoad;

  if (
    canUseStyleCache &&
    lastAppliedLabelmapStyle.get(labelmapActor) === styleSignature
  ) {
    return;
  }

  const { cfun, ofun } = getOrCreateTransferFunctions(labelmapActor);
  cfun.removeAllPoints();
  ofun.removeAllPoints();

  cfun.setNodes(colorNodes);
  ofun.setNodes(opacityNodes);

  ofun.setClamping(false);
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

  if (preLoad) {
    preLoad({ cfun, ofun, actor: labelmapActor });
  } else {
    labelmapActor.getProperty().setRGBTransferFunction(0, cfun);
    labelmapActor.getProperty().setScalarOpacity(0, ofun);
    labelmapActor.getProperty().setInterpolationTypeToNearest();
  }

  if (useImageSliceProperties) {
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
    labelmapActor.getProperty().setLabelOutlineThickness(outlineWidths);
    labelmapActor.modified();
    labelmapActor.getProperty().modified();
    labelmapMapper?.modified?.();
  } else {
    labelmapActor.getProperty().setLabelOutlineThickness(outlineWidths);
  }

  labelmapActor.setVisibility(visible);
  labelmapActor.modified();
  labelmapActor.getProperty().modified();
  labelmapMapper?.modified?.();

  if (canUseStyleCache) {
    lastAppliedLabelmapStyle.set(labelmapActor, styleSignature);
  } else {
    lastAppliedLabelmapStyle.delete(labelmapActor);
  }
}

function getOrCreateTransferFunctions(
  actor: vtkVolume | vtkImageSlice
): LabelmapTransferFunctions {
  const existing = actorTransferFunctions.get(actor);
  if (existing) {
    return existing;
  }

  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0, 0);
  const created = { cfun, ofun };

  actorTransferFunctions.set(actor, created);
  return created;
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
