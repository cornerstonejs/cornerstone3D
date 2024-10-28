# Interface: WebWorkerDeferredObject\<T\>

## Type Parameters

• **T** = `unknown`

## Properties

### reject()

> **reject**: (`err`) => `void`

#### Parameters

• **err**: `any`

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/WebWorkerTypes.ts:24](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/WebWorkerTypes.ts#L24)

***

### resolve()

> **resolve**: (`arg`) => `void`

#### Parameters

• **arg**: `T` \| `PromiseLike`\<`T`\>

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/WebWorkerTypes.ts:23](https://github.com/cornerstonejs/cornerstone3D/blob/5addf8e516390235f8a3d16ccc818957013f098f/packages/dicomImageLoader/src/types/WebWorkerTypes.ts#L23)
