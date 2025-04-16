import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import {
  LabelmapBaseTool,
  ToolGroupManager,
  Enums,
  annotation,
  ProbeTool,
  RectangleROITool,
  addTool,
} from '@cornerstonejs/tools';
import ONNXSegmentationController from './ONNXSegmentationController';

/**
 * Represents a tool used for segment selection and AI-assisted segmentation.
 * Integrates with ONNX models for automated segmentation tasks.
 */
class MarkerLabelmapTool extends LabelmapBaseTool {
  static toolName = 'MarkerLabelmap';
  private segmentAI: ONNXSegmentationController;
  private _initialized = false;
  private _modelInitialized = false;
  private _toolsAdded = false;

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        sourceViewportId: '',
        modelName: 'sam_b',
        enabled: false,
        models: {
          sam_b: [
            {
              name: 'sam-b-encoder',
              url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b_01ec64.encoder-fp16.onnx',
              size: 180,
              key: 'encoder',
            },
            {
              name: 'sam-b-decoder',
              url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b_01ec64.decoder.onnx',
              size: 17,
              key: 'decoder',
            },
          ],
        },
        numRandomPoints: 5,
        searchBreadth: 10,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _init = async () => {
    const { configuration } = this;

    if (!configuration.enabled || !configuration.sourceViewportId) {
      return;
    }

    // Create the controller only once
    if (!this.segmentAI) {
      this.segmentAI = new ONNXSegmentationController({
        models: configuration.models,
        modelName: configuration.modelName,
      });
    }

    // Set up the tool instances if not already done
    if (!this._toolsAdded) {
      this._addToolInstances();
    }

    // Enable the controller
    this.segmentAI.enabled = true;

    // Initialize model only once
    if (!this._modelInitialized) {
      await this.segmentAI.initModel();
      this._modelInitialized = true;
    }

    // Set up viewport
    const { sourceViewportId } = this.configuration;
    const enabledElement = getEnabledElementByViewportId(sourceViewportId);

    if (!enabledElement) {
      console.debug(
        'No enabled element found for viewportId:',
        sourceViewportId
      );
      return;
    }

    const { viewport } = enabledElement;
    this.segmentAI.initViewport(viewport);

    this._initialized = true;
  };

  _getToolGroupId = () => {
    return ToolGroupManager.getToolGroupForViewport(
      this.configuration.sourceViewportId
    );
  };

  _addToolInstances = () => {
    // Get tool group
    const toolGroup = this._getToolGroupId();
    if (!toolGroup) {
      console.debug(`Tool group not found`);
      return;
    }

    // Add marker tools

    addTool(ProbeTool);
    const MarkerIncludeToolName = ONNXSegmentationController.MarkerInclude;
    const MarkerExcludeToolName = ONNXSegmentationController.MarkerExclude;
    const BoxPromptToolName = ONNXSegmentationController.BoxPrompt;

    // MarkerInclude - a probe variant with primary mouse button
    toolGroup.addToolInstance(MarkerIncludeToolName, ProbeTool.toolName, {
      getTextLines: () => null,
    });
    // toolGroup.setToolActive(MarkerIncludeToolName, {
    //   bindings: [
    //     { mouseButton: MouseBindings.Primary },
    //     {
    //       mouseButton: MouseBindings.Primary,
    //       modifierKey: KeyboardBindings.Shift,
    //     },
    //   ],
    // });

    // MarkerExclude - a probe variant with Ctrl+click
    toolGroup.addToolInstance(MarkerExcludeToolName, ProbeTool.toolName, {
      getTextLines: () => null,
    });
    // toolGroup.setToolActive(MarkerExcludeToolName, {
    //   bindings: [
    //     {
    //       mouseButton: MouseBindings.Primary,
    //       modifierKey: KeyboardBindings.Ctrl,
    //     },
    //   ],
    // });

    // Set tool colors for marker tools
    annotation.config.style.setToolGroupToolStyles(toolGroup.id, {
      [MarkerIncludeToolName]: {
        color: 'rgb(0, 255, 0)', // Green
        colorHighlighted: 'rgb(0, 255, 0)',
        colorSelected: 'rgb(0, 255, 0)',
      },
      [MarkerExcludeToolName]: {
        color: 'rgb(255, 0, 0)', // Red
        colorHighlighted: 'rgb(255, 0, 0)',
        colorSelected: 'rgb(255, 0, 0)',
      },
    });

    // BoxPrompt - a rectangle ROI variant
    // toolGroup.addToolInstance(BoxPromptToolName, RectangleROITool.toolName, {
    //   getTextLines: () => null,
    // });
    // toolGroup.setToolActive(BoxPromptToolName, {
    //   bindings: [{ mouseButton: MouseBindings.Primary }],
    // });

    this._toolsAdded = true;
  };

  onSetToolConfiguration = (): void => {
    this._init();
  };

  onSetToolEnabled = async (): Promise<void> => {
    this.configuration.enabled = true;
    if (this.segmentAI) {
      this.segmentAI.enabled = true;
    }
    if (!this._initialized) {
      await this._init();
    }
  };

  onSetToolActive = (): void => {
    this.configuration.enabled = true;
    if (this.segmentAI) {
      this.segmentAI.enabled = true;
    }
    if (!this._initialized) {
      this._init();
    }
  };

  interpolateScroll = (): void => {
    this.segmentAI.interpolateScroll();
  };

  onSetToolDisabled = (): void => {
    this.configuration.enabled = false;
    if (this.segmentAI) {
      this.segmentAI.enabled = false;
    }
  };

  /**
   * Clear all segmentations in the current viewport
   */
  clearMarkers = (): void => {
    if (!this.segmentAI) {
      return;
    }

    const { sourceViewportId } = this.configuration;
    const enabledElement = getEnabledElementByViewportId(sourceViewportId);

    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;
    this.segmentAI.clear(viewport);
    viewport.render();
  };

  /**
   * Remove prompt annotations without clearing segmentations
   */
  removePromptAnnotations = (): void => {
    if (!this.segmentAI) {
      return;
    }

    const { viewportId } = this.configuration;
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    this.segmentAI.removePromptAnnotationsWithCache(enabledElement.viewport);
  };

  /**
   * Accept the current segmentation preview
   */
  acceptPreview = (): void => {
    if (!this.segmentAI) {
      return;
    }

    const { sourceViewportId } = this.configuration;
    const enabledElement = getEnabledElementByViewportId(sourceViewportId);

    if (!enabledElement) {
      return;
    }

    this.segmentAI.acceptPreview(enabledElement.viewport.element);
  };

  /**
   * Reject the current segmentation preview
   */
  rejectPreview = (): void => {
    if (!this.segmentAI) {
      return;
    }

    const { sourceViewportId } = this.configuration;
    const enabledElement = getEnabledElementByViewportId(sourceViewportId);

    if (!enabledElement) {
      return;
    }

    this.segmentAI.rejectPreview(enabledElement.viewport.element);
  };
}

export default MarkerLabelmapTool;
