import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { LabelmapBaseTool } from '@cornerstonejs/tools';
import ONNXSegmentationController from './ONNXSegmentationController';

/**
 * Represents a tool used for segment selection and AI-assisted segmentation.
 * Integrates with ONNX models for automated segmentation tasks.
 */
class LabelmapSlicePropagationTool extends LabelmapBaseTool {
  static toolName = 'LabelmapSlicePropagation';
  private segmentAI: ONNXSegmentationController;
  private _initialized = false;
  private _modelInitialized = false;

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        sourceViewportId: '',
        autoSegmentMode: true,
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
        autoSegmentMode: configuration.autoSegmentMode,
        models: configuration.models,
        modelName: configuration.modelName,
        numRandomPoints: configuration.numRandomPoints,
        searchBreadth: configuration.searchBreadth,
      });
    }

    // Enable the controller
    this.segmentAI.enabled = true;

    // Initialize the model only once
    if (!this._modelInitialized) {
      await this.segmentAI.initModel();
      this._modelInitialized = true;
    }

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

  onSetToolConfiguration = (): void => {
    this._init();
  };

  onSetToolEnabled = async (): Promise<void> => {
    this.configuration.enabled = true;
    // Just enable the existing controller without reloading the model
    if (this.segmentAI) {
      this.segmentAI.enabled = true;
    }
    this._init();
  };

  onSetToolDisabled = (): void => {
    this.configuration.enabled = false;
    if (this.segmentAI) {
      this.segmentAI.enabled = false;
    }
  };

  onSetToolPassive = (): void => {
    this.configuration.enabled = false;
    if (this.segmentAI) {
      this.segmentAI.enabled = false;
    }
  };

  /**
   * Accept the current segmentation preview
   */
  acceptPreview = (): void => {
    const { sourceViewportId } = this.configuration;
    const enabledElement = getEnabledElementByViewportId(sourceViewportId);

    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;

    this.segmentAI.tool.acceptPreview(viewport.element);
  };

  /**
   * Reject the current segmentation preview
   */
  rejectPreview = (): void => {
    const { sourceViewportId } = this.configuration;
    const enabledElement = getEnabledElementByViewportId(sourceViewportId);

    if (!enabledElement) {
      return;
    }

    this.segmentAI.rejectPreview(enabledElement.viewport.element);
  };
}

export default LabelmapSlicePropagationTool;
