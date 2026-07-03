# Cornerstone AI Client Package

This package provides AI interfaces for use with Cornerstone in client-side applications. It is designed to support the use of ONNX models, ensuring a clean separation between server-side AI processing and client-specific functionalities tied to Cornerstone.

## Key Features

- **ONNX Runtime Web Integration**: The package leverages the ONNX Runtime Web library, enabling AI models to run directly in the browser without relying on server-side execution.
- **Initial Model - Segment Anything Model (SAM)**: Our first supported model is the Segment Anything Model (SAM) https://segment-anything.com/, designed for segmentation tasks. The default preset is **MobileSAM** (Apache 2.0), a faster SAM v1-compatible variant with a TinyViT encoder (~45 MB total download).

## Getting Started

### WASM Files

The ONNX Runtime Web requires WASM files to run in the browser. These files need to be copied to your application's public directory. The files should be placed in an `/ort/` directory in your public folder.

In Webpack you can add the WASM files to the public folder like this:

```js
new CopyPlugin({
  patterns: [
    {
      from: '../../../node_modules/onnxruntime-web/dist',
      to: '${destPath.replace(/\\/g, '/')}/ort',
    },
  ],
}),
```

This will copy all the necessary WASM files from the ONNX Runtime Web package to your application's public directory. Make sure your build system is configured to handle WASM files and that the `asyncWebAssembly` experiment is enabled in your build configuration.

### Running the Example

To see the package in action with the Segment Anything Model, use the following command:

```bash
yarn run example segmentAnythingClientSide
```

This will load the SAM model in the browser and allow you to perform segmentation tasks on images.

### Model Files

The package does not include model binaries due to their size and to give users the flexibility to use their own models. You can download pre-trained model binaries from the following links:

Base model (vit_b) - 178 MB compressed

- https://ohif-assets-new.s3.us-east-1.amazonaws.com/SAM/sam_b.zip

Large model (vit_l) - 1.16 GB compressed

- https://ohif-assets-new.s3.us-east-1.amazonaws.com/SAM/sam_l.zip

Huge model (vit_h) - 2.38 GB compressed

- https://ohif-assets-new.s3.us-east-1.amazonaws.com/SAM/sam_h.zip

For the examples we fetch model ONNX files from the web. The default preset is MobileSAM; SAM ViT-B remains available as `sam_b`.

#### URL to the model files

```js
import {
  DEFAULT_SAM_MODEL_NAME,
  modelsFromPresets,
  ONNXSegmentationController,
} from '@cornerstonejs/ai';

const ai = new ONNXSegmentationController({
  listeners: [mlLogger],
  models: modelsFromPresets(['mobile_sam', 'sam_b', 'sam_b_quant']),
  modelName: DEFAULT_SAM_MODEL_NAME,
});
```

To use full SAM ViT-B FP16 instead, set `modelName: 'sam_b'`.

For ViT-B quality with a smaller download (~72 MB zip), use `modelName: 'sam_b_quant'`.

### Model presets and preprocessing

Built-in presets live in `src/samModelPresets.ts`. Each encoder entry can set:

- `feedType` — how `ONNXSegmentationController` builds the encoder tensor (`input_image` for NCHW 0–1, `input_image_hwc` for raw RGB 0–255 HWC).
- `encoderWidth` / `encoderHeight` — render/encode canvas size (MobileSAM uses 1024×682 per the vietanhdev export config, not 1024×1024).

| Preset | Encoder | Decoder | Notes |
|--------|---------|---------|-------|
| `mobile_sam` | `mobile_sam.encoder.onnx` (vietanhdev zip) | `sam_vit_h_4b8939.decoder.onnx` (same zip) | Fast TinyViT encoder; preprocessing baked into ONNX |
| `sam_b_quant` | `sam_vit_b_01ec64.encoder.quant.onnx` (vietanhdev zip) | `sam_vit_b_01ec64.decoder.quant.onnx` (same zip) | ViT-B quantized; HWC 1024×682 like MobileSAM |
| `sam_b` | schmuell ViT-B FP16 encoder | schmuell ViT-B decoder | Highest quality; expects pre-normalized NCHW input |

When adding a new SAM v1 ONNX pair:

1. Inspect encoder inputs (rank, layout, dynamic dims) with ONNX Runtime or Netron.
2. Pair encoder and decoder from the **same** publisher/export.
3. Set `feedType`, canvas dimensions, and encoding cache key if needed.
4. Pass `[height, width]` as `orig_im_size` to the decoder (see `feedForSam`).

See also the root [SAM / ONNX model notes](../../README.md#sam--onnx-model-notes-cornerstonejsai).

#### Models in binary

You can download the model files and use them offline by moving them to the public folder.

In Webpack you can add the model files to the public folder like this

```js
new CopyPlugin({
  patterns: [
    {
      from:
        '../../../externals/sam_l',
      to: '${destPath.replace(/\\/g, '/')}/sam_l',
    },
    {
      from:
        '../../../externals/sam_h',
      to: '${destPath.replace(/\\/g, '/')}/sam_h',
    },
  ],
}),
```

, other build systems might have a different way to do this.
