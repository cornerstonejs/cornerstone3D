# Cornerstone AI Client Package

This package provides AI interfaces for use with Cornerstone in client-side applications. It is designed to support the use of ONNX models, ensuring a clean separation between server-side AI processing and client-specific functionalities tied to Cornerstone.

## Key Features

- **ONNX Runtime Web Integration**: The package leverages the ONNX Runtime Web library, enabling AI models to run directly in the browser without relying on server-side execution.
- **Initial Model - Segment Anything Model (SAM)**: Our first supported model is the Segment Anything Model (SAM) https://segment-anything.com/, designed for segmentation tasks.

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

For the examples we are using the model url and fetch it from the web. If you see in example code we have:

#### URL to the model files

```js
const models = {
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
};

const ai = new ONNXSegmentationController({
  listeners: [mlLogger],
  models,
  modelName: 'sam_b',
});
```

which gives the url to the model files.

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
