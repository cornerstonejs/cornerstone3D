---
id: nifti-volume-loader
title: '@cornerstonejs/nifti-volume-loader'
---


import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';



# `@cornerstonejs/nifti-image-volume-loader`

After migrating to the new pixel data model for volumes, we have also updated the Nifti image volume loader to align with this model.

This change brings the loader more in line with the Cornerstone3D API and the rest of the library. We now have a dedicated Nifti image loader (not a volume loader) for loading Nifti files, creating a more consistent API across all image loaders in the library.

A significant improvement is the ability to use stack viewports for Nifti files. You no longer need volume viewports to render Nifti files (though you can still use volume viewports).

<details>
<summary>Why?</summary>

The process now involves calling the Nifti URL and parsing the first bytes of the file (via stream decoding) to obtain metadata. We then create imageIds based on this metadata and use them to create the volume.

This approach shifts from our previous volume-first method to an imageId-first approach, aligning with the rest of the Cornerstone3D API.

</details>

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
const niftiURL =
  'https://ohif-assets.s3.us-east-2.amazonaws.com/nifti/MRHead.nii.gz';
const volumeId = 'nifti:' + niftiURL;

const volume = await volumeLoader.createAndCacheVolume(volumeId);

setVolumesForViewports(
  renderingEngine,
  [{ volumeId }],
  viewportInputArray.map((v) => v.viewportId)
);
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
import {
  cornerstoneNiftiImageLoader,
  createNiftiImageIdsAndCacheMetadata,
} from '@cornerstonejs/nifti-volume-loader';

const niftiURL =
  'https://ohif-assets.s3.us-east-2.amazonaws.com/nifti/CTACardio.nii.gz';

// register the image loader for nifti files
imageLoader.registerImageLoader('nifti', cornerstoneNiftiImageLoader);

// similar to the rest of the cornerstone3D image loader
const imageIds = await createNiftiImageIdsAndCacheMetadata({ url: niftiURL });

// For stack viewports
viewport.setStack(imageIds);

// for volume viewports
const volume = await volumeLoader.createAndCacheVolume(volumeId, {
  imageIds,
});

await volume.load();
setVolumesForViewports(
  renderingEngine,
  [{ volumeId }],
  viewportInputArray.map((v) => v.viewportId)
);
```

  </TabItem>
</Tabs>

---
