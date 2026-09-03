import { ToolGroupManager, annotation } from '@cornerstonejs/tools';
import addDropdownToToolbar from './addDropdownToToolbar';

interface AddUShapeModeDropdownToToolbarOptions {
  toolGroupId: string;
  toolNames: string[];
  renderingEngineId: string;
  viewportIds: string[];
  getRenderingEngine: (id: string) => { renderViewports: (ids: string[]) => void };
}

/**
 * Adds a U-Shape Mode dropdown to the toolbar for tools that support open contours
 * (e.g. PlanarFreehandROITool). For tools that don't support open contours, the
 * configuration is applied but has no visible effect.
 */
export default function addUShapeModeDropdownToToolbar(
  options: AddUShapeModeDropdownToToolbarOptions
): void {
  const {
    toolGroupId,
    toolNames,
    renderingEngineId,
    viewportIds,
    getRenderingEngine,
  } = options;

  const defaultFrameOfReferenceSpecificAnnotationManager =
    annotation.state.getAnnotationManager();
  const { selection } = annotation;

  addDropdownToToolbar({
    labelText: 'U-Shape Mode',
    options: {
      values: ['none', 'farthestT', 'orthogonalT', 'lineSegment'],
      defaultValue: 'none',
    },
    onSelectedValueChange: (value) => {
      let mode: boolean | string = false;

      if (value === 'farthestT') {
        mode = true;
      } else if (value !== 'none') {
        mode = value as string;
      }

      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      if (toolGroup) {
        for (const toolName of toolNames) {
          toolGroup.setToolConfiguration(toolName, {
            openUShapeContour: mode,
          });
        }
      }

      // Also apply to currently selected annotation (PlanarFreehandROI specific)
      const annotationUIDs = selection.getAnnotationsSelected();

      if (annotationUIDs && annotationUIDs.length) {
        const annotationUID = annotationUIDs[0];
        const ann =
          defaultFrameOfReferenceSpecificAnnotationManager.getAnnotation(
            annotationUID
          );

        if (ann?.data && 'openUShapeContourVectorToPeak' in ann.data) {
          ann.data.openUShapeContourVectorToPeak = null;
          (ann.data as { isOpenUShapeContour?: boolean | string }).isOpenUShapeContour =
            mode;

          const renderingEngine = getRenderingEngine(renderingEngineId);
          if (renderingEngine) {
            renderingEngine.renderViewports(viewportIds);
          }
        }
      }
    },
  });
}
