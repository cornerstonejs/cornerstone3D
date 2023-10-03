import BaseTool from './base/BaseTool';
import { EventTypes, PublicToolProps, ToolProps } from '../types';
import * as ToolGroupManager from '../store/ToolGroupManager';
import { annotation } from '../index';
import { state } from '../stateManagement/annotation';

class EraserTool extends BaseTool {
  static toolName;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);
  }
  preMouseDownCallback = (evt: EventTypes.InteractionEventType): boolean => {
    return this._deleteNearbyAnnotations(evt, 'mouse');
  };
  preTouchStartCallback = (evt: EventTypes.InteractionEventType): boolean => {
    return this._deleteNearbyAnnotations(evt, 'touch');
  };

  _deleteNearbyAnnotations(
    evt: EventTypes.InteractionEventType,
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

      if (typeof toolInstance.isPointNearTool !== 'function') {
        continue;
      }

      const annotations = state.getAnnotations(toolName, viewportId);

      for (const annotation of annotations) {
        if (
          toolInstance.isPointNearTool(
            element,
            annotation,
            currentPoints.canvas,
            6,
            interactionType
          )
        ) {
          annotationsToRemove.push(annotation.annotationUID);
        }
      }
    }

    for (const annotationUID of annotationsToRemove) {
      annotation.state.removeAnnotation(annotationUID);
    }

    evt.preventDefault();

    return true;
  }
}

EraserTool.toolName = 'Eraser';
export default EraserTool;
