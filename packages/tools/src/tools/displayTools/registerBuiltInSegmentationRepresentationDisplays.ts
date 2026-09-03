import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import {
  registerSegmentationRepresentationDisplay,
  type SegmentationRepresentationDisplay,
} from '../../stateManagement/segmentation/SegmentationRepresentationDisplayRegistry';
import contourDisplay from './Contour/contourDisplay';
import labelmapDisplay from './Labelmap/labelmapDisplay';
import surfaceDisplay from './Surface/surfaceDisplay';

let builtInDisplaysRegistered = false;

export function registerBuiltInSegmentationRepresentationDisplays(): void {
  if (builtInDisplaysRegistered) {
    return;
  }

  registerSegmentationRepresentationDisplay(
    SegmentationRepresentations.Labelmap,
    labelmapDisplay as SegmentationRepresentationDisplay
  );
  registerSegmentationRepresentationDisplay(
    SegmentationRepresentations.Contour,
    contourDisplay as SegmentationRepresentationDisplay
  );
  registerSegmentationRepresentationDisplay(
    SegmentationRepresentations.Surface,
    surfaceDisplay as SegmentationRepresentationDisplay
  );

  builtInDisplaysRegistered = true;
}

registerBuiltInSegmentationRepresentationDisplays();
