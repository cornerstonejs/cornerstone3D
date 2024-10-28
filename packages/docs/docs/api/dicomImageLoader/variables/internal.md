# Variable: internal

> `const` **internal**: `object`

## Type declaration

### getOptions()

> **getOptions**: () => [`LoaderOptions`](../namespaces/Types/interfaces/LoaderOptions.md)

#### Returns

[`LoaderOptions`](../namespaces/Types/interfaces/LoaderOptions.md)

### setOptions()

> **setOptions**: (`newOptions`) => `void`

#### Parameters

• **newOptions**: [`LoaderOptions`](../namespaces/Types/interfaces/LoaderOptions.md)

#### Returns

`void`

### streamRequest()

> **streamRequest**: (`url`, `imageId`, `defaultHeaders`, `options`) => `PromiseIterator`\<`unknown`\>

This function does a streaming parse from an http request, delivering
combined/subsequent parts of the result as iterations on a
ProgressiveIterator instance.

#### Parameters

• **url**: `string`

to request and parse as either multipart or singlepart.

• **imageId**: `string`

the imageId to be used in the returned detail object

• **defaultHeaders**: `Record`\<`string`, `string`\> = `{}`

• **options**: `CornerstoneWadoRsLoaderOptions` = `{}`

#### Returns

`PromiseIterator`\<`unknown`\>

### xhrRequest()

> **xhrRequest**: (`url`, `imageId`, `defaultHeaders`, `params`) => [`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`ArrayBuffer`\>

#### Parameters

• **url**: `string`

• **imageId**: `string`

• **defaultHeaders**: `Record`\<`string`, `string`\> = `{}`

• **params**: [`LoaderXhrRequestParams`](../namespaces/Types/interfaces/LoaderXhrRequestParams.md) = `{}`

#### Returns

[`LoaderXhrRequestPromise`](../namespaces/Types/interfaces/LoaderXhrRequestPromise.md)\<`ArrayBuffer`\>

## Defined in

[packages/dicomImageLoader/src/imageLoader/internal/index.ts:5](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/imageLoader/internal/index.ts#L5)
