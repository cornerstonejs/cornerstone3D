---
id: intro
---

# Introduction

The purpose of this introduction is to give a proper overview of the components that tutorials _rely on_ in order to work properly.
Tutorials are learning-oriented and is a great place for you to start trying out various features of our libraries, and we don't want you to
get distracted or confused by the implementation details; therefore, we have isolated the learning part of the tutorials (without all the other necessary implementation details) so that you can focus on learning.

:::note Info
Tutorials are wholly learning-oriented, and specifically, they are oriented towards _learning how_ rather than _learning that_. ([Documentation Philosophy for Cornerstone3D](https://documentation.divio.com/))
:::

## Running a Tutorial Locally
We have included a `tutorial` example in the repo, which you can find at `packages/tools/examples/tutorial/index.ts`. This file contains all the necessary setup code (explained above) for running a tutorial locally. When you open the file, you will see a dedicated place for you to copy and paste and insert the code from the tutorial. So, this way, you don't have to worry about the setup code, and you can focus on the tutorial itself.

How to run it?

```bash
# from the root of the library
yarn install

# change folder to tools package
cd packages/tools

# run the tutorial example
yarn run example tutorial
```

Then open a new tab in your browser and navigate to `http://localhost:3000/`.

🎉 Happy Learning 🎉

## Curious Learner

For curious learners, here are some components that are used (behind the scene) for each tutorial.


### Image Loaders
`Cornerstone3D` does not deal with loading images. As we will learn later, `Cornerstone3D` also is capable of rendering `Volumes` in any orientation too.
Therefore, proper image and volume loaders should be registered with `Cornerstone3D` so that it can work as intended. Examples of such loaders are

- imageLoader: `cornerstoneWADOImageLoader`
- volumeLoader: `cornerstoneStreamingImageVolumeLoader`

### Metadata Providers
In order for `Cornerstone3D` to properly show the properties of an image such
as voi, suv values, etc., it needs metadata (in addition to the image data itself).
Therefore, proper metadata providers should be registered with `Cornerstone3D` so that it can work as intended. Examples of such providers are



### Library Initialization
Both `Cornerstone3D` and `Cornerstone3DTools` need to be initialized by calling `.init()` methods.
