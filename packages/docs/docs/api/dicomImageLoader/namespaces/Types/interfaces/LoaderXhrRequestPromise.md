# Interface: LoaderXhrRequestPromise\<T\>

## Extends

- `Promise`\<`T`\>

## Type Parameters

• **T**

## Properties

### \[toStringTag\]

> `readonly` **\[toStringTag\]**: `string`

#### Inherited from

`Promise.[toStringTag]`

#### Defined in

node\_modules/typescript/lib/lib.es2015.symbol.wellknown.d.ts:176

***

### xhr?

> `optional` **xhr**: `XMLHttpRequest`

#### Defined in

[packages/dicomImageLoader/src/types/XHRRequest.ts:20](https://github.com/cornerstonejs/cornerstone3D/blob/ca63091460d8bdfd067d14a09b3105a6b4852ade/packages/dicomImageLoader/src/types/XHRRequest.ts#L20)

## Methods

### catch()

> **catch**\<`TResult`\>(`onrejected`?): `Promise`\<`T` \| `TResult`\>

Attaches a callback for only the rejection of the Promise.

#### Type Parameters

• **TResult** = `never`

#### Parameters

• **onrejected?**

The callback to execute when the Promise is rejected.

#### Returns

`Promise`\<`T` \| `TResult`\>

A Promise for the completion of the callback.

#### Inherited from

`Promise.catch`

#### Defined in

node\_modules/typescript/lib/lib.es5.d.ts:1557

***

### finally()

> **finally**(`onfinally`?): `Promise`\<`T`\>

Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
resolved value cannot be modified from the callback.

#### Parameters

• **onfinally?**

The callback to execute when the Promise is settled (fulfilled or rejected).

#### Returns

`Promise`\<`T`\>

A Promise for the completion of the callback.

#### Inherited from

`Promise.finally`

#### Defined in

node\_modules/typescript/lib/lib.es2018.promise.d.ts:29

***

### then()

> **then**\<`TResult1`, `TResult2`\>(`onfulfilled`?, `onrejected`?): `Promise`\<`TResult1` \| `TResult2`\>

Attaches callbacks for the resolution and/or rejection of the Promise.

#### Type Parameters

• **TResult1** = `T`

• **TResult2** = `never`

#### Parameters

• **onfulfilled?**

The callback to execute when the Promise is resolved.

• **onrejected?**

The callback to execute when the Promise is rejected.

#### Returns

`Promise`\<`TResult1` \| `TResult2`\>

A Promise for the completion of which ever callback is executed.

#### Inherited from

`Promise.then`

#### Defined in

node\_modules/typescript/lib/lib.es5.d.ts:1550
