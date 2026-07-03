import type { ModelType } from './ONNXSegmentationController';

const HF_SAM_ONNX =
  'https://huggingface.co/vietanhdev/segment-anything-onnx-models/resolve/main';

const SCHMUELL_SAM_B_FP16 =
  'https://huggingface.co/schmuell/sam-b-fp16/resolve/main';

export type SamModelPreset = {
  displayName: string;
  description: string;
  components: ModelType[];
};

/**
 * Built-in Segment Anything / MobileSAM model presets.
 *
 * MobileSAM uses the same SAM v1 prompt encoder and mask decoder pipeline with a
 * TinyViT image encoder (~45 MB total vs ~197 MB for ViT-B).
 *
 * @see https://github.com/ChaoningZhang/MobileSAM
 */
export const SAM_MODEL_PRESETS: Record<string, SamModelPreset> = {
  mobile_sam: {
    displayName: 'MobileSAM',
    description: 'Fast TinyViT encoder with SAM mask decoder (~45 MB)',
    components: [
      {
        name: 'mobile-sam-encoder',
        zipUrl: `${HF_SAM_ONNX}/mobile_sam_20230629.zip`,
        zipEntry: 'mobile_sam.encoder.onnx',
        size: 28,
        key: 'encoder',
        feedType: 'input_image_hwc',
        encoderWidth: 1024,
        encoderHeight: 682,
      },
      {
        name: 'mobile-sam-decoder',
        zipUrl: `${HF_SAM_ONNX}/mobile_sam_20230629.zip`,
        zipEntry: 'sam_vit_h_4b8939.decoder.onnx',
        size: 17,
        key: 'decoder',
      },
    ],
  },
  sam_b: {
    displayName: 'SAM ViT-B (FP16)',
    description: 'Balanced quality and speed (~197 MB)',
    components: [
      {
        name: 'sam-b-encoder',
        url: `${SCHMUELL_SAM_B_FP16}/sam_vit_b_01ec64.encoder-fp16.onnx`,
        size: 180,
        key: 'encoder',
        feedType: 'input_image',
      },
      {
        name: 'sam-b-decoder',
        url: `${SCHMUELL_SAM_B_FP16}/sam_vit_b_01ec64.decoder.onnx`,
        size: 17,
        key: 'decoder',
      },
    ],
  },
  sam_b_quant: {
    displayName: 'SAM ViT-B (quantized)',
    description:
      'ViT-B quality at ~72 MB zip; same HWC pipeline as MobileSAM (~112 MB on disk)',
    components: [
      {
        name: 'sam-b-quant-encoder',
        zipUrl: `${HF_SAM_ONNX}/sam_vit_b_01ec64_quant.zip`,
        zipEntry: 'sam_vit_b_01ec64.encoder.quant.onnx',
        size: 104,
        key: 'encoder',
        feedType: 'input_image_hwc',
        encoderWidth: 1024,
        encoderHeight: 682,
      },
      {
        name: 'sam-b-quant-decoder',
        zipUrl: `${HF_SAM_ONNX}/sam_vit_b_01ec64_quant.zip`,
        zipEntry: 'sam_vit_b_01ec64.decoder.quant.onnx',
        size: 9,
        key: 'decoder',
      },
    ],
  },
};

export const DEFAULT_SAM_MODEL_NAME = 'mobile_sam';

export function getSamModelComponents(
  modelName: keyof typeof SAM_MODEL_PRESETS | string
): ModelType[] | undefined {
  return SAM_MODEL_PRESETS[modelName]?.components;
}

export function getSamModelOptions() {
  return Object.entries(SAM_MODEL_PRESETS).map(([value, preset]) => ({
    value,
    label: preset.displayName,
  }));
}

export function modelsFromPresets(
  presetNames: Array<keyof typeof SAM_MODEL_PRESETS | string> = Object.keys(
    SAM_MODEL_PRESETS
  )
) {
  const models: Record<string, ModelType[]> = {};

  for (const name of presetNames) {
    const components = getSamModelComponents(name);

    if (components) {
      models[name] = components;
    }
  }

  return models;
}
