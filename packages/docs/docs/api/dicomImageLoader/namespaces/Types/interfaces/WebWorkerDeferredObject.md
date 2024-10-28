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

[packages/dicomImageLoader/src/types/WebWorkerTypes.ts:24](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/WebWorkerTypes.ts#L24)

***

### resolve()

> **resolve**: (`arg`) => `void`

#### Parameters

• **arg**: `T` \| `PromiseLike`\<`T`\>

#### Returns

`void`

#### Defined in

[packages/dicomImageLoader/src/types/WebWorkerTypes.ts:23](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/WebWorkerTypes.ts#L23)
