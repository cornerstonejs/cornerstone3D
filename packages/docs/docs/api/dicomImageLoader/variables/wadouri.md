# Variable: wadouri

> **wadouri**: `object`

## Type declaration

### dataSetCacheManager

> **dataSetCacheManager**: `object`

### dataSetCacheManager.get()

> **get**: (`uri`) => `DataSet`

#### Parameters

• **uri**: `string`

#### Returns

`DataSet`

### dataSetCacheManager.getInfo()

> **getInfo**: () => `CornerstoneWadoLoaderCacheManagerInfoResponse`

#### Returns

`CornerstoneWadoLoaderCacheManagerInfoResponse`

### dataSetCacheManager.isLoaded()

> **isLoaded**: (`uri`) => `boolean`

#### Parameters

• **uri**: `string`

#### Returns

`boolean`

### dataSetCacheManager.load()

> **load**: (`uri`, `loadRequest`, `imageId`) => `CornerstoneWadoLoaderCachedPromise`

#### Parameters

• **uri**: `string`

• **loadRequest**: [`LoadRequestFunction`](../namespaces/Types/type-aliases/LoadRequestFunction.md) = `...`

• **imageId**: `string`

#### Returns

`CornerstoneWadoLoaderCachedPromise`

### dataSetCacheManager.purge()

> **purge**: () => `void`

#### Returns

`void`

### dataSetCacheManager.unload()

> **unload**: (`uri`) => `void`

#### Parameters

• **uri**: `string`

#### Returns

`void`

### dataSetCacheManager.update()

> **update**: (`uri`, `dataSet`) => `void`

#### Parameters

• **uri**: `string`

• **dataSet**: `DataSet`

#### Returns

`void`

### fileManager

> **fileManager**: `object`

### fileManager.add()

> **add**: (`file`) => `string`

#### Parameters

• **file**: `Blob`

#### Returns

`string`

### fileManager.get()

> **get**: (`index`) => `Blob`

#### Parameters

• **index**: `number`

#### Returns

`Blob`

### fileManager.purge()

> **purge**: () => `void`

#### Returns

`void`

### fileManager.remove()

> **remove**: (`index`) => `void`

#### Parameters

• **index**: `number`

#### Returns

`void`

### getEncapsulatedImageFrame()

> **getEncapsulatedImageFrame**: (`dataSet`, `frameIndex`) => `ByteArray`

#### Parameters

• **dataSet**: `DataSet`

• **frameIndex**: `number`

#### Returns

`ByteArray`

### getLoaderForScheme()

> **getLoaderForScheme**: (`scheme`) => [`LoadRequestFunction`](../namespaces/Types/type-aliases/LoadRequestFunction.md)

#### Parameters

• **scheme**: `string`

#### Returns

[`LoadRequestFunction`](../namespaces/Types/type-aliases/LoadRequestFunction.md)

### getPixelData()

> **getPixelData**: (`dataSet`, `frameIndex`) => `ByteArray`

#### Parameters

• **dataSet**: `DataSet`

• **frameIndex**: `number` = `0`

#### Returns

`ByteArray`

### getUncompressedImageFrame()

> **getUncompressedImageFrame**: (`dataSet`, `frameIndex`) => `Uint8Array`

Function to deal with extracting an image frame from an encapsulated data set.

#### Parameters

• **dataSet**: `DataSet`

• **frameIndex**: `number`

#### Returns

`Uint8Array`

### loadFileRequest()

> **loadFileRequest**: (`uri`) => `Promise`\<`ArrayBuffer`\>

#### Parameters

• **uri**: `string`

#### Returns

`Promise`\<`ArrayBuffer`\>

### loadImage()

> **loadImage**: (`imageId`, `options`) => `Types.IImageLoadObject`

#### Parameters

• **imageId**: `string`

• **options**: [`DICOMLoaderImageOptions`](../namespaces/Types/interfaces/DICOMLoaderImageOptions.md) = `{}`

#### Returns

`Types.IImageLoadObject`

### loadImageFromPromise()

> **loadImageFromPromise**: (`dataSetPromise`, `imageId`, `frame`, `sharedCacheKey`, `options`, `callbacks`?) => `Types.IImageLoadObject`

Given the dataSetPromise and imageId this will return a promise to be
resolved with an image object containing the loaded image.

#### Parameters

• **dataSetPromise**: `Promise`\<`DataSet`\>

A promise that resolves to a DataSet object.

• **imageId**: `string`

The imageId of the image to be loaded.

• **frame**: `number` = `0`

The frame number to be loaded in case of multiframe. it should
be noted that this is used to extract the pixelData from dicomParser and
dicomParser is 0-based index (the first pixelData is frame 0); however,
in metadata and imageId frame is 1-based index (the first frame is frame 1).

• **sharedCacheKey**: `string`

A key to be used to cache the loaded image.

• **options**: [`DICOMLoaderImageOptions`](../namespaces/Types/interfaces/DICOMLoaderImageOptions.md)

Options to be used when loading the image.

• **callbacks?**

Callbacks to be called when the image is loaded.

• **callbacks.imageDoneCallback?**

#### Returns

`Types.IImageLoadObject`

An object containing a promise to be resolved with the loaded image

### metaData

> **metaData**: `object`

### metaData.getImagePixelModule()

> **getImagePixelModule**: (`dataSet`) => `Types.ImagePixelModuleMetadata`

#### Parameters

• **dataSet**: `DataSet`

#### Returns

`Types.ImagePixelModuleMetadata`

### metaData.getLUTs()

> **getLUTs**: (`pixelRepresentation`, `lutSequence`) => [`LutType`](../namespaces/Types/interfaces/LutType.md)[]

#### Parameters

• **pixelRepresentation**: `number`

• **lutSequence**: `Element`

#### Returns

[`LutType`](../namespaces/Types/interfaces/LutType.md)[]

### metaData.getModalityLUTOutputPixelRepresentation()

> **getModalityLUTOutputPixelRepresentation**: (`dataSet`) => `number`

#### Parameters

• **dataSet**: `DataSet`

#### Returns

`number`

### metaData.getNumberValues()

> **getNumberValues**: (`dataSet`, `tag`, `minimumLength`) => `number`[]

#### Parameters

• **dataSet**: `DataSet`

• **tag**: `string`

• **minimumLength**: `number`

#### Returns

`number`[]

### metaData.metadataForDataset()

> **metadataForDataset**: (`type`, `imageId`, `dataSet`) => `any`

#### Parameters

• **type**: `any`

• **imageId**: `any`

• **dataSet**: `DataSet`

#### Returns

`any`

### metaData.metaDataProvider()

> **metaDataProvider**: (`type`, `imageId`) => `any`

#### Parameters

• **type**: `any`

• **imageId**: `any`

#### Returns

`any`

### parseImageId()

> **parseImageId**: (`imageId`) => `CornerstoneImageUrl`

#### Parameters

• **imageId**: `string`

#### Returns

`CornerstoneImageUrl`

### register()

> **register**: () => `void`

#### Returns

`void`

### unpackBinaryFrame()

> **unpackBinaryFrame**: (`byteArray`, `frameOffset`, `pixelsPerFrame`) => `Uint8Array`

Function to deal with unpacking a binary frame

#### Parameters

• **byteArray**: `ByteArray`

• **frameOffset**: `number`

• **pixelsPerFrame**: `number`

#### Returns

`Uint8Array`

## Defined in

[packages/dicomImageLoader/src/imageLoader/wadouri/index.ts:34](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/imageLoader/wadouri/index.ts#L34)
