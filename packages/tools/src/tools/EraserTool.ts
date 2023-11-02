import {
  BaseTool,
  Types,
  ToolGroupManager,
  annotation,
} from '@cornerstonejs/tools';

class EraserTool extends BaseTool {
  static toolName;
  constructor(
    toolProps: Types.PublicToolProps = {},
    defaultToolProps: Types.ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);
  }
  preMouseDownCallback = (
    evt: Types.EventTypes.InteractionEventType
  ): boolean => {
    return this._deleteNearbyAnnotations(evt, 'mouse');
  };
  preTouchStartCallback = (
    evt: Types.EventTypes.InteractionEventType
  ): boolean => {
    return this._deleteNearbyAnnotations(evt, 'touch');
  };

  _deleteNearbyAnnotations(
    evt: Types.EventTypes.InteractionEventType,
    interactionType: string
  ): boolean {
    const { renderingEngineId, viewportId, element, currentPoints } =
      evt.detail;

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewportId,
      renderingEngineId
    );

    if (!toolGroup) {
      return false;
    }

    const tools = toolGroup._toolInstances;
    const annotationsToRemove = [];

    for (const toolName in tools) {
      const toolInstance = tools[toolName];

      if (
        typeof toolInstance.isPointNearTool !== 'function' ||
        typeof toolInstance.filterInteractableAnnotationsForElement !==
          'function'
      ) {
        continue;
      }

      const annotations = annotation.state.getAnnotations(toolName, element);

      if (!annotations) {
        continue;
      }

      const interactableAnnotations =
        toolInstance.filterInteractableAnnotationsForElement(
          element,
          annotations
        );

      for (const annotation of interactableAnnotations) {
        if (
          toolInstance.isPointNearTool(
            element,
            annotation,
            currentPoints.canvas,
            10,
            interactionType
          )
        ) {
          annotationsToRemove.push(annotation.annotationUID);
        }
      }
    }

    for (const annotationUID of annotationsToRemove) {
      annotation.selection.setAnnotationSelected(annotationUID);
      annotation.state.removeAnnotation(annotationUID);
    }

    evt.preventDefault();

    return true;
  }
}

EraserTool.toolName = 'Eraser';
export default EraserTool;
