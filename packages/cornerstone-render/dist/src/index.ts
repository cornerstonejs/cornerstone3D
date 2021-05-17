(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory(require("vtk.js/Sources/macro"), require("vtk.js/Sources/Rendering/OpenGL/RenderWindow"), require("vtk.js/Sources/Rendering/SceneGraph/GenericWidgetRepresentation"), require("vtk.js/Sources/Rendering/OpenGL/Actor"), require("vtk.js/Sources/Rendering/OpenGL/Actor2D"), require("vtk.js/Sources/Rendering/OpenGL/Camera"), require("vtk.js/Sources/Rendering/OpenGL/Glyph3DMapper"), require("vtk.js/Sources/Rendering/OpenGL/ImageMapper"), require("vtk.js/Sources/Rendering/OpenGL/ImageSlice"), require("vtk.js/Sources/Rendering/OpenGL/PixelSpaceCallbackMapper"), require("vtk.js/Sources/Rendering/OpenGL/PolyDataMapper"), require("vtk.js/Sources/Rendering/OpenGL/Renderer"), require("vtk.js/Sources/Rendering/OpenGL/Skybox"), require("vtk.js/Sources/Rendering/OpenGL/SphereMapper"), require("vtk.js/Sources/Rendering/OpenGL/StickMapper"), require("vtk.js/Sources/Rendering/OpenGL/Texture"), require("vtk.js/Sources/Rendering/OpenGL/Volume"), require("vtk.js/Sources/Rendering/OpenGL/VolumeMapper"), require("vtk.js/Sources/Rendering/SceneGraph/ViewNodeFactory"), require("gl-matrix"), require("vtk.js/Sources/Rendering/OpenGL/Texture/Constants"), require("vtk.js/Sources/Common/Core/DataArray/Constants"), require("vtk.js/Sources/Common/Core/DataArray"), require("vtk.js/Sources/Rendering/Core/Property/Constants"), require("vtk.js/Sources/Rendering/Core/VolumeMapper/Constants"), require("vtk.js/Sources/Rendering/Core/Renderer"), require("vtk.js/Sources/Rendering/Core/RenderWindow"), require("vtk.js/Sources/Rendering/Core/RenderWindowInteractor"), require("vtk.js/Sources/Common/Core/Points"), require("vtk.js/Sources/Common/DataModel/PolyData"), require("vtk.js/Sources/Rendering/Core/Actor"), require("vtk.js/Sources/Rendering/Core/Mapper"), require("vtk.js/Sources/Rendering/Core/VolumeMapper"), require("vtk.js/Sources/Rendering/Core/Camera"), require("vtk.js/Sources/Common/Core/Math"), require("vtk.js/Sources/Common/Core/MatrixBuilder"), require("vtk.js/Sources/Common/DataModel/ImageData"), require("vtk.js/Sources/Rendering/Core/Volume"));
	else if(typeof define === 'function' && define.amd)
		define(["vtk.js/Sources/macro", "vtk.js/Sources/Rendering/OpenGL/RenderWindow", "vtk.js/Sources/Rendering/SceneGraph/GenericWidgetRepresentation", "vtk.js/Sources/Rendering/OpenGL/Actor", "vtk.js/Sources/Rendering/OpenGL/Actor2D", "vtk.js/Sources/Rendering/OpenGL/Camera", "vtk.js/Sources/Rendering/OpenGL/Glyph3DMapper", "vtk.js/Sources/Rendering/OpenGL/ImageMapper", "vtk.js/Sources/Rendering/OpenGL/ImageSlice", "vtk.js/Sources/Rendering/OpenGL/PixelSpaceCallbackMapper", "vtk.js/Sources/Rendering/OpenGL/PolyDataMapper", "vtk.js/Sources/Rendering/OpenGL/Renderer", "vtk.js/Sources/Rendering/OpenGL/Skybox", "vtk.js/Sources/Rendering/OpenGL/SphereMapper", "vtk.js/Sources/Rendering/OpenGL/StickMapper", "vtk.js/Sources/Rendering/OpenGL/Texture", "vtk.js/Sources/Rendering/OpenGL/Volume", "vtk.js/Sources/Rendering/OpenGL/VolumeMapper", "vtk.js/Sources/Rendering/SceneGraph/ViewNodeFactory", "gl-matrix", "vtk.js/Sources/Rendering/OpenGL/Texture/Constants", "vtk.js/Sources/Common/Core/DataArray/Constants", "vtk.js/Sources/Common/Core/DataArray", "vtk.js/Sources/Rendering/Core/Property/Constants", "vtk.js/Sources/Rendering/Core/VolumeMapper/Constants", "vtk.js/Sources/Rendering/Core/Renderer", "vtk.js/Sources/Rendering/Core/RenderWindow", "vtk.js/Sources/Rendering/Core/RenderWindowInteractor", "vtk.js/Sources/Common/Core/Points", "vtk.js/Sources/Common/DataModel/PolyData", "vtk.js/Sources/Rendering/Core/Actor", "vtk.js/Sources/Rendering/Core/Mapper", "vtk.js/Sources/Rendering/Core/VolumeMapper", "vtk.js/Sources/Rendering/Core/Camera", "vtk.js/Sources/Common/Core/Math", "vtk.js/Sources/Common/Core/MatrixBuilder", "vtk.js/Sources/Common/DataModel/ImageData", "vtk.js/Sources/Rendering/Core/Volume"], factory);
	else if(typeof exports === 'object')
		exports["cornerstoneRender"] = factory(require("vtk.js/Sources/macro"), require("vtk.js/Sources/Rendering/OpenGL/RenderWindow"), require("vtk.js/Sources/Rendering/SceneGraph/GenericWidgetRepresentation"), require("vtk.js/Sources/Rendering/OpenGL/Actor"), require("vtk.js/Sources/Rendering/OpenGL/Actor2D"), require("vtk.js/Sources/Rendering/OpenGL/Camera"), require("vtk.js/Sources/Rendering/OpenGL/Glyph3DMapper"), require("vtk.js/Sources/Rendering/OpenGL/ImageMapper"), require("vtk.js/Sources/Rendering/OpenGL/ImageSlice"), require("vtk.js/Sources/Rendering/OpenGL/PixelSpaceCallbackMapper"), require("vtk.js/Sources/Rendering/OpenGL/PolyDataMapper"), require("vtk.js/Sources/Rendering/OpenGL/Renderer"), require("vtk.js/Sources/Rendering/OpenGL/Skybox"), require("vtk.js/Sources/Rendering/OpenGL/SphereMapper"), require("vtk.js/Sources/Rendering/OpenGL/StickMapper"), require("vtk.js/Sources/Rendering/OpenGL/Texture"), require("vtk.js/Sources/Rendering/OpenGL/Volume"), require("vtk.js/Sources/Rendering/OpenGL/VolumeMapper"), require("vtk.js/Sources/Rendering/SceneGraph/ViewNodeFactory"), require("gl-matrix"), require("vtk.js/Sources/Rendering/OpenGL/Texture/Constants"), require("vtk.js/Sources/Common/Core/DataArray/Constants"), require("vtk.js/Sources/Common/Core/DataArray"), require("vtk.js/Sources/Rendering/Core/Property/Constants"), require("vtk.js/Sources/Rendering/Core/VolumeMapper/Constants"), require("vtk.js/Sources/Rendering/Core/Renderer"), require("vtk.js/Sources/Rendering/Core/RenderWindow"), require("vtk.js/Sources/Rendering/Core/RenderWindowInteractor"), require("vtk.js/Sources/Common/Core/Points"), require("vtk.js/Sources/Common/DataModel/PolyData"), require("vtk.js/Sources/Rendering/Core/Actor"), require("vtk.js/Sources/Rendering/Core/Mapper"), require("vtk.js/Sources/Rendering/Core/VolumeMapper"), require("vtk.js/Sources/Rendering/Core/Camera"), require("vtk.js/Sources/Common/Core/Math"), require("vtk.js/Sources/Common/Core/MatrixBuilder"), require("vtk.js/Sources/Common/DataModel/ImageData"), require("vtk.js/Sources/Rendering/Core/Volume"));
	else
		root["cornerstoneRender"] = factory(root["vtk.js/Sources/macro"], root["vtk.js/Sources/Rendering/OpenGL/RenderWindow"], root["vtk.js/Sources/Rendering/SceneGraph/GenericWidgetRepresentation"], root["vtk.js/Sources/Rendering/OpenGL/Actor"], root["vtk.js/Sources/Rendering/OpenGL/Actor2D"], root["vtk.js/Sources/Rendering/OpenGL/Camera"], root["vtk.js/Sources/Rendering/OpenGL/Glyph3DMapper"], root["vtk.js/Sources/Rendering/OpenGL/ImageMapper"], root["vtk.js/Sources/Rendering/OpenGL/ImageSlice"], root["vtk.js/Sources/Rendering/OpenGL/PixelSpaceCallbackMapper"], root["vtk.js/Sources/Rendering/OpenGL/PolyDataMapper"], root["vtk.js/Sources/Rendering/OpenGL/Renderer"], root["vtk.js/Sources/Rendering/OpenGL/Skybox"], root["vtk.js/Sources/Rendering/OpenGL/SphereMapper"], root["vtk.js/Sources/Rendering/OpenGL/StickMapper"], root["vtk.js/Sources/Rendering/OpenGL/Texture"], root["vtk.js/Sources/Rendering/OpenGL/Volume"], root["vtk.js/Sources/Rendering/OpenGL/VolumeMapper"], root["vtk.js/Sources/Rendering/SceneGraph/ViewNodeFactory"], root["window"], root["vtk.js/Sources/Rendering/OpenGL/Texture/Constants"], root["vtk.js/Sources/Common/Core/DataArray/Constants"], root["vtk.js/Sources/Common/Core/DataArray"], root["vtk.js/Sources/Rendering/Core/Property/Constants"], root["vtk.js/Sources/Rendering/Core/VolumeMapper/Constants"], root["vtk.js/Sources/Rendering/Core/Renderer"], root["vtk.js/Sources/Rendering/Core/RenderWindow"], root["vtk.js/Sources/Rendering/Core/RenderWindowInteractor"], root["vtk.js/Sources/Common/Core/Points"], root["vtk.js/Sources/Common/DataModel/PolyData"], root["vtk.js/Sources/Rendering/Core/Actor"], root["vtk.js/Sources/Rendering/Core/Mapper"], root["vtk.js/Sources/Rendering/Core/VolumeMapper"], root["vtk.js/Sources/Rendering/Core/Camera"], root["vtk.js/Sources/Common/Core/Math"], root["vtk.js/Sources/Common/Core/MatrixBuilder"], root["vtk.js/Sources/Common/DataModel/ImageData"], root["vtk.js/Sources/Rendering/Core/Volume"]);
})(this, function(__WEBPACK_EXTERNAL_MODULE__9702__, __WEBPACK_EXTERNAL_MODULE__9415__, __WEBPACK_EXTERNAL_MODULE__3174__, __WEBPACK_EXTERNAL_MODULE__2330__, __WEBPACK_EXTERNAL_MODULE__9576__, __WEBPACK_EXTERNAL_MODULE__4241__, __WEBPACK_EXTERNAL_MODULE__390__, __WEBPACK_EXTERNAL_MODULE__8473__, __WEBPACK_EXTERNAL_MODULE__8867__, __WEBPACK_EXTERNAL_MODULE__8180__, __WEBPACK_EXTERNAL_MODULE__1009__, __WEBPACK_EXTERNAL_MODULE__6197__, __WEBPACK_EXTERNAL_MODULE__2829__, __WEBPACK_EXTERNAL_MODULE__2831__, __WEBPACK_EXTERNAL_MODULE__8172__, __WEBPACK_EXTERNAL_MODULE__5559__, __WEBPACK_EXTERNAL_MODULE__1767__, __WEBPACK_EXTERNAL_MODULE__2694__, __WEBPACK_EXTERNAL_MODULE__9910__, __WEBPACK_EXTERNAL_MODULE__5167__, __WEBPACK_EXTERNAL_MODULE__4004__, __WEBPACK_EXTERNAL_MODULE__6810__, __WEBPACK_EXTERNAL_MODULE__8053__, __WEBPACK_EXTERNAL_MODULE__3360__, __WEBPACK_EXTERNAL_MODULE__9633__, __WEBPACK_EXTERNAL_MODULE__4680__, __WEBPACK_EXTERNAL_MODULE__8305__, __WEBPACK_EXTERNAL_MODULE__4320__, __WEBPACK_EXTERNAL_MODULE__3797__, __WEBPACK_EXTERNAL_MODULE__1605__, __WEBPACK_EXTERNAL_MODULE__8208__, __WEBPACK_EXTERNAL_MODULE__8275__, __WEBPACK_EXTERNAL_MODULE__3907__, __WEBPACK_EXTERNAL_MODULE__2834__, __WEBPACK_EXTERNAL_MODULE__6812__, __WEBPACK_EXTERNAL_MODULE__8653__, __WEBPACK_EXTERNAL_MODULE__253__, __WEBPACK_EXTERNAL_MODULE__3140__) {
return /******/ (function() { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 7162:
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

module.exports = __webpack_require__(5047);


/***/ }),

/***/ 3182:
/***/ (function() {



/***/ }),

/***/ 2919:
/***/ (function() {



/***/ }),

/***/ 469:
/***/ (function() {



/***/ }),

/***/ 3648:
/***/ (function() {



/***/ }),

/***/ 7599:
/***/ (function() {



/***/ }),

/***/ 9572:
/***/ (function() {



/***/ }),

/***/ 607:
/***/ (function() {



/***/ }),

/***/ 4373:
/***/ (function() {



/***/ }),

/***/ 2729:
/***/ (function() {



/***/ }),

/***/ 1543:
/***/ (function() {



/***/ }),

/***/ 8627:
/***/ (function() {



/***/ }),

/***/ 3374:
/***/ (function() {



/***/ }),

/***/ 2320:
/***/ (function() {



/***/ }),

/***/ 9162:
/***/ (function() {



/***/ }),

/***/ 1578:
/***/ (function() {



/***/ }),

/***/ 6824:
/***/ (function() {



/***/ }),

/***/ 5339:
/***/ (function() {



/***/ }),

/***/ 3062:
/***/ (function() {



/***/ }),

/***/ 626:
/***/ (function() {



/***/ }),

/***/ 9778:
/***/ (function() {



/***/ }),

/***/ 8967:
/***/ (function() {



/***/ }),

/***/ 9907:
/***/ (function(module, exports, __webpack_require__) {

/* module decorator */ module = __webpack_require__.nmd(module);
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    promiseTag = '[object Promise]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    symbolTag = '[object Symbol]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to match `RegExp` flags from their coerced string values. */
var reFlags = /\w*$/;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/** Used to identify `toStringTag` values supported by `_.clone`. */
var cloneableTags = {};
cloneableTags[argsTag] = cloneableTags[arrayTag] =
cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] =
cloneableTags[boolTag] = cloneableTags[dateTag] =
cloneableTags[float32Tag] = cloneableTags[float64Tag] =
cloneableTags[int8Tag] = cloneableTags[int16Tag] =
cloneableTags[int32Tag] = cloneableTags[mapTag] =
cloneableTags[numberTag] = cloneableTags[objectTag] =
cloneableTags[regexpTag] = cloneableTags[setTag] =
cloneableTags[stringTag] = cloneableTags[symbolTag] =
cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
cloneableTags[errorTag] = cloneableTags[funcTag] =
cloneableTags[weakMapTag] = false;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof __webpack_require__.g == 'object' && __webpack_require__.g && __webpack_require__.g.Object === Object && __webpack_require__.g;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Detect free variable `exports`. */
var freeExports =  true && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && "object" == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/**
 * Adds the key-value `pair` to `map`.
 *
 * @private
 * @param {Object} map The map to modify.
 * @param {Array} pair The key-value pair to add.
 * @returns {Object} Returns `map`.
 */
function addMapEntry(map, pair) {
  // Don't return `map.set` because it's not chainable in IE 11.
  map.set(pair[0], pair[1]);
  return map;
}

/**
 * Adds `value` to `set`.
 *
 * @private
 * @param {Object} set The set to modify.
 * @param {*} value The value to add.
 * @returns {Object} Returns `set`.
 */
function addSetEntry(set, value) {
  // Don't return `set.add` because it's not chainable in IE 11.
  set.add(value);
  return set;
}

/**
 * A specialized version of `_.forEach` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array ? array.length : 0;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

/**
 * A specialized version of `_.reduce` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {boolean} [initAccum] Specify using the first element of `array` as
 *  the initial value.
 * @returns {*} Returns the accumulated value.
 */
function arrayReduce(array, iteratee, accumulator, initAccum) {
  var index = -1,
      length = array ? array.length : 0;

  if (initAccum && length) {
    accumulator = array[++index];
  }
  while (++index < length) {
    accumulator = iteratee(accumulator, array[index], index, array);
  }
  return accumulator;
}

/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */
function baseTimes(n, iteratee) {
  var index = -1,
      result = Array(n);

  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/**
 * Converts `map` to its key-value pairs.
 *
 * @private
 * @param {Object} map The map to convert.
 * @returns {Array} Returns the key-value pairs.
 */
function mapToArray(map) {
  var index = -1,
      result = Array(map.size);

  map.forEach(function(value, key) {
    result[++index] = [key, value];
  });
  return result;
}

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

/**
 * Converts `set` to an array of its values.
 *
 * @private
 * @param {Object} set The set to convert.
 * @returns {Array} Returns the values.
 */
function setToArray(set) {
  var index = -1,
      result = Array(set.size);

  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype,
    funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var Buffer = moduleExports ? root.Buffer : undefined,
    Symbol = root.Symbol,
    Uint8Array = root.Uint8Array,
    getPrototype = overArg(Object.getPrototypeOf, Object),
    objectCreate = Object.create,
    propertyIsEnumerable = objectProto.propertyIsEnumerable,
    splice = arrayProto.splice;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols = Object.getOwnPropertySymbols,
    nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined,
    nativeKeys = overArg(Object.keys, Object);

/* Built-in method references that are verified to be native. */
var DataView = getNative(root, 'DataView'),
    Map = getNative(root, 'Map'),
    Promise = getNative(root, 'Promise'),
    Set = getNative(root, 'Set'),
    WeakMap = getNative(root, 'WeakMap'),
    nativeCreate = getNative(Object, 'create');

/** Used to detect maps, sets, and weakmaps. */
var dataViewCtorString = toSource(DataView),
    mapCtorString = toSource(Map),
    promiseCtorString = toSource(Promise),
    setCtorString = toSource(Set),
    weakMapCtorString = toSource(WeakMap);

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  return this.has(key) && delete this.__data__[key];
}

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
}

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
}

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  return getMapData(this, key)['delete'](key);
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  getMapData(this, key).set(key, value);
  return this;
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 * Creates a stack cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Stack(entries) {
  this.__data__ = new ListCache(entries);
}

/**
 * Removes all key-value entries from the stack.
 *
 * @private
 * @name clear
 * @memberOf Stack
 */
function stackClear() {
  this.__data__ = new ListCache;
}

/**
 * Removes `key` and its value from the stack.
 *
 * @private
 * @name delete
 * @memberOf Stack
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function stackDelete(key) {
  return this.__data__['delete'](key);
}

/**
 * Gets the stack value for `key`.
 *
 * @private
 * @name get
 * @memberOf Stack
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function stackGet(key) {
  return this.__data__.get(key);
}

/**
 * Checks if a stack value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Stack
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function stackHas(key) {
  return this.__data__.has(key);
}

/**
 * Sets the stack `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Stack
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the stack cache instance.
 */
function stackSet(key, value) {
  var cache = this.__data__;
  if (cache instanceof ListCache) {
    var pairs = cache.__data__;
    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
      pairs.push([key, value]);
      return this;
    }
    cache = this.__data__ = new MapCache(pairs);
  }
  cache.set(key, value);
  return this;
}

// Add methods to `Stack`.
Stack.prototype.clear = stackClear;
Stack.prototype['delete'] = stackDelete;
Stack.prototype.get = stackGet;
Stack.prototype.has = stackHas;
Stack.prototype.set = stackSet;

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys(value, inherited) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  // Safari 9 makes `arguments.length` enumerable in strict mode.
  var result = (isArray(value) || isArguments(value))
    ? baseTimes(value.length, String)
    : [];

  var length = result.length,
      skipIndexes = !!length;

  for (var key in value) {
    if ((inherited || hasOwnProperty.call(value, key)) &&
        !(skipIndexes && (key == 'length' || isIndex(key, length)))) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Assigns `value` to `key` of `object` if the existing value is not equivalent
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function assignValue(object, key, value) {
  var objValue = object[key];
  if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) ||
      (value === undefined && !(key in object))) {
    object[key] = value;
  }
}

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.assign` without support for multiple sources
 * or `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssign(object, source) {
  return object && copyObject(source, keys(source), object);
}

/**
 * The base implementation of `_.clone` and `_.cloneDeep` which tracks
 * traversed objects.
 *
 * @private
 * @param {*} value The value to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @param {boolean} [isFull] Specify a clone including symbols.
 * @param {Function} [customizer] The function to customize cloning.
 * @param {string} [key] The key of `value`.
 * @param {Object} [object] The parent object of `value`.
 * @param {Object} [stack] Tracks traversed objects and their clone counterparts.
 * @returns {*} Returns the cloned value.
 */
function baseClone(value, isDeep, isFull, customizer, key, object, stack) {
  var result;
  if (customizer) {
    result = object ? customizer(value, key, object, stack) : customizer(value);
  }
  if (result !== undefined) {
    return result;
  }
  if (!isObject(value)) {
    return value;
  }
  var isArr = isArray(value);
  if (isArr) {
    result = initCloneArray(value);
    if (!isDeep) {
      return copyArray(value, result);
    }
  } else {
    var tag = getTag(value),
        isFunc = tag == funcTag || tag == genTag;

    if (isBuffer(value)) {
      return cloneBuffer(value, isDeep);
    }
    if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
      if (isHostObject(value)) {
        return object ? value : {};
      }
      result = initCloneObject(isFunc ? {} : value);
      if (!isDeep) {
        return copySymbols(value, baseAssign(result, value));
      }
    } else {
      if (!cloneableTags[tag]) {
        return object ? value : {};
      }
      result = initCloneByTag(value, tag, baseClone, isDeep);
    }
  }
  // Check for circular references and return its corresponding clone.
  stack || (stack = new Stack);
  var stacked = stack.get(value);
  if (stacked) {
    return stacked;
  }
  stack.set(value, result);

  if (!isArr) {
    var props = isFull ? getAllKeys(value) : keys(value);
  }
  arrayEach(props || value, function(subValue, key) {
    if (props) {
      key = subValue;
      subValue = value[key];
    }
    // Recursively populate clone (susceptible to call stack limits).
    assignValue(result, key, baseClone(subValue, isDeep, isFull, customizer, key, value, stack));
  });
  return result;
}

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} prototype The object to inherit from.
 * @returns {Object} Returns the new object.
 */
function baseCreate(proto) {
  return isObject(proto) ? objectCreate(proto) : {};
}

/**
 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @param {Function} symbolsFunc The function to get the symbols of `object`.
 * @returns {Array} Returns the array of property names and symbols.
 */
function baseGetAllKeys(object, keysFunc, symbolsFunc) {
  var result = keysFunc(object);
  return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
}

/**
 * The base implementation of `getTag`.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  return objectToString.call(value);
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

/**
 * Creates a clone of  `buffer`.
 *
 * @private
 * @param {Buffer} buffer The buffer to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Buffer} Returns the cloned buffer.
 */
function cloneBuffer(buffer, isDeep) {
  if (isDeep) {
    return buffer.slice();
  }
  var result = new buffer.constructor(buffer.length);
  buffer.copy(result);
  return result;
}

/**
 * Creates a clone of `arrayBuffer`.
 *
 * @private
 * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
 * @returns {ArrayBuffer} Returns the cloned array buffer.
 */
function cloneArrayBuffer(arrayBuffer) {
  var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
  new Uint8Array(result).set(new Uint8Array(arrayBuffer));
  return result;
}

/**
 * Creates a clone of `dataView`.
 *
 * @private
 * @param {Object} dataView The data view to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned data view.
 */
function cloneDataView(dataView, isDeep) {
  var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
  return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
}

/**
 * Creates a clone of `map`.
 *
 * @private
 * @param {Object} map The map to clone.
 * @param {Function} cloneFunc The function to clone values.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned map.
 */
function cloneMap(map, isDeep, cloneFunc) {
  var array = isDeep ? cloneFunc(mapToArray(map), true) : mapToArray(map);
  return arrayReduce(array, addMapEntry, new map.constructor);
}

/**
 * Creates a clone of `regexp`.
 *
 * @private
 * @param {Object} regexp The regexp to clone.
 * @returns {Object} Returns the cloned regexp.
 */
function cloneRegExp(regexp) {
  var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
  result.lastIndex = regexp.lastIndex;
  return result;
}

/**
 * Creates a clone of `set`.
 *
 * @private
 * @param {Object} set The set to clone.
 * @param {Function} cloneFunc The function to clone values.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned set.
 */
function cloneSet(set, isDeep, cloneFunc) {
  var array = isDeep ? cloneFunc(setToArray(set), true) : setToArray(set);
  return arrayReduce(array, addSetEntry, new set.constructor);
}

/**
 * Creates a clone of the `symbol` object.
 *
 * @private
 * @param {Object} symbol The symbol object to clone.
 * @returns {Object} Returns the cloned symbol object.
 */
function cloneSymbol(symbol) {
  return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
}

/**
 * Creates a clone of `typedArray`.
 *
 * @private
 * @param {Object} typedArray The typed array to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned typed array.
 */
function cloneTypedArray(typedArray, isDeep) {
  var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
  return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
}

/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function copyArray(source, array) {
  var index = -1,
      length = source.length;

  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property identifiers to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @param {Function} [customizer] The function to customize copied values.
 * @returns {Object} Returns `object`.
 */
function copyObject(source, props, object, customizer) {
  object || (object = {});

  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];

    var newValue = customizer
      ? customizer(object[key], source[key], key, object, source)
      : undefined;

    assignValue(object, key, newValue === undefined ? source[key] : newValue);
  }
  return object;
}

/**
 * Copies own symbol properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy symbols from.
 * @param {Object} [object={}] The object to copy symbols to.
 * @returns {Object} Returns `object`.
 */
function copySymbols(source, object) {
  return copyObject(source, getSymbols(source), object);
}

/**
 * Creates an array of own enumerable property names and symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeys(object) {
  return baseGetAllKeys(object, keys, getSymbols);
}

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * Creates an array of the own enumerable symbol properties of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbols = nativeGetSymbols ? overArg(nativeGetSymbols, Object) : stubArray;

/**
 * Gets the `toStringTag` of `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
var getTag = baseGetTag;

// Fallback for data views, maps, sets, and weak maps in IE 11,
// for data views in Edge < 14, and promises in Node.js.
if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
    (Map && getTag(new Map) != mapTag) ||
    (Promise && getTag(Promise.resolve()) != promiseTag) ||
    (Set && getTag(new Set) != setTag) ||
    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
  getTag = function(value) {
    var result = objectToString.call(value),
        Ctor = result == objectTag ? value.constructor : undefined,
        ctorString = Ctor ? toSource(Ctor) : undefined;

    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString: return dataViewTag;
        case mapCtorString: return mapTag;
        case promiseCtorString: return promiseTag;
        case setCtorString: return setTag;
        case weakMapCtorString: return weakMapTag;
      }
    }
    return result;
  };
}

/**
 * Initializes an array clone.
 *
 * @private
 * @param {Array} array The array to clone.
 * @returns {Array} Returns the initialized clone.
 */
function initCloneArray(array) {
  var length = array.length,
      result = array.constructor(length);

  // Add properties assigned by `RegExp#exec`.
  if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
    result.index = array.index;
    result.input = array.input;
  }
  return result;
}

/**
 * Initializes an object clone.
 *
 * @private
 * @param {Object} object The object to clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneObject(object) {
  return (typeof object.constructor == 'function' && !isPrototype(object))
    ? baseCreate(getPrototype(object))
    : {};
}

/**
 * Initializes an object clone based on its `toStringTag`.
 *
 * **Note:** This function only supports cloning values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to clone.
 * @param {string} tag The `toStringTag` of the object to clone.
 * @param {Function} cloneFunc The function to clone values.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneByTag(object, tag, cloneFunc, isDeep) {
  var Ctor = object.constructor;
  switch (tag) {
    case arrayBufferTag:
      return cloneArrayBuffer(object);

    case boolTag:
    case dateTag:
      return new Ctor(+object);

    case dataViewTag:
      return cloneDataView(object, isDeep);

    case float32Tag: case float64Tag:
    case int8Tag: case int16Tag: case int32Tag:
    case uint8Tag: case uint8ClampedTag: case uint16Tag: case uint32Tag:
      return cloneTypedArray(object, isDeep);

    case mapTag:
      return cloneMap(object, isDeep, cloneFunc);

    case numberTag:
    case stringTag:
      return new Ctor(object);

    case regexpTag:
      return cloneRegExp(object);

    case setTag:
      return cloneSet(object, isDeep, cloneFunc);

    case symbolTag:
      return cloneSymbol(object);
  }
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype(value) {
  var Ctor = value && value.constructor,
      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

  return value === proto;
}

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to process.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * This method is like `_.clone` except that it recursively clones `value`.
 *
 * @static
 * @memberOf _
 * @since 1.0.0
 * @category Lang
 * @param {*} value The value to recursively clone.
 * @returns {*} Returns the deep cloned value.
 * @see _.clone
 * @example
 *
 * var objects = [{ 'a': 1 }, { 'b': 2 }];
 *
 * var deep = _.cloneDeep(objects);
 * console.log(deep[0] === objects[0]);
 * // => false
 */
function cloneDeep(value) {
  return baseClone(value, true, true);
}

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/**
 * This method is like `_.isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array-like object,
 *  else `false`.
 * @example
 *
 * _.isArrayLikeObject([1, 2, 3]);
 * // => true
 *
 * _.isArrayLikeObject(document.body.children);
 * // => true
 *
 * _.isArrayLikeObject('abc');
 * // => false
 *
 * _.isArrayLikeObject(_.noop);
 * // => false
 */
function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

/**
 * Checks if `value` is a buffer.
 *
 * @static
 * @memberOf _
 * @since 4.3.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
 * @example
 *
 * _.isBuffer(new Buffer(2));
 * // => true
 *
 * _.isBuffer(new Uint8Array(2));
 * // => false
 */
var isBuffer = nativeIsBuffer || stubFalse;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

/**
 * This method returns a new empty array.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {Array} Returns the new empty array.
 * @example
 *
 * var arrays = _.times(2, _.stubArray);
 *
 * console.log(arrays);
 * // => [[], []]
 *
 * console.log(arrays[0] === arrays[1]);
 * // => false
 */
function stubArray() {
  return [];
}

/**
 * This method returns `false`.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {boolean} Returns `false`.
 * @example
 *
 * _.times(2, _.stubFalse);
 * // => [false, false]
 */
function stubFalse() {
  return false;
}

module.exports = cloneDeep;


/***/ }),

/***/ 3958:
/***/ (function(module, exports, __webpack_require__) {

/* module decorator */ module = __webpack_require__.nmd(module);
/**
 * Lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright JS Foundation and other contributors <https://js.foundation/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG = 1,
    COMPARE_UNORDERED_FLAG = 2;

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    asyncTag = '[object AsyncFunction]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    nullTag = '[object Null]',
    objectTag = '[object Object]',
    promiseTag = '[object Promise]',
    proxyTag = '[object Proxy]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    symbolTag = '[object Symbol]',
    undefinedTag = '[object Undefined]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
typedArrayTags[errorTag] = typedArrayTags[funcTag] =
typedArrayTags[mapTag] = typedArrayTags[numberTag] =
typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
typedArrayTags[setTag] = typedArrayTags[stringTag] =
typedArrayTags[weakMapTag] = false;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof __webpack_require__.g == 'object' && __webpack_require__.g && __webpack_require__.g.Object === Object && __webpack_require__.g;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Detect free variable `exports`. */
var freeExports =  true && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && "object" == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/** Detect free variable `process` from Node.js. */
var freeProcess = moduleExports && freeGlobal.process;

/** Used to access faster Node.js helpers. */
var nodeUtil = (function() {
  try {
    return freeProcess && freeProcess.binding && freeProcess.binding('util');
  } catch (e) {}
}());

/* Node.js helper references. */
var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

/**
 * A specialized version of `_.filter` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function arrayFilter(array, predicate) {
  var index = -1,
      length = array == null ? 0 : array.length,
      resIndex = 0,
      result = [];

  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[resIndex++] = value;
    }
  }
  return result;
}

/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

/**
 * A specialized version of `_.some` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function arraySome(array, predicate) {
  var index = -1,
      length = array == null ? 0 : array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */
function baseTimes(n, iteratee) {
  var index = -1,
      result = Array(n);

  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

/**
 * The base implementation of `_.unary` without support for storing metadata.
 *
 * @private
 * @param {Function} func The function to cap arguments for.
 * @returns {Function} Returns the new capped function.
 */
function baseUnary(func) {
  return function(value) {
    return func(value);
  };
}

/**
 * Checks if a `cache` value for `key` exists.
 *
 * @private
 * @param {Object} cache The cache to query.
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function cacheHas(cache, key) {
  return cache.has(key);
}

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Converts `map` to its key-value pairs.
 *
 * @private
 * @param {Object} map The map to convert.
 * @returns {Array} Returns the key-value pairs.
 */
function mapToArray(map) {
  var index = -1,
      result = Array(map.size);

  map.forEach(function(value, key) {
    result[++index] = [key, value];
  });
  return result;
}

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

/**
 * Converts `set` to an array of its values.
 *
 * @private
 * @param {Object} set The set to convert.
 * @returns {Array} Returns the values.
 */
function setToArray(set) {
  var index = -1,
      result = Array(set.size);

  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype,
    funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var Buffer = moduleExports ? root.Buffer : undefined,
    Symbol = root.Symbol,
    Uint8Array = root.Uint8Array,
    propertyIsEnumerable = objectProto.propertyIsEnumerable,
    splice = arrayProto.splice,
    symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols = Object.getOwnPropertySymbols,
    nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined,
    nativeKeys = overArg(Object.keys, Object);

/* Built-in method references that are verified to be native. */
var DataView = getNative(root, 'DataView'),
    Map = getNative(root, 'Map'),
    Promise = getNative(root, 'Promise'),
    Set = getNative(root, 'Set'),
    WeakMap = getNative(root, 'WeakMap'),
    nativeCreate = getNative(Object, 'create');

/** Used to detect maps, sets, and weakmaps. */
var dataViewCtorString = toSource(DataView),
    mapCtorString = toSource(Map),
    promiseCtorString = toSource(Promise),
    setCtorString = toSource(Set),
    weakMapCtorString = toSource(WeakMap);

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  this.size = 0;
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? (data[key] !== undefined) : hasOwnProperty.call(data, key);
}

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  var result = getMapData(this, key)['delete'](key);
  this.size -= result ? 1 : 0;
  return result;
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  var data = getMapData(this, key),
      size = data.size;

  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 *
 * Creates an array cache object to store unique values.
 *
 * @private
 * @constructor
 * @param {Array} [values] The values to cache.
 */
function SetCache(values) {
  var index = -1,
      length = values == null ? 0 : values.length;

  this.__data__ = new MapCache;
  while (++index < length) {
    this.add(values[index]);
  }
}

/**
 * Adds `value` to the array cache.
 *
 * @private
 * @name add
 * @memberOf SetCache
 * @alias push
 * @param {*} value The value to cache.
 * @returns {Object} Returns the cache instance.
 */
function setCacheAdd(value) {
  this.__data__.set(value, HASH_UNDEFINED);
  return this;
}

/**
 * Checks if `value` is in the array cache.
 *
 * @private
 * @name has
 * @memberOf SetCache
 * @param {*} value The value to search for.
 * @returns {number} Returns `true` if `value` is found, else `false`.
 */
function setCacheHas(value) {
  return this.__data__.has(value);
}

// Add methods to `SetCache`.
SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
SetCache.prototype.has = setCacheHas;

/**
 * Creates a stack cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Stack(entries) {
  var data = this.__data__ = new ListCache(entries);
  this.size = data.size;
}

/**
 * Removes all key-value entries from the stack.
 *
 * @private
 * @name clear
 * @memberOf Stack
 */
function stackClear() {
  this.__data__ = new ListCache;
  this.size = 0;
}

/**
 * Removes `key` and its value from the stack.
 *
 * @private
 * @name delete
 * @memberOf Stack
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function stackDelete(key) {
  var data = this.__data__,
      result = data['delete'](key);

  this.size = data.size;
  return result;
}

/**
 * Gets the stack value for `key`.
 *
 * @private
 * @name get
 * @memberOf Stack
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function stackGet(key) {
  return this.__data__.get(key);
}

/**
 * Checks if a stack value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Stack
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function stackHas(key) {
  return this.__data__.has(key);
}

/**
 * Sets the stack `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Stack
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the stack cache instance.
 */
function stackSet(key, value) {
  var data = this.__data__;
  if (data instanceof ListCache) {
    var pairs = data.__data__;
    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
      pairs.push([key, value]);
      this.size = ++data.size;
      return this;
    }
    data = this.__data__ = new MapCache(pairs);
  }
  data.set(key, value);
  this.size = data.size;
  return this;
}

// Add methods to `Stack`.
Stack.prototype.clear = stackClear;
Stack.prototype['delete'] = stackDelete;
Stack.prototype.get = stackGet;
Stack.prototype.has = stackHas;
Stack.prototype.set = stackSet;

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys(value, inherited) {
  var isArr = isArray(value),
      isArg = !isArr && isArguments(value),
      isBuff = !isArr && !isArg && isBuffer(value),
      isType = !isArr && !isArg && !isBuff && isTypedArray(value),
      skipIndexes = isArr || isArg || isBuff || isType,
      result = skipIndexes ? baseTimes(value.length, String) : [],
      length = result.length;

  for (var key in value) {
    if ((inherited || hasOwnProperty.call(value, key)) &&
        !(skipIndexes && (
           // Safari 9 has enumerable `arguments.length` in strict mode.
           key == 'length' ||
           // Node.js 0.10 has enumerable non-index properties on buffers.
           (isBuff && (key == 'offset' || key == 'parent')) ||
           // PhantomJS 2 has enumerable non-index properties on typed arrays.
           (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
           // Skip index properties.
           isIndex(key, length)
        ))) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/**
 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @param {Function} symbolsFunc The function to get the symbols of `object`.
 * @returns {Array} Returns the array of property names and symbols.
 */
function baseGetAllKeys(object, keysFunc, symbolsFunc) {
  var result = keysFunc(object);
  return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
}

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return (symToStringTag && symToStringTag in Object(value))
    ? getRawTag(value)
    : objectToString(value);
}

/**
 * The base implementation of `_.isArguments`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 */
function baseIsArguments(value) {
  return isObjectLike(value) && baseGetTag(value) == argsTag;
}

/**
 * The base implementation of `_.isEqual` which supports partial comparisons
 * and tracks traversed objects.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {boolean} bitmask The bitmask flags.
 *  1 - Unordered comparison
 *  2 - Partial comparison
 * @param {Function} [customizer] The function to customize comparisons.
 * @param {Object} [stack] Tracks traversed `value` and `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, bitmask, customizer, stack) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObjectLike(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
}

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} [stack] Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = objIsArr ? arrayTag : getTag(object),
      othTag = othIsArr ? arrayTag : getTag(other);

  objTag = objTag == argsTag ? objectTag : objTag;
  othTag = othTag == argsTag ? objectTag : othTag;

  var objIsObj = objTag == objectTag,
      othIsObj = othTag == objectTag,
      isSameTag = objTag == othTag;

  if (isSameTag && isBuffer(object)) {
    if (!isBuffer(other)) {
      return false;
    }
    objIsArr = true;
    objIsObj = false;
  }
  if (isSameTag && !objIsObj) {
    stack || (stack = new Stack);
    return (objIsArr || isTypedArray(object))
      ? equalArrays(object, other, bitmask, customizer, equalFunc, stack)
      : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
  }
  if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      var objUnwrapped = objIsWrapped ? object.value() : object,
          othUnwrapped = othIsWrapped ? other.value() : other;

      stack || (stack = new Stack);
      return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
    }
  }
  if (!isSameTag) {
    return false;
  }
  stack || (stack = new Stack);
  return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.isTypedArray` without Node.js optimizations.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 */
function baseIsTypedArray(value) {
  return isObjectLike(value) &&
    isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
}

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `array` and `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
    return false;
  }
  // Assume cyclic values are equal.
  var stacked = stack.get(array);
  if (stacked && stack.get(other)) {
    return stacked == other;
  }
  var index = -1,
      result = true,
      seen = (bitmask & COMPARE_UNORDERED_FLAG) ? new SetCache : undefined;

  stack.set(array, other);
  stack.set(other, array);

  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index];

    if (customizer) {
      var compared = isPartial
        ? customizer(othValue, arrValue, index, other, array, stack)
        : customizer(arrValue, othValue, index, array, other, stack);
    }
    if (compared !== undefined) {
      if (compared) {
        continue;
      }
      result = false;
      break;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (seen) {
      if (!arraySome(other, function(othValue, othIndex) {
            if (!cacheHas(seen, othIndex) &&
                (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
        result = false;
        break;
      }
    } else if (!(
          arrValue === othValue ||
            equalFunc(arrValue, othValue, bitmask, customizer, stack)
        )) {
      result = false;
      break;
    }
  }
  stack['delete'](array);
  stack['delete'](other);
  return result;
}

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
  switch (tag) {
    case dataViewTag:
      if ((object.byteLength != other.byteLength) ||
          (object.byteOffset != other.byteOffset)) {
        return false;
      }
      object = object.buffer;
      other = other.buffer;

    case arrayBufferTag:
      if ((object.byteLength != other.byteLength) ||
          !equalFunc(new Uint8Array(object), new Uint8Array(other))) {
        return false;
      }
      return true;

    case boolTag:
    case dateTag:
    case numberTag:
      // Coerce booleans to `1` or `0` and dates to milliseconds.
      // Invalid dates are coerced to `NaN`.
      return eq(+object, +other);

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings, primitives and objects,
      // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
      // for more details.
      return object == (other + '');

    case mapTag:
      var convert = mapToArray;

    case setTag:
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
      convert || (convert = setToArray);

      if (object.size != other.size && !isPartial) {
        return false;
      }
      // Assume cyclic values are equal.
      var stacked = stack.get(object);
      if (stacked) {
        return stacked == other;
      }
      bitmask |= COMPARE_UNORDERED_FLAG;

      // Recursively compare objects (susceptible to call stack limits).
      stack.set(object, other);
      var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
      stack['delete'](object);
      return result;

    case symbolTag:
      if (symbolValueOf) {
        return symbolValueOf.call(object) == symbolValueOf.call(other);
      }
  }
  return false;
}

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
      objProps = getAllKeys(object),
      objLength = objProps.length,
      othProps = getAllKeys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isPartial) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
      return false;
    }
  }
  // Assume cyclic values are equal.
  var stacked = stack.get(object);
  if (stacked && stack.get(other)) {
    return stacked == other;
  }
  var result = true;
  stack.set(object, other);
  stack.set(other, object);

  var skipCtor = isPartial;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key];

    if (customizer) {
      var compared = isPartial
        ? customizer(othValue, objValue, key, other, object, stack)
        : customizer(objValue, othValue, key, object, other, stack);
    }
    // Recursively compare objects (susceptible to call stack limits).
    if (!(compared === undefined
          ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
          : compared
        )) {
      result = false;
      break;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (result && !skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      result = false;
    }
  }
  stack['delete'](object);
  stack['delete'](other);
  return result;
}

/**
 * Creates an array of own enumerable property names and symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeys(object) {
  return baseGetAllKeys(object, keys, getSymbols);
}

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag),
      tag = value[symToStringTag];

  try {
    value[symToStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}

  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}

/**
 * Creates an array of the own enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
  if (object == null) {
    return [];
  }
  object = Object(object);
  return arrayFilter(nativeGetSymbols(object), function(symbol) {
    return propertyIsEnumerable.call(object, symbol);
  });
};

/**
 * Gets the `toStringTag` of `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
var getTag = baseGetTag;

// Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
    (Map && getTag(new Map) != mapTag) ||
    (Promise && getTag(Promise.resolve()) != promiseTag) ||
    (Set && getTag(new Set) != setTag) ||
    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
  getTag = function(value) {
    var result = baseGetTag(value),
        Ctor = result == objectTag ? value.constructor : undefined,
        ctorString = Ctor ? toSource(Ctor) : '';

    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString: return dataViewTag;
        case mapCtorString: return mapTag;
        case promiseCtorString: return promiseTag;
        case setCtorString: return setTag;
        case weakMapCtorString: return weakMapTag;
      }
    }
    return result;
  };
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype(value) {
  var Ctor = value && value.constructor,
      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

  return value === proto;
}

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString(value) {
  return nativeObjectToString.call(value);
}

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to convert.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
var isArguments = baseIsArguments(function() { return arguments; }()) ? baseIsArguments : function(value) {
  return isObjectLike(value) && hasOwnProperty.call(value, 'callee') &&
    !propertyIsEnumerable.call(value, 'callee');
};

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/**
 * Checks if `value` is a buffer.
 *
 * @static
 * @memberOf _
 * @since 4.3.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
 * @example
 *
 * _.isBuffer(new Buffer(2));
 * // => true
 *
 * _.isBuffer(new Uint8Array(2));
 * // => false
 */
var isBuffer = nativeIsBuffer || stubFalse;

/**
 * Performs a deep comparison between two values to determine if they are
 * equivalent.
 *
 * **Note:** This method supports comparing arrays, array buffers, booleans,
 * date objects, error objects, maps, numbers, `Object` objects, regexes,
 * sets, strings, symbols, and typed arrays. `Object` objects are compared
 * by their own, not inherited, enumerable properties. Functions and DOM
 * nodes are compared by strict equality, i.e. `===`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.isEqual(object, other);
 * // => true
 *
 * object === other;
 * // => false
 */
function isEqual(value, other) {
  return baseIsEqual(value, other);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  if (!isObject(value)) {
    return false;
  }
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 9 which returns 'object' for typed arrays and other constructors.
  var tag = baseGetTag(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

/**
 * This method returns a new empty array.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {Array} Returns the new empty array.
 * @example
 *
 * var arrays = _.times(2, _.stubArray);
 *
 * console.log(arrays);
 * // => [[], []]
 *
 * console.log(arrays[0] === arrays[1]);
 * // => false
 */
function stubArray() {
  return [];
}

/**
 * This method returns `false`.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {boolean} Returns `false`.
 * @example
 *
 * _.times(2, _.stubFalse);
 * // => [false, false]
 */
function stubFalse() {
  return false;
}

module.exports = isEqual;


/***/ }),

/***/ 5047:
/***/ (function(module) {

/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var runtime = (function (exports) {
  "use strict";

  var Op = Object.prototype;
  var hasOwn = Op.hasOwnProperty;
  var undefined; // More compressible than void 0.
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  function define(obj, key, value) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
    return obj[key];
  }
  try {
    // IE 8 has a broken Object.defineProperty that only works on DOM objects.
    define({}, "");
  } catch (err) {
    define = function(obj, key, value) {
      return obj[key] = value;
    };
  }

  function wrap(innerFn, outerFn, self, tryLocsList) {
    // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);

    // The ._invoke method unifies the implementations of the .next,
    // .throw, and .return methods.
    generator._invoke = makeInvokeMethod(innerFn, self, context);

    return generator;
  }
  exports.wrap = wrap;

  // Try/catch helper to minimize deoptimizations. Returns a completion
  // record like context.tryEntries[i].completion. This interface could
  // have been (and was previously) designed to take a closure to be
  // invoked without arguments, but in all the cases we care about we
  // already have an existing method we want to call, so there's no need
  // to create a new function object. We can even get away with assuming
  // the method takes exactly one argument, since that happens to be true
  // in every case, so we don't have to touch the arguments object. The
  // only additional allocation required is the completion record, which
  // has a stable shape and so hopefully should be cheap to allocate.
  function tryCatch(fn, obj, arg) {
    try {
      return { type: "normal", arg: fn.call(obj, arg) };
    } catch (err) {
      return { type: "throw", arg: err };
    }
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  // Dummy constructor functions that we use as the .constructor and
  // .constructor.prototype properties for functions that return Generator
  // objects. For full spec compliance, you may wish to configure your
  // minifier not to mangle the names of these two functions.
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  // This is a polyfill for %IteratorPrototype% for environments that
  // don't natively support it.
  var IteratorPrototype = {};
  IteratorPrototype[iteratorSymbol] = function () {
    return this;
  };

  var getProto = Object.getPrototypeOf;
  var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  if (NativeIteratorPrototype &&
      NativeIteratorPrototype !== Op &&
      hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
    // This environment has a native %IteratorPrototype%; use it instead
    // of the polyfill.
    IteratorPrototype = NativeIteratorPrototype;
  }

  var Gp = GeneratorFunctionPrototype.prototype =
    Generator.prototype = Object.create(IteratorPrototype);
  GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
  GeneratorFunctionPrototype.constructor = GeneratorFunction;
  GeneratorFunction.displayName = define(
    GeneratorFunctionPrototype,
    toStringTagSymbol,
    "GeneratorFunction"
  );

  // Helper for defining the .next, .throw, and .return methods of the
  // Iterator interface in terms of a single ._invoke method.
  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function(method) {
      define(prototype, method, function(arg) {
        return this._invoke(method, arg);
      });
    });
  }

  exports.isGeneratorFunction = function(genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor
      ? ctor === GeneratorFunction ||
        // For the native GeneratorFunction constructor, the best we can
        // do is to check its .name property.
        (ctor.displayName || ctor.name) === "GeneratorFunction"
      : false;
  };

  exports.mark = function(genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      define(genFun, toStringTagSymbol, "GeneratorFunction");
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  // Within the body of any async function, `await x` is transformed to
  // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
  // `hasOwn.call(value, "__await")` to determine if the yielded value is
  // meant to be awaited.
  exports.awrap = function(arg) {
    return { __await: arg };
  };

  function AsyncIterator(generator, PromiseImpl) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") {
        reject(record.arg);
      } else {
        var result = record.arg;
        var value = result.value;
        if (value &&
            typeof value === "object" &&
            hasOwn.call(value, "__await")) {
          return PromiseImpl.resolve(value.__await).then(function(value) {
            invoke("next", value, resolve, reject);
          }, function(err) {
            invoke("throw", err, resolve, reject);
          });
        }

        return PromiseImpl.resolve(value).then(function(unwrapped) {
          // When a yielded Promise is resolved, its final value becomes
          // the .value of the Promise<{value,done}> result for the
          // current iteration.
          result.value = unwrapped;
          resolve(result);
        }, function(error) {
          // If a rejected Promise was yielded, throw the rejection back
          // into the async generator function so it can be handled there.
          return invoke("throw", error, resolve, reject);
        });
      }
    }

    var previousPromise;

    function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new PromiseImpl(function(resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise =
        // If enqueue has been called before, then we want to wait until
        // all previous Promises have been resolved before calling invoke,
        // so that results are always delivered in the correct order. If
        // enqueue has not been called before, then it is important to
        // call invoke immediately, without waiting on a callback to fire,
        // so that the async generator function has the opportunity to do
        // any necessary setup in a predictable way. This predictability
        // is why the Promise constructor synchronously invokes its
        // executor callback, and why async functions synchronously
        // execute code before the first await. Since we implement simple
        // async functions in terms of async generators, it is especially
        // important to get this right, even though it requires care.
        previousPromise ? previousPromise.then(
          callInvokeWithMethodAndArg,
          // Avoid propagating failures to Promises returned by later
          // invocations of the iterator.
          callInvokeWithMethodAndArg
        ) : callInvokeWithMethodAndArg();
    }

    // Define the unified helper method that is used to implement .next,
    // .throw, and .return (see defineIteratorMethods).
    this._invoke = enqueue;
  }

  defineIteratorMethods(AsyncIterator.prototype);
  AsyncIterator.prototype[asyncIteratorSymbol] = function () {
    return this;
  };
  exports.AsyncIterator = AsyncIterator;

  // Note that simple async functions are implemented on top of
  // AsyncIterator objects; they just return a Promise for the value of
  // the final result produced by the iterator.
  exports.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
    if (PromiseImpl === void 0) PromiseImpl = Promise;

    var iter = new AsyncIterator(
      wrap(innerFn, outerFn, self, tryLocsList),
      PromiseImpl
    );

    return exports.isGeneratorFunction(outerFn)
      ? iter // If outerFn is a generator, return the full iterator.
      : iter.next().then(function(result) {
          return result.done ? result.value : iter.next();
        });
  };

  function makeInvokeMethod(innerFn, self, context) {
    var state = GenStateSuspendedStart;

    return function invoke(method, arg) {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        if (method === "throw") {
          throw arg;
        }

        // Be forgiving, per 25.3.3.3.3 of the spec:
        // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
        return doneResult();
      }

      context.method = method;
      context.arg = arg;

      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          var delegateResult = maybeInvokeDelegate(delegate, context);
          if (delegateResult) {
            if (delegateResult === ContinueSentinel) continue;
            return delegateResult;
          }
        }

        if (context.method === "next") {
          // Setting context._sent for legacy support of Babel's
          // function.sent implementation.
          context.sent = context._sent = context.arg;

        } else if (context.method === "throw") {
          if (state === GenStateSuspendedStart) {
            state = GenStateCompleted;
            throw context.arg;
          }

          context.dispatchException(context.arg);

        } else if (context.method === "return") {
          context.abrupt("return", context.arg);
        }

        state = GenStateExecuting;

        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          // If an exception is thrown from innerFn, we leave state ===
          // GenStateExecuting and loop back for another invocation.
          state = context.done
            ? GenStateCompleted
            : GenStateSuspendedYield;

          if (record.arg === ContinueSentinel) {
            continue;
          }

          return {
            value: record.arg,
            done: context.done
          };

        } else if (record.type === "throw") {
          state = GenStateCompleted;
          // Dispatch the exception by looping back around to the
          // context.dispatchException(context.arg) call above.
          context.method = "throw";
          context.arg = record.arg;
        }
      }
    };
  }

  // Call delegate.iterator[context.method](context.arg) and handle the
  // result, either by returning a { value, done } result from the
  // delegate iterator, or by modifying context.method and context.arg,
  // setting context.delegate to null, and returning the ContinueSentinel.
  function maybeInvokeDelegate(delegate, context) {
    var method = delegate.iterator[context.method];
    if (method === undefined) {
      // A .throw or .return when the delegate iterator has no .throw
      // method always terminates the yield* loop.
      context.delegate = null;

      if (context.method === "throw") {
        // Note: ["return"] must be used for ES3 parsing compatibility.
        if (delegate.iterator["return"]) {
          // If the delegate iterator has a return method, give it a
          // chance to clean up.
          context.method = "return";
          context.arg = undefined;
          maybeInvokeDelegate(delegate, context);

          if (context.method === "throw") {
            // If maybeInvokeDelegate(context) changed context.method from
            // "return" to "throw", let that override the TypeError below.
            return ContinueSentinel;
          }
        }

        context.method = "throw";
        context.arg = new TypeError(
          "The iterator does not provide a 'throw' method");
      }

      return ContinueSentinel;
    }

    var record = tryCatch(method, delegate.iterator, context.arg);

    if (record.type === "throw") {
      context.method = "throw";
      context.arg = record.arg;
      context.delegate = null;
      return ContinueSentinel;
    }

    var info = record.arg;

    if (! info) {
      context.method = "throw";
      context.arg = new TypeError("iterator result is not an object");
      context.delegate = null;
      return ContinueSentinel;
    }

    if (info.done) {
      // Assign the result of the finished delegate to the temporary
      // variable specified by delegate.resultName (see delegateYield).
      context[delegate.resultName] = info.value;

      // Resume execution at the desired location (see delegateYield).
      context.next = delegate.nextLoc;

      // If context.method was "throw" but the delegate handled the
      // exception, let the outer generator proceed normally. If
      // context.method was "next", forget context.arg since it has been
      // "consumed" by the delegate iterator. If context.method was
      // "return", allow the original .return call to continue in the
      // outer generator.
      if (context.method !== "return") {
        context.method = "next";
        context.arg = undefined;
      }

    } else {
      // Re-yield the result returned by the delegate method.
      return info;
    }

    // The delegate iterator is finished, so forget it and continue with
    // the outer generator.
    context.delegate = null;
    return ContinueSentinel;
  }

  // Define Generator.prototype.{next,throw,return} in terms of the
  // unified ._invoke helper method.
  defineIteratorMethods(Gp);

  define(Gp, toStringTagSymbol, "Generator");

  // A Generator should always return itself as the iterator object when the
  // @@iterator function is called on it. Some browsers' implementations of the
  // iterator prototype chain incorrectly implement this, causing the Generator
  // object to not be returned from this call. This ensures that doesn't happen.
  // See https://github.com/facebook/regenerator/issues/274 for more details.
  Gp[iteratorSymbol] = function() {
    return this;
  };

  Gp.toString = function() {
    return "[object Generator]";
  };

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };

    if (1 in locs) {
      entry.catchLoc = locs[1];
    }

    if (2 in locs) {
      entry.finallyLoc = locs[2];
      entry.afterLoc = locs[3];
    }

    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  function Context(tryLocsList) {
    // The root entry object (effectively a try statement without a catch
    // or a finally block) gives us a place to store values thrown from
    // locations where there is no enclosing try statement.
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  exports.keys = function(object) {
    var keys = [];
    for (var key in object) {
      keys.push(key);
    }
    keys.reverse();

    // Rather than returning an object with a next method, we keep
    // things simple and return the next function itself.
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) {
          next.value = key;
          next.done = false;
          return next;
        }
      }

      // To avoid creating an additional object, we just hang the .value
      // and .done properties off the next function object itself. This
      // also ensures that the minifier will not anonymize the function.
      next.done = true;
      return next;
    };
  };

  function values(iterable) {
    if (iterable) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) {
        return iteratorMethod.call(iterable);
      }

      if (typeof iterable.next === "function") {
        return iterable;
      }

      if (!isNaN(iterable.length)) {
        var i = -1, next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) {
              next.value = iterable[i];
              next.done = false;
              return next;
            }
          }

          next.value = undefined;
          next.done = true;

          return next;
        };

        return next.next = next;
      }
    }

    // Return an iterator with no values.
    return { next: doneResult };
  }
  exports.values = values;

  function doneResult() {
    return { value: undefined, done: true };
  }

  Context.prototype = {
    constructor: Context,

    reset: function(skipTempReset) {
      this.prev = 0;
      this.next = 0;
      // Resetting context._sent for legacy support of Babel's
      // function.sent implementation.
      this.sent = this._sent = undefined;
      this.done = false;
      this.delegate = null;

      this.method = "next";
      this.arg = undefined;

      this.tryEntries.forEach(resetTryEntry);

      if (!skipTempReset) {
        for (var name in this) {
          // Not sure about the optimal order of these conditions:
          if (name.charAt(0) === "t" &&
              hasOwn.call(this, name) &&
              !isNaN(+name.slice(1))) {
            this[name] = undefined;
          }
        }
      }
    },

    stop: function() {
      this.done = true;

      var rootEntry = this.tryEntries[0];
      var rootRecord = rootEntry.completion;
      if (rootRecord.type === "throw") {
        throw rootRecord.arg;
      }

      return this.rval;
    },

    dispatchException: function(exception) {
      if (this.done) {
        throw exception;
      }

      var context = this;
      function handle(loc, caught) {
        record.type = "throw";
        record.arg = exception;
        context.next = loc;

        if (caught) {
          // If the dispatched exception was caught by a catch block,
          // then let that catch block handle the exception normally.
          context.method = "next";
          context.arg = undefined;
        }

        return !! caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        var record = entry.completion;

        if (entry.tryLoc === "root") {
          // Exception thrown outside of any try block that could handle
          // it, so set the completion value of the entire function to
          // throw the exception.
          return handle("end");
        }

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            } else if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            }

          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else {
            throw new Error("try statement without catch or finally");
          }
        }
      }
    },

    abrupt: function(type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev &&
            hasOwn.call(entry, "finallyLoc") &&
            this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      if (finallyEntry &&
          (type === "break" ||
           type === "continue") &&
          finallyEntry.tryLoc <= arg &&
          arg <= finallyEntry.finallyLoc) {
        // Ignore the finally entry if control is not jumping to a
        // location outside the try/catch block.
        finallyEntry = null;
      }

      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type;
      record.arg = arg;

      if (finallyEntry) {
        this.method = "next";
        this.next = finallyEntry.finallyLoc;
        return ContinueSentinel;
      }

      return this.complete(record);
    },

    complete: function(record, afterLoc) {
      if (record.type === "throw") {
        throw record.arg;
      }

      if (record.type === "break" ||
          record.type === "continue") {
        this.next = record.arg;
      } else if (record.type === "return") {
        this.rval = this.arg = record.arg;
        this.method = "return";
        this.next = "end";
      } else if (record.type === "normal" && afterLoc) {
        this.next = afterLoc;
      }

      return ContinueSentinel;
    },

    finish: function(finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) {
          this.complete(entry.completion, entry.afterLoc);
          resetTryEntry(entry);
          return ContinueSentinel;
        }
      }
    },

    "catch": function(tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") {
            var thrown = record.arg;
            resetTryEntry(entry);
          }
          return thrown;
        }
      }

      // The context.catch method must only be called with a location
      // argument that corresponds to a known catch block.
      throw new Error("illegal catch attempt");
    },

    delegateYield: function(iterable, resultName, nextLoc) {
      this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      };

      if (this.method === "next") {
        // Deliberately forget the last sent value so that we don't
        // accidentally pass it on to the delegate.
        this.arg = undefined;
      }

      return ContinueSentinel;
    }
  };

  // Regardless of whether this script is executing as a CommonJS module
  // or not, return the runtime object so that we can declare the variable
  // regeneratorRuntime in the outer scope, which allows this module to be
  // injected easily by `bin/regenerator --include-runtime script.js`.
  return exports;

}(
  // If this script is executing as a CommonJS module, use module.exports
  // as the regeneratorRuntime namespace. Otherwise create a new empty
  // object. Either way, the resulting object will be used to initialize
  // the regeneratorRuntime variable at the top of this file.
   true ? module.exports : 0
));

try {
  regeneratorRuntime = runtime;
} catch (accidentalStrictMode) {
  // This module should not be running in strict mode, so the above
  // assignment should always work unless something is misconfigured. Just
  // in case runtime.js accidentally runs in strict mode, we can escape
  // strict mode using a global Function call. This could conceivably fail
  // if a Content Security Policy forbids using Function, but in that case
  // the proper solution is to fix the accidental strict mode problem. If
  // you've misconfigured your bundler to force strict mode and applied a
  // CSP to forbid Function, and you're not willing to fix either of those
  // problems, please detail your unique predicament in a GitHub issue.
  Function("r", "regeneratorRuntime = r")(runtime);
}


/***/ }),

/***/ 8053:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8053__;

/***/ }),

/***/ 6810:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__6810__;

/***/ }),

/***/ 6812:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__6812__;

/***/ }),

/***/ 8653:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8653__;

/***/ }),

/***/ 3797:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__3797__;

/***/ }),

/***/ 253:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__253__;

/***/ }),

/***/ 1605:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__1605__;

/***/ }),

/***/ 8208:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8208__;

/***/ }),

/***/ 2834:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__2834__;

/***/ }),

/***/ 8275:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8275__;

/***/ }),

/***/ 3360:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__3360__;

/***/ }),

/***/ 8305:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8305__;

/***/ }),

/***/ 4320:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__4320__;

/***/ }),

/***/ 4680:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__4680__;

/***/ }),

/***/ 3140:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__3140__;

/***/ }),

/***/ 3907:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__3907__;

/***/ }),

/***/ 9633:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__9633__;

/***/ }),

/***/ 2330:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__2330__;

/***/ }),

/***/ 9576:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__9576__;

/***/ }),

/***/ 4241:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__4241__;

/***/ }),

/***/ 390:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__390__;

/***/ }),

/***/ 8473:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8473__;

/***/ }),

/***/ 8867:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8867__;

/***/ }),

/***/ 8180:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8180__;

/***/ }),

/***/ 1009:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__1009__;

/***/ }),

/***/ 9415:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__9415__;

/***/ }),

/***/ 6197:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__6197__;

/***/ }),

/***/ 2829:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__2829__;

/***/ }),

/***/ 2831:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__2831__;

/***/ }),

/***/ 8172:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__8172__;

/***/ }),

/***/ 5559:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__5559__;

/***/ }),

/***/ 4004:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__4004__;

/***/ }),

/***/ 1767:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__1767__;

/***/ }),

/***/ 2694:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__2694__;

/***/ }),

/***/ 3174:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__3174__;

/***/ }),

/***/ 9910:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__9910__;

/***/ }),

/***/ 9702:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__9702__;

/***/ }),

/***/ 5167:
/***/ (function(module) {

"use strict";
module.exports = __WEBPACK_EXTERNAL_MODULE__5167__;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	!function() {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = function(module) {
/******/ 			var getter = module && module.__esModule ?
/******/ 				function() { return module['default']; } :
/******/ 				function() { return module; };
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	!function() {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = function(exports, definition) {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	!function() {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	!function() {
/******/ 		__webpack_require__.o = function(obj, prop) { return Object.prototype.hasOwnProperty.call(obj, prop); }
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	!function() {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = function(exports) {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	!function() {
/******/ 		__webpack_require__.nmd = function(module) {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	}();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
!function() {
"use strict";
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "Cache": function() { return /* reexport */ Cache; },
  "ERROR_CODES": function() { return /* reexport */ errorCodes; },
  "EVENTS": function() { return /* reexport */ events; },
  "ImageVolume": function() { return /* reexport */ ImageVolume; },
  "ORIENTATION": function() { return /* reexport */ orientation; },
  "RenderingEngine": function() { return /* reexport */ src_RenderingEngine; },
  "Scene": function() { return /* reexport */ RenderingEngine_Scene; },
  "Settings": function() { return /* reexport */ Settings; },
  "StackViewport": function() { return /* reexport */ RenderingEngine_StackViewport; },
  "Types": function() { return /* reexport */ types_namespaceObject; },
  "Utilities": function() { return /* reexport */ utilities_namespaceObject; },
  "VIEWPORT_TYPE": function() { return /* reexport */ viewportType; },
  "Viewport": function() { return /* reexport */ RenderingEngine_Viewport; },
  "VolumeViewport": function() { return /* reexport */ RenderingEngine_VolumeViewport; },
  "cache": function() { return /* reexport */ src_cache; },
  "cancelLoadAll": function() { return /* reexport */ cancelLoadAll; },
  "cancelLoadImage": function() { return /* reexport */ cancelLoadImage; },
  "cancelLoadImages": function() { return /* reexport */ cancelLoadImages; },
  "configuration": function() { return /* reexport */ src_configuration; },
  "createAndCacheVolume": function() { return /* reexport */ createAndCacheVolume; },
  "eventTarget": function() { return /* reexport */ src_eventTarget; },
  "getEnabledElement": function() { return /* reexport */ getEnabledElement; },
  "getRenderingEngine": function() { return /* reexport */ getRenderingEngine; },
  "getRenderingEngines": function() { return /* reexport */ getRenderingEngines; },
  "getVolume": function() { return /* binding */ getVolume; },
  "loadAndCacheImage": function() { return /* reexport */ loadAndCacheImage; },
  "loadAndCacheImages": function() { return /* reexport */ loadAndCacheImages; },
  "loadImage": function() { return /* reexport */ loadImage; },
  "metaData": function() { return /* reexport */ src_metaData; },
  "registerImageLoader": function() { return /* reexport */ registerImageLoader; },
  "registerUnknownImageLoader": function() { return /* reexport */ registerUnknownImageLoader; },
  "registerUnknownVolumeLoader": function() { return /* reexport */ registerUnknownVolumeLoader; },
  "registerVolumeLoader": function() { return /* reexport */ registerVolumeLoader; },
  "requestPoolManager": function() { return /* reexport */ requestPool_requestPoolManager; },
  "triggerEvent": function() { return /* reexport */ triggerEvent; },
  "unregisterAllImageLoaders": function() { return /* reexport */ unregisterAllImageLoaders; }
});

// NAMESPACE OBJECT: ./src/utilities/index.ts
var utilities_namespaceObject = {};
__webpack_require__.r(utilities_namespaceObject);
__webpack_require__.d(utilities_namespaceObject, {
  "createFloat32SharedArray": function() { return utilities_createFloat32SharedArray; },
  "createUint8SharedArray": function() { return utilities_createUint8SharedArray; },
  "getMinMax": function() { return getMinMax; },
  "imageIdToURI": function() { return imageIdToURI; },
  "invertRgbTransferFunction": function() { return invertRgbTransferFunction; },
  "isEqual": function() { return isEqual; },
  "scaleRgbTransferFunction": function() { return scaleRGBTransferFunction; },
  "triggerEvent": function() { return triggerEvent; },
  "uuidv4": function() { return uuidv4; }
});

// NAMESPACE OBJECT: ./src/types/index.ts
var types_namespaceObject = {};
__webpack_require__.r(types_namespaceObject);
__webpack_require__.d(types_namespaceObject, {
  "ActorEntry": function() { return IActor.ActorEntry; },
  "ICache": function() { return (ICache_default()); },
  "ICamera": function() { return (ICamera_default()); },
  "IEnabledElement": function() { return (IEnabledElement_default()); },
  "IImage": function() { return (IImage_default()); },
  "IImageVolume": function() { return (IImageVolume_default()); },
  "IRegisterImageLoader": function() { return (IRegisterImageLoader_default()); },
  "IStreamingImageVolume": function() { return (IStreamingImageVolume_default()); },
  "IStreamingVolume": function() { return (IStreamingVolume_default()); },
  "IViewport": function() { return (IViewport_default()); },
  "IVolume": function() { return (IVolume_default()); },
  "ImageLoadObject": function() { return ILoadObject.ImageLoadObject; },
  "ImageLoaderFn": function() { return (ImageLoaderFn_default()); },
  "LibraryConfiguration": function() { return (LibraryConfiguration_default()); },
  "Metadata": function() { return (Metadata_default()); },
  "Orientation": function() { return (Orientation_default()); },
  "Point2": function() { return (Point2_default()); },
  "Point3": function() { return (Point3_default()); },
  "PublicViewportInput": function() { return IViewport.PublicViewportInput; },
  "VOI": function() { return (voi_default()); },
  "VOIRange": function() { return voi.VOIRange; },
  "ViewportInput": function() { return IViewport.ViewportInput; },
  "ViewportInputOptions": function() { return (ViewportInputOptions_default()); },
  "VolumeActor": function() { return IActor.VolumeActor; },
  "VolumeLoadObject": function() { return ILoadObject.VolumeLoadObject; },
  "VolumeLoaderFn": function() { return (VolumeLoaderFn_default()); }
});

;// CONCATENATED MODULE: ./src/enums/events.ts
/**
 *
 */
var Events;

(function (Events) {
  Events["CAMERA_MODIFIED"] = "cornerstonecameramodified";
  Events["VOI_MODIFIED"] = "cornerstonevoimodified";
  Events["ELEMENT_DISABLED"] = "cornerstoneelementdisabled";
  Events["ELEMENT_ENABLED"] = "cornerstoneelementenabled";
  Events["IMAGE_RENDERED"] = "cornerstoneimagerendered";
  Events["IMAGE_VOLUME_MODIFIED"] = "cornerstoneimagevolumemodified";
  Events["IMAGE_LOADED"] = "cornerstoneimageloaded";
  Events["VOLUME_LOADED"] = "cornerstonevolumeloaded";
  Events["ELEMENT_RESIZED"] = "cornerstoneelementresized";
  Events["NEW_IMAGE"] = "cornerstonenewimage";
  Events["PRE_RENDER"] = "cornerstoneprerender";
  Events["IMAGE_CACHE_IMAGE_ADDED"] = "cornerstoneimagecacheimageadded";
  Events["IMAGE_CACHE_IMAGE_REMOVED"] = "cornerstoneimagecacheimageremoved";
  Events["IMAGE_CACHE_VOLUME_ADDED"] = "cornerstoneimagecachevolumeadded";
  Events["IMAGE_CACHE_VOLUME_REMOVED"] = "cornerstoneimagecachevolumeremoved";
  Events["IMAGE_CACHE_FULL"] = "cornerstoneimagecachefull";
  Events["IMAGE_LOAD_FAILED"] = "cornerstoneimageloadfailed";
  Events["STACK_NEW_IMAGE"] = "cornerstonenewimageinstack";
})(Events || (Events = {}));

/* harmony default export */ var events = (Events);
;// CONCATENATED MODULE: ./src/enums/errorCodes.ts
/**
 * Exceptions/Error Messages that the library raises.
 */
var ERROR_CODES;

(function (ERROR_CODES) {
  ERROR_CODES["CACHE_SIZE_EXCEEDED"] = "CACHE_SIZE_EXCEEDED";
  ERROR_CODES["IMAGE_LOAD_ERROR"] = "IMAGE_LOAD_ERROR";
})(ERROR_CODES || (ERROR_CODES = {}));

/* harmony default export */ var errorCodes = (ERROR_CODES);
;// CONCATENATED MODULE: ./src/constants/orientation.ts
/**
 * Convenient reference values often used to set a specific orientation
 * when using RenderingEngine's setViewports method.
 *
 * @remarks
 * Each constant is an object with two properties.
 * - `viewUp` - An array of three floating point numbers describing a vector
 *  that represents the up direction for the view.
 * - `sliceNormal` - The direction of the projection
 *
 * These values may make slightly more sense when we peel back the curtains of
 * our solution and look at the camera that's leveraging these values.
 *
 * @see {@link https://faculty.washington.edu/chudler/slice.html|Axial vs Sagittal vs Coronal}
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_Camera.html|VTK.js: Rendering_Core_Camera}
 * @example
 * Using ORIENTATION constant to set a viewport to use an Axial orientation
 * ```
 * renderingEngine.setViewports([
 *  {
 *    sceneUID: 'a-scene-uid',
 *    viewportUID: 'a-viewport-uid',
 *    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
 *    canvas: document.querySelector('div.canvas-container'),
 *    defaultOptions: {
 *      // 👇 Leveraging our reference constant
 *      orientation: ORIENTATION.AXIAL,
 *      background: [1, 0, 0],
 *    },
 *  }]);
 * ```
 */
var ORIENTATION = {
  AXIAL: {
    sliceNormal: [0, 0, -1],
    viewUp: [0, -1, 0]
  },
  SAGITTAL: {
    sliceNormal: [1, 0, 0],
    viewUp: [0, 0, 1]
  },
  CORONAL: {
    sliceNormal: [0, 1, 0],
    viewUp: [0, 0, 1]
  }
};
Object.freeze(ORIENTATION);
/* harmony default export */ var orientation = (ORIENTATION);
;// CONCATENATED MODULE: ./src/constants/viewportType.ts
var ViewportType = {
  STACK: 'stack',
  PERSPECTIVE: 'perspective',
  ORTHOGRAPHIC: 'orthographic'
};
Object.freeze(ViewportType);
/* harmony default export */ var viewportType = (ViewportType);
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;

  for (var i = 0, arr2 = new Array(len); i < len; i++) {
    arr2[i] = arr[i];
  }

  return arr2;
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/arrayWithoutHoles.js

function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr)) return _arrayLikeToArray(arr);
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/iterableToArray.js
function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/unsupportedIterableToArray.js

function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/nonIterableSpread.js
function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/toConsumableArray.js




function _toConsumableArray(arr) {
  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/classCallCheck.js
function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/createClass.js
function _defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ("value" in descriptor) descriptor.writable = true;
    Object.defineProperty(target, descriptor.key, descriptor);
  }
}

function _createClass(Constructor, protoProps, staticProps) {
  if (protoProps) _defineProperties(Constructor.prototype, protoProps);
  if (staticProps) _defineProperties(Constructor, staticProps);
  return Constructor;
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/defineProperty.js
function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}
;// CONCATENATED MODULE: ./src/RenderingEngine/renderingEngineCache.ts
var cache = {};
var renderingEngineCache = {
  /**
   * @method get Returns the `RenderingEngine` instance with the given `uid`.
   *
   * @param {string} uid The `uid` of the `RenderingEngine` instance to fetch.
   * @returns {RenderingEngine} The `RenderingEngine` instance.
   */
  get: function get(uid) {
    return cache[uid];
  },

  /**
   * @method set Adds the `RenderingEngine` instance to the cache.
   *
   * @param {RenderingEngine} The `RenderingEngine` to add.
   */
  set: function set(re) {
    var uid = re.uid;
    cache[uid] = re;
  },

  /**
   * @method delete Deletes the `RenderingEngine` instance from the cache.
   *
   * @param {uid} uid The `uid` of the `RenderingEngine` instance to delete.
   * @returns {boolean} True if the delete was successful.
   */
  delete: function _delete(uid) {
    return delete cache[uid];
  },
  getAll: function getAll() {
    var uids = Object.keys(cache);
    var renderingEngines = uids.map(function (uid) {
      return cache[uid];
    });
    return renderingEngines;
  }
};
/* harmony default export */ var RenderingEngine_renderingEngineCache = (renderingEngineCache);
;// CONCATENATED MODULE: ./src/eventTarget.ts




/**
 * EventTarget - Provides the [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) interface
 */
var CornerstoneEventTarget = /*#__PURE__*/function () {
  function CornerstoneEventTarget() {
    _classCallCheck(this, CornerstoneEventTarget);

    _defineProperty(this, "listeners", void 0);

    this.listeners = {};
  }

  _createClass(CornerstoneEventTarget, [{
    key: "addEventListener",
    value: function addEventListener(type, callback) {
      if (!this.listeners[type]) {
        this.listeners[type] = [];
      }

      this.listeners[type].push(callback);
    }
  }, {
    key: "removeEventListener",
    value: function removeEventListener(type, callback) {
      if (!this.listeners[type]) {
        return;
      }

      var stack = this.listeners[type];
      var stackLength = stack.length;

      for (var i = 0; i < stackLength; i++) {
        if (stack[i] === callback) {
          stack.splice(i, 1);
          return;
        }
      }
    }
  }, {
    key: "dispatchEvent",
    value: function dispatchEvent(event) {
      if (!this.listeners[event.type]) {
        //console.warn(`Skipping dispatch since there are no listeners for ${event.type}`);
        return;
      }

      var stack = this.listeners[event.type];
      var stackLength = stack.length;

      for (var i = 0; i < stackLength; i++) {
        stack[i].call(this, event);
      }

      return !event.defaultPrevented;
    }
  }]);

  return CornerstoneEventTarget;
}();

var eventTarget = new CornerstoneEventTarget();
/* harmony default export */ var src_eventTarget = (eventTarget);
;// CONCATENATED MODULE: ./src/utilities/invertRgbTransferFunction.ts
/**
 * A utility that can be used to invert (in place) an RgbTransferFunction.
 *
 * @example
 * Grabbing a reference to the RGB Transfer function from the scene:
 * ```
 * const rgbTransferFunction = scene
 *   .getVolumeActor()
 *   .getProperty()
 *   .getRGBTransferFunction(0);
 *
 * rgbTransferFunction.setRange(0, 5);
 *
 * invertRgbTransferFunction(rgbTransferFunction);
 * ```
 *
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_ColorTransferFunction.html|VTK.js: ColorTransferFunction}
 * @param rgbTransferFunction
 */
function invertRgbTransferFunction(rgbTransferFunction) {
  var size = rgbTransferFunction.getSize();

  for (var index = 0; index < size; index++) {
    var nodeValue1 = [];
    rgbTransferFunction.getNodeValue(index, nodeValue1);
    nodeValue1[1] = 1 - nodeValue1[1];
    nodeValue1[2] = 1 - nodeValue1[2];
    nodeValue1[3] = 1 - nodeValue1[3];
    rgbTransferFunction.setNodeValue(index, nodeValue1);
  }
}
;// CONCATENATED MODULE: ./src/utilities/scaleRgbTransferFunction.ts
/**
 * A utility that can be used to scale (in place) an RgbTransferFunction. We
 * often use this to scale the transfer function based on a PET calculation.
 *
 * @example
 * Grabbing a reference to the RGB Transfer function from the scene:
 * ```
 * const rgbTransferFunction = scene
 *   .getVolumeActor()
 *   .getProperty()
 *   .getRGBTransferFunction(0);
 *
 * scaleRgbTransferFunction(rgbTransferFunction, 2);
 * ```
 *
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_ColorTransferFunction.html|VTK.js: ColorTransferFunction}
 * @param rgbTransferFunction
 * @param scalingFactor
 */
function scaleRGBTransferFunction(rgbTransferFunction, scalingFactor) {
  var size = rgbTransferFunction.getSize();

  for (var index = 0; index < size; index++) {
    var nodeValue1 = [];
    rgbTransferFunction.getNodeValue(index, nodeValue1);
    nodeValue1[1] = nodeValue1[1] * scalingFactor;
    nodeValue1[2] = nodeValue1[2] * scalingFactor;
    nodeValue1[3] = nodeValue1[3] * scalingFactor;
    rgbTransferFunction.setNodeValue(index, nodeValue1);
  }
}
;// CONCATENATED MODULE: ./src/utilities/triggerEvent.ts

/**
 * Small utility to trigger a custom event for a given EventTarget.
 *
 * @param el - The element or EventTarget to trigger the event upon
 * @param type - The event type name
 * @param detail - The event data to be sent
 * @returns false if event is cancelable and at least one of the event handlers
 * which received event called Event.preventDefault(). Otherwise it returns true.
 */

function triggerEvent() {
  var el = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : src_eventTarget;
  var type = arguments.length > 1 ? arguments[1] : undefined;
  var detail = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

  if (!type) {
    throw new Error('Event type was not defined');
  }

  var event = new CustomEvent(type, {
    detail: detail,
    cancelable: true
  });
  return el.dispatchEvent(event);
}
;// CONCATENATED MODULE: ./src/utilities/uuidv4.ts
// prettier-ignore
// @ts-nocheck

/**
 * Generates a unique id that has limited chance of collission
 *
 * @see {@link https://stackoverflow.com/a/2117523/1867984|StackOverflow: Source}
 * @returns a v4 compliant GUID
 */
function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
    return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
  });
}
;// CONCATENATED MODULE: ./src/utilities/getMinMax.ts
/**
 * Calculate the minimum and maximum values in an Array
 *
 * @param {Number[]} storedPixelData
 * @return {{min: Number, max: Number}}
 */
function getMinMax(storedPixelData) {
  // we always calculate the min max values since they are not always
  // present in DICOM and we don't want to trust them anyway as cornerstone
  // depends on us providing reliable values for these
  var min = storedPixelData[0];
  var max = storedPixelData[0];
  var storedPixel;
  var numPixels = storedPixelData.length;

  for (var index = 1; index < numPixels; index++) {
    storedPixel = storedPixelData[index];
    min = Math.min(min, storedPixel);
    max = Math.max(max, storedPixel);
  }

  return {
    min: min,
    max: max
  };
}
;// CONCATENATED MODULE: ./src/utilities/imageIdToURI.js.ts
/**
 * Removes the data loader scheme from the imageId
 *
 * @param {string} imageId Image ID
 * @returns {string} imageId without the data loader scheme
 * @memberof Cache
 */
function imageIdToURI(imageId) {
  var colonIndex = imageId.indexOf(':');
  return imageId.substring(colonIndex + 1);
}
;// CONCATENATED MODULE: ./src/utilities/isEqual.ts
/**
 * @function isEqual returns equal if the two vec3s are identical within the
 * given tolerance in each dimension.
 *
 * @param {Point3} v1 - The first 3 vector
 * @param {Point3} v2 - The second 3 vector.
 * @param {number} [tolerance = 1e-5] The acceptable tolerance.
 *
 * @returns {boolean} True if the two values are within the tolerance levels.
 */
function isEqual(v1, v2) {
  var tolerance = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1e-5;
  return Math.abs(v1[0] - v2[0]) < tolerance && Math.abs(v1[1] - v2[1]) < tolerance && Math.abs(v1[2] - v2[2]) < tolerance;
}
;// CONCATENATED MODULE: ./src/utilities/createUint8SharedArray.ts
/**
 * A helper function that creates a new Float32Array that utilized a shared
 * array buffer. This allows the array to be updated  simultaneously in
 * workers or the main thread. Depending on the system (the CPU, the OS, the Browser)
 * it can take a while until the change is propagated to all contexts.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer|MDN: SharedArrayBuffer}
 * @remarks
 * We use SharedArrayBuffers in our ImageCache class. It's what allows us to
 * stream data to build a volume. It's important to note that SharedArrayBuffer
 * does not work out of the box for all web browsers. In some, it is disabled
 * behind a flag; in others, it has been removed entirely.
 *
 * @example
 * Creating an array for a Volume with known dimensions:
 * ```
 * const dimensions = [512, 512, 25];
 * const scalarData = createUint8SharedArray(dimensions[0] * dimensions[1] * dimensions[2]);
 * ```
 *
 * @param length - frame size * number of frames
 * @returns a Uint8Array with an underlying SharedArrayBuffer
 * @public
 */
function createUint8SharedArray(length) {
  var sharedArrayBuffer = new SharedArrayBuffer(length);
  return new Uint8Array(sharedArrayBuffer);
}

/* harmony default export */ var utilities_createUint8SharedArray = (createUint8SharedArray);
;// CONCATENATED MODULE: ./src/utilities/createFloat32SharedArray.ts
/**
 * A helper function that creates a new Float32Array that utilized a shared
 * array buffer. This allows the array to be updated  simultaneously in
 * workers or the main thread. Depending on the system (the CPU, the OS, the Browser)
 * it can take a while until the change is propagated to all contexts.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer|MDN: SharedArrayBuffer}
 * @remarks
 * We use SharedArrayBuffers in our ImageCache class. It's what allows us to
 * stream data to build a volume. It's important to note that SharedArrayBuffer
 * does not work out of the box for all web browsers. In some, it is disabled
 * behind a flag; in others, it has been removed entirely.
 *
 * @example
 * Creating an array for a Volume with known dimensions:
 * ```
 * const dimensions = [512, 512, 25];
 * const scalarData = createFloat32SharedArray(dimensions[0] * dimensions[1] * dimensions[2]);
 * ```
 *
 * @param length - frame size * number of frames
 * @returns a Float32Array with an underlying SharedArrayBuffer
 * @public
 */
function createFloat32SharedArray(length) {
  var sharedArrayBuffer = new SharedArrayBuffer(length * 4);
  return new Float32Array(sharedArrayBuffer);
}

/* harmony default export */ var utilities_createFloat32SharedArray = (createFloat32SharedArray);
;// CONCATENATED MODULE: ./src/utilities/index.ts










// EXTERNAL MODULE: external "vtk.js/Sources/macro"
var macro_ = __webpack_require__(9702);
var macro_default = /*#__PURE__*/__webpack_require__.n(macro_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/RenderWindow"
var RenderWindow_ = __webpack_require__(9415);
var RenderWindow_default = /*#__PURE__*/__webpack_require__.n(RenderWindow_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/SceneGraph/GenericWidgetRepresentation"
var GenericWidgetRepresentation_ = __webpack_require__(3174);
var GenericWidgetRepresentation_default = /*#__PURE__*/__webpack_require__.n(GenericWidgetRepresentation_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Actor"
var Actor_ = __webpack_require__(2330);
var Actor_default = /*#__PURE__*/__webpack_require__.n(Actor_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Actor2D"
var Actor2D_ = __webpack_require__(9576);
var Actor2D_default = /*#__PURE__*/__webpack_require__.n(Actor2D_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Camera"
var Camera_ = __webpack_require__(4241);
var Camera_default = /*#__PURE__*/__webpack_require__.n(Camera_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Glyph3DMapper"
var Glyph3DMapper_ = __webpack_require__(390);
var Glyph3DMapper_default = /*#__PURE__*/__webpack_require__.n(Glyph3DMapper_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/ImageMapper"
var ImageMapper_ = __webpack_require__(8473);
var ImageMapper_default = /*#__PURE__*/__webpack_require__.n(ImageMapper_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/ImageSlice"
var ImageSlice_ = __webpack_require__(8867);
var ImageSlice_default = /*#__PURE__*/__webpack_require__.n(ImageSlice_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/PixelSpaceCallbackMapper"
var PixelSpaceCallbackMapper_ = __webpack_require__(8180);
var PixelSpaceCallbackMapper_default = /*#__PURE__*/__webpack_require__.n(PixelSpaceCallbackMapper_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/PolyDataMapper"
var PolyDataMapper_ = __webpack_require__(1009);
var PolyDataMapper_default = /*#__PURE__*/__webpack_require__.n(PolyDataMapper_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Renderer"
var Renderer_ = __webpack_require__(6197);
var Renderer_default = /*#__PURE__*/__webpack_require__.n(Renderer_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Skybox"
var Skybox_ = __webpack_require__(2829);
var Skybox_default = /*#__PURE__*/__webpack_require__.n(Skybox_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/SphereMapper"
var SphereMapper_ = __webpack_require__(2831);
var SphereMapper_default = /*#__PURE__*/__webpack_require__.n(SphereMapper_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/StickMapper"
var StickMapper_ = __webpack_require__(8172);
var StickMapper_default = /*#__PURE__*/__webpack_require__.n(StickMapper_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Texture"
var Texture_ = __webpack_require__(5559);
var Texture_default = /*#__PURE__*/__webpack_require__.n(Texture_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Volume"
var Volume_ = __webpack_require__(1767);
var Volume_default = /*#__PURE__*/__webpack_require__.n(Volume_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/VolumeMapper"
var VolumeMapper_ = __webpack_require__(2694);
var VolumeMapper_default = /*#__PURE__*/__webpack_require__.n(VolumeMapper_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/SceneGraph/ViewNodeFactory"
var ViewNodeFactory_ = __webpack_require__(9910);
var ViewNodeFactory_default = /*#__PURE__*/__webpack_require__.n(ViewNodeFactory_);
// EXTERNAL MODULE: external {"root":"window","commonjs":"gl-matrix","commonjs2":"gl-matrix","amd":"gl-matrix"}
var external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_ = __webpack_require__(5167);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/OpenGL/Texture/Constants"
var Constants_ = __webpack_require__(4004);
// EXTERNAL MODULE: external "vtk.js/Sources/Common/Core/DataArray/Constants"
var DataArray_Constants_ = __webpack_require__(6810);
// EXTERNAL MODULE: external "vtk.js/Sources/Common/Core/DataArray"
var DataArray_ = __webpack_require__(8053);
var DataArray_default = /*#__PURE__*/__webpack_require__.n(DataArray_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/Property/Constants"
var Property_Constants_ = __webpack_require__(3360);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/VolumeMapper/Constants"
var VolumeMapper_Constants_ = __webpack_require__(9633);
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/vtkStreamingOpenGLVolumeMapper.js








var vtkWarningMacro = (macro_default()).vtkWarningMacro;
/**
 * vtkStreamingOpenGLVolumeMapper - A dervied class of the core vtkOpenGLVolumeMapper class.
 * This class  replaces the buildBufferObjects function so that we progressively upload our textures
 * into GPU memory uisng the new methods on vtkStreamingOpenGLTexture.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */

function vtkStreamingOpenGLVolumeMapper(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLVolumeMapper');
  /**
   * buildBufferObjects - A fork of vtkOpenGLVolumeMapper's buildBufferObjects method.
   * This fork performs most of the same actions, but builds the textures progressively using
   * vtkStreamingOpenGLTexture's methods, and also prevents recomputation of the texture for each
   * vtkStreamingOpenGLVolumeMapper using the texture.
   *
   *
   * @param {*} ren The renderer.
   * @param {*} actor The actor to build the buffer objects for.
   */

  publicAPI.buildBufferObjects = function (ren, actor) {
    var image = model.currentInput;

    if (image === null) {
      return;
    }

    var vprop = actor.getProperty();

    if (!model.jitterTexture.getHandle()) {
      var oTable = new Uint8Array(32 * 32);

      for (var i = 0; i < 32 * 32; ++i) {
        oTable[i] = 255.0 * Math.random();
      }

      model.jitterTexture.setMinificationFilter(Constants_.Filter.LINEAR);
      model.jitterTexture.setMagnificationFilter(Constants_.Filter.LINEAR);
      model.jitterTexture.create2DFromRaw(32, 32, 1, DataArray_Constants_.VtkDataTypes.UNSIGNED_CHAR, oTable);
    }

    var numComp = image.getPointData().getScalars().getNumberOfComponents();
    var iComps = vprop.getIndependentComponents();
    var numIComps = iComps ? numComp : 1; // rebuild opacity tfun?

    var toString = "".concat(vprop.getMTime());

    if (model.opacityTextureString !== toString) {
      var oWidth = 1024;
      var oSize = oWidth * 2 * numIComps;
      var ofTable = new Float32Array(oSize);
      var tmpTable = new Float32Array(oWidth);

      for (var c = 0; c < numIComps; ++c) {
        var ofun = vprop.getScalarOpacity(c);
        var opacityFactor = model.renderable.getSampleDistance() / vprop.getScalarOpacityUnitDistance(c);
        var oRange = ofun.getRange();
        ofun.getTable(oRange[0], oRange[1], oWidth, tmpTable, 1); // adjust for sample distance etc

        for (var _i = 0; _i < oWidth; ++_i) {
          ofTable[c * oWidth * 2 + _i] = 1.0 - Math.pow(1.0 - tmpTable[_i], opacityFactor);
          ofTable[c * oWidth * 2 + _i + oWidth] = ofTable[c * oWidth * 2 + _i];
        }
      }

      model.opacityTexture.releaseGraphicsResources(model.openGLRenderWindow);
      model.opacityTexture.setMinificationFilter(Constants_.Filter.LINEAR);
      model.opacityTexture.setMagnificationFilter(Constants_.Filter.LINEAR); // use float texture where possible because we really need the resolution
      // for this table. Errors in low values of opacity accumulate to
      // visible artifacts. High values of opacity quickly terminate without
      // artifacts.

      if (model.openGLRenderWindow.getWebgl2() || model.context.getExtension('OES_texture_float') && model.context.getExtension('OES_texture_float_linear')) {
        model.opacityTexture.create2DFromRaw(oWidth, 2 * numIComps, 1, DataArray_Constants_.VtkDataTypes.FLOAT, ofTable);
      } else {
        var _oTable = new Uint8Array(oSize);

        for (var _i2 = 0; _i2 < oSize; ++_i2) {
          _oTable[_i2] = 255.0 * ofTable[_i2];
        }

        model.opacityTexture.create2DFromRaw(oWidth, 2 * numIComps, 1, DataArray_Constants_.VtkDataTypes.UNSIGNED_CHAR, _oTable);
      }

      model.opacityTextureString = toString;
    } // rebuild color tfun?


    toString = "".concat(vprop.getMTime());

    if (model.colorTextureString !== toString) {
      var cWidth = 1024;
      var cSize = cWidth * 2 * numIComps * 3;
      var cTable = new Uint8Array(cSize);

      var _tmpTable = new Float32Array(cWidth * 3);

      for (var _c = 0; _c < numIComps; ++_c) {
        var cfun = vprop.getRGBTransferFunction(_c);
        var cRange = cfun.getRange();
        cfun.getTable(cRange[0], cRange[1], cWidth, _tmpTable, 1);

        for (var _i3 = 0; _i3 < cWidth * 3; ++_i3) {
          cTable[_c * cWidth * 6 + _i3] = 255.0 * _tmpTable[_i3];
          cTable[_c * cWidth * 6 + _i3 + cWidth * 3] = 255.0 * _tmpTable[_i3];
        }
      }

      model.colorTexture.releaseGraphicsResources(model.openGLRenderWindow);
      model.colorTexture.setMinificationFilter(Constants_.Filter.LINEAR);
      model.colorTexture.setMagnificationFilter(Constants_.Filter.LINEAR);
      model.colorTexture.create2DFromRaw(cWidth, 2 * numIComps, 3, DataArray_Constants_.VtkDataTypes.UNSIGNED_CHAR, cTable);
      model.colorTextureString = toString;
    } // rebuild the scalarTexture if the data has changed


    toString = "".concat(image.getMTime());

    if (model.scalarTextureString !== toString) {
      // Build the textures
      var dims = image.getDimensions();
      var previousTextureParameters = model.scalarTexture.getTextureParameters();
      var dataType = image.getPointData().getScalars().getDataType();
      var data = image.getPointData().getScalars().getData();
      var shouldReset = true;

      if (previousTextureParameters.dataType && previousTextureParameters.dataType === dataType) {
        var previousTextureSize = previousTextureParameters.width * previousTextureParameters.height * previousTextureParameters.depth * previousTextureParameters.numComps;

        if (data.length === previousTextureSize) {
          shouldReset = false;
        }
      }

      if (shouldReset) {
        model.scalarTexture.releaseGraphicsResources(model.openGLRenderWindow);
        model.scalarTexture.resetFormatAndType();
        model.scalarTexture.create3DFilterableFromRaw(dims[0], dims[1], dims[2], numComp, dataType, data);
      } else {
        model.scalarTexture.deactivate();
        model.scalarTexture.update3DFromRaw(data);
      }

      model.scalarTextureString = toString;
    }

    if (!model.tris.getCABO().getElementCount()) {
      // build the CABO
      var ptsArray = new Float32Array(12);

      for (var _i4 = 0; _i4 < 4; _i4++) {
        ptsArray[_i4 * 3] = _i4 % 2 * 2 - 1.0;
        ptsArray[_i4 * 3 + 1] = _i4 > 1 ? 1.0 : -1.0;
        ptsArray[_i4 * 3 + 2] = -1.0;
      }

      var cellArray = new Uint16Array(8);
      cellArray[0] = 3;
      cellArray[1] = 0;
      cellArray[2] = 1;
      cellArray[3] = 3;
      cellArray[4] = 3;
      cellArray[5] = 0;
      cellArray[6] = 3;
      cellArray[7] = 2;
      var points = DataArray_default().newInstance({
        numberOfComponents: 3,
        values: ptsArray
      });
      points.setName('points');
      var cells = DataArray_default().newInstance({
        numberOfComponents: 1,
        values: cellArray
      });
      model.tris.getCABO().createVBO(cells, 'polys', Property_Constants_.Representation.SURFACE, {
        points: points,
        cellOffset: 0
      });
    }

    model.VBOBuildTime.modified();
  };

  publicAPI.setCameraShaderParameters = function (cellBO, ren, actor) {
    var program = cellBO.getProgram();
    var cam = model.openGLCamera.getRenderable();
    var blendMode = actor.getMapper().getBlendMode();
    var slabThickness = cam.getSlabThickness();
    var crange = cam.getClippingRange();
    var defaultSlabThickness = null;
    var cameraMidpoint = (crange[1] + crange[0]) * 0.5; // if not equal to tiny slab thickness (i.e. it is defined as an actual
    // intended value), use slab thickness instead of clipping range

    if (blendMode !== VolumeMapper_Constants_.BlendMode.COMPOSITE_BLEND && slabThickness !== defaultSlabThickness) {
      crange[0] = cameraMidpoint - slabThickness;
      crange[1] = cameraMidpoint + slabThickness;
      cam.setSlabThicknessActive(true);
    } else {
      cam.setSlabThicknessActive(false);
    }

    program.setUniformf('camThick', crange[1] - crange[0]);
    program.setUniformf('camNear', crange[0]);
    program.setUniformf('camFar', crange[1]); // // [WMVP]C == {world, model, view, projection} coordinates
    // // E.g., WCPC == world to projection coordinate transformation

    var keyMats = model.openGLCamera.getKeyMatrices(ren);
    var actMats = model.openGLVolume.getKeyMatrices();
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.multiply(model.modelToView, keyMats.wcvc, actMats.mcwc);
    var bounds = model.currentInput.getBounds();
    var dims = model.currentInput.getDimensions(); // compute the viewport bounds of the volume
    // we will only render those fragments.

    var pos = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();
    var dir = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();
    var dcxmin = 1.0;
    var dcxmax = -1.0;
    var dcymin = 1.0;
    var dcymax = -1.0;

    for (var i = 0; i < 8; ++i) {
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos, bounds[i % 2], bounds[2 + Math.floor(i / 2) % 2], bounds[4 + Math.floor(i / 4)]);
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.transformMat4(pos, pos, model.modelToView);

      if (!cam.getParallelProjection()) {
        external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.normalize(dir, pos); // now find the projection of this point onto a
        // nearZ distance plane. Since the camera is at 0,0,0
        // in VC the ray is just t*pos and
        // t is -nearZ/dir.z
        // intersection becomes pos.x/pos.z

        var t = -crange[0] / pos[2];
        external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.scale(pos, dir, t);
      } // now convert to DC


      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.transformMat4(pos, pos, keyMats.vcpc);
      dcxmin = Math.min(pos[0], dcxmin);
      dcxmax = Math.max(pos[0], dcxmax);
      dcymin = Math.min(pos[1], dcymin);
      dcymax = Math.max(pos[1], dcymax);
    }

    program.setUniformf('dcxmin', dcxmin);
    program.setUniformf('dcxmax', dcxmax);
    program.setUniformf('dcymin', dcymin);
    program.setUniformf('dcymax', dcymax);

    if (program.isUniformUsed('cameraParallel')) {
      program.setUniformi('cameraParallel', cam.getParallelProjection());
    }

    var ext = model.currentInput.getExtent();
    var spc = model.currentInput.getSpacing();
    var vsize = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(vsize, (ext[1] - ext[0] + 1) * spc[0], (ext[3] - ext[2] + 1) * spc[1], (ext[5] - ext[4] + 1) * spc[2]);
    program.setUniform3f('vSpacing', spc[0], spc[1], spc[2]);
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos, ext[0], ext[2], ext[4]);
    model.currentInput.indexToWorldVec3(pos, pos);
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.transformMat4(pos, pos, model.modelToView);
    program.setUniform3f('vOriginVC', pos[0], pos[1], pos[2]); // apply the image directions

    var i2wmat4 = model.currentInput.getIndexToWorld();
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.multiply(model.idxToView, model.modelToView, i2wmat4);
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat3.multiply(model.idxNormalMatrix, keyMats.normalMatrix, actMats.normalMatrix);
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat3.multiply(model.idxNormalMatrix, model.idxNormalMatrix, model.currentInput.getDirection());
    var maxSamples = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.length(vsize) / model.renderable.getSampleDistance();

    if (maxSamples > model.renderable.getMaximumSamplesPerRay()) {
      vtkWarningMacro("The number of steps required ".concat(Math.ceil(maxSamples), " is larger than the\n        specified maximum number of steps ").concat(model.renderable.getMaximumSamplesPerRay(), ".\n        Please either change the\n        volumeMapper sampleDistance or its maximum number of samples."));
    }

    var vctoijk = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(vctoijk, 1.0, 1.0, 1.0);
    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.divide(vctoijk, vctoijk, vsize);
    program.setUniform3f('vVCToIJK', vctoijk[0], vctoijk[1], vctoijk[2]);
    program.setUniform3i('volumeDimensions', dims[0], dims[1], dims[2]);

    if (!model.openGLRenderWindow.getWebgl2()) {
      var volInfo = model.scalarTexture.getVolumeInfo();
      program.setUniformf('texWidth', model.scalarTexture.getWidth());
      program.setUniformf('texHeight', model.scalarTexture.getHeight());
      program.setUniformi('xreps', volInfo.xreps);
      program.setUniformi('xstride', volInfo.xstride);
      program.setUniformi('ystride', volInfo.ystride);
    } // map normals through normal matrix
    // then use a point on the plane to compute the distance


    var normal = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();
    var pos2 = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();

    for (var _i5 = 0; _i5 < 6; ++_i5) {
      switch (_i5) {
        default:
        case 0:
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(normal, 1.0, 0.0, 0.0);
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos2, ext[1], ext[3], ext[5]);
          break;

        case 1:
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(normal, -1.0, 0.0, 0.0);
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos2, ext[0], ext[2], ext[4]);
          break;

        case 2:
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(normal, 0.0, 1.0, 0.0);
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos2, ext[1], ext[3], ext[5]);
          break;

        case 3:
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(normal, 0.0, -1.0, 0.0);
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos2, ext[0], ext[2], ext[4]);
          break;

        case 4:
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(normal, 0.0, 0.0, 1.0);
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos2, ext[1], ext[3], ext[5]);
          break;

        case 5:
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(normal, 0.0, 0.0, -1.0);
          external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(pos2, ext[0], ext[2], ext[4]);
          break;
      }

      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.transformMat3(normal, normal, model.idxNormalMatrix);
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.transformMat4(pos2, pos2, model.idxToView);
      var dist = -1.0 * external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.dot(pos2, normal); // we have the plane in view coordinates
      // specify the planes in view coordinates

      program.setUniform3f("vPlaneNormal".concat(_i5), normal[0], normal[1], normal[2]);
      program.setUniformf("vPlaneDistance".concat(_i5), dist);

      if (actor.getProperty().getUseLabelOutline()) {
        var image = model.currentInput;
        var worldToIndex = image.getWorldToIndex();
        program.setUniformMatrix('vWCtoIDX', worldToIndex); // Get the projection coordinate to world coordinate transformation matrix.

        external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.invert(model.projectionToWorld, keyMats.wcpc);
        program.setUniformMatrix('PCWCMatrix', model.projectionToWorld);
        var size = publicAPI.getRenderTargetSize();
        program.setUniformf('vpWidth', size[0]);
        program.setUniformf('vpHeight', size[1]);
      }
    }

    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.invert(model.projectionToView, keyMats.vcpc);
    program.setUniformMatrix('PCVCMatrix', model.projectionToView); // handle lighting values

    switch (model.lastLightComplexity) {
      default:
      case 0:
        // no lighting, tcolor is fine as is
        break;

      case 1: // headlight

      case 2: // light kit

      case 3:
        {
          // positional not implemented fallback to directional
          // mat3.transpose(keyMats.normalMatrix, keyMats.normalMatrix);
          var lightNum = 0;
          var lightColor = [];
          ren.getLights().forEach(function (light) {
            var status = light.getSwitch();

            if (status > 0) {
              var dColor = light.getColor();
              var intensity = light.getIntensity();
              lightColor[0] = dColor[0] * intensity;
              lightColor[1] = dColor[1] * intensity;
              lightColor[2] = dColor[2] * intensity;
              program.setUniform3fArray("lightColor".concat(lightNum), lightColor);
              var ldir = light.getDirection();
              external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(normal, ldir[0], ldir[1], ldir[2]);
              external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.transformMat3(normal, normal, keyMats.normalMatrix);
              program.setUniform3f("lightDirectionVC".concat(lightNum), normal[0], normal[1], normal[2]); // camera DOP is 0,0,-1.0 in VC

              var halfAngle = [-0.5 * normal[0], -0.5 * normal[1], -0.5 * (normal[2] - 1.0)];
              program.setUniform3fArray("lightHalfAngleVC".concat(lightNum), halfAngle);
              lightNum++;
            }
          }); // mat3.transpose(keyMats.normalMatrix, keyMats.normalMatrix);
        }
    }
  };
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------


var DEFAULT_VALUES = {};
function extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, DEFAULT_VALUES, initialValues);
  VolumeMapper_default().extend(publicAPI, model, initialValues);
  model.scalarTexture = initialValues.scalarTexture;
  model.previousState = {}; // Object methods

  vtkStreamingOpenGLVolumeMapper(publicAPI, model);
} // ----------------------------------------------------------------------------

var newInstance = macro_default().newInstance(extend, 'vtkStreamingOpenGLVolumeMapper'); // ----------------------------------------------------------------------------

/* harmony default export */ var vtkClasses_vtkStreamingOpenGLVolumeMapper = ({
  newInstance: newInstance,
  extend: extend
});
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/vtkStreamingOpenGLViewNodeFactory.js



















/**
 * vtkStreamingOpenGLViewNodeFactory - A fork of the vtkOpenGLViewNodeFactory,
 * so that we can inject our custom derived "Streaming" classes.
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */

function vtkStreamingOpenGLViewNodeFactory(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkStreamingOpenGLViewNodeFactory');
  /**
   * createNode - fork of createNode from vtkOpenGLViewNodeFactory.
   * This fork is required to inject the properties from model.getModelInitialValues.
   *
   * @param {object} dataObject An instance of a vtk.js class.
   */

  publicAPI.createNode = function (dataObject) {
    if (dataObject.isDeleted()) {
      return null;
    }

    var cpt = 0;
    var className = dataObject.getClassName(cpt++);
    var isObject = false;
    var keys = Object.keys(model.overrides);

    while (className && !isObject) {
      if (keys.indexOf(className) !== -1) {
        isObject = true;
      } else {
        className = dataObject.getClassName(cpt++);
      }
    }

    if (!isObject) {
      return null;
    }

    var initialValues = model.getModelInitialValues(dataObject);
    var vn = model.overrides[className](initialValues);
    vn.setMyFactory(publicAPI);
    return vn;
  };
  /**
   * getModelInitialValues - This function allows us to pass textures down from our
   * vtkSharedVolumeMapper to new instances of vtkStreamingOpenGLVolumeMapper.
   * The prevents us from sharing memory.
   *
   * TODO: It would be beneficial to push similar, but generalized, functionality
   * back to vtk.js in the future.
   *
   * @param {object} dataObject An instance of a vtk.js class.
   */


  model.getModelInitialValues = function (dataObject) {
    var initialValues = {};
    var className = dataObject.getClassName();

    if (className === 'vtkSharedVolumeMapper') {
      initialValues.scalarTexture = dataObject.getScalarTexture();
    }

    return initialValues;
  };
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------


var vtkStreamingOpenGLViewNodeFactory_DEFAULT_VALUES = {}; // ----------------------------------------------------------------------------

function vtkStreamingOpenGLViewNodeFactory_extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, vtkStreamingOpenGLViewNodeFactory_DEFAULT_VALUES, initialValues); // Inheritance

  ViewNodeFactory_default().extend(publicAPI, model, initialValues); // Object methods

  vtkStreamingOpenGLViewNodeFactory(publicAPI, model); // Initialization

  publicAPI.registerOverride('vtkActor', (Actor_default()).newInstance);
  publicAPI.registerOverride('vtkActor2D', (Actor2D_default()).newInstance);
  publicAPI.registerOverride('vtkCamera', (Camera_default()).newInstance);
  publicAPI.registerOverride('vtkGlyph3DMapper', (Glyph3DMapper_default()).newInstance);
  publicAPI.registerOverride('vtkImageMapper', (ImageMapper_default()).newInstance);
  publicAPI.registerOverride('vtkImageSlice', (ImageSlice_default()).newInstance);
  publicAPI.registerOverride('vtkMapper', (PolyDataMapper_default()).newInstance);
  publicAPI.registerOverride('vtkPixelSpaceCallbackMapper', (PixelSpaceCallbackMapper_default()).newInstance);
  publicAPI.registerOverride('vtkRenderer', (Renderer_default()).newInstance);
  publicAPI.registerOverride('vtkSkybox', (Skybox_default()).newInstance);
  publicAPI.registerOverride('vtkSphereMapper', (SphereMapper_default()).newInstance);
  publicAPI.registerOverride('vtkStickMapper', (StickMapper_default()).newInstance);
  publicAPI.registerOverride('vtkTexture', (Texture_default()).newInstance);
  publicAPI.registerOverride('vtkVolume', (Volume_default()).newInstance);
  publicAPI.registerOverride('vtkVolumeMapper', (VolumeMapper_default()).newInstance);
  publicAPI.registerOverride('vtkSharedVolumeMapper', vtkClasses_vtkStreamingOpenGLVolumeMapper.newInstance);
  publicAPI.registerOverride('vtkWidgetRepresentation', (GenericWidgetRepresentation_default()).newInstance);
} // ----------------------------------------------------------------------------

var vtkStreamingOpenGLViewNodeFactory_newInstance = macro_default().newInstance(vtkStreamingOpenGLViewNodeFactory_extend, 'vtkStreamingOpenGLViewNodeFactory'); // ----------------------------------------------------------------------------

/* harmony default export */ var vtkClasses_vtkStreamingOpenGLViewNodeFactory = ({
  newInstance: vtkStreamingOpenGLViewNodeFactory_newInstance,
  extend: vtkStreamingOpenGLViewNodeFactory_extend
});
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/vtkStreamingOpenGLRenderWindow.js



/**
 * vtkStreamingOpenGLRenderWindow - A dervied class of the core vtkOpenGLRenderWindow class.
 * The main purpose for this class extension is to add in our own node factory, so we can use
 * our extended "streaming" classes for progressive texture loading.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */

function vtkStreamingOpenGLRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLRenderWindow');
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------


function vtkStreamingOpenGLRenderWindow_extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, initialValues);
  RenderWindow_default().extend(publicAPI, model, initialValues);
  model.myFactory = vtkClasses_vtkStreamingOpenGLViewNodeFactory.newInstance();
  /* eslint-disable no-use-before-define */

  model.myFactory.registerOverride('vtkRenderWindow', vtkStreamingOpenGLRenderWindow_newInstance);
  /* eslint-enable no-use-before-define */
  // Object methods

  vtkStreamingOpenGLRenderWindow(publicAPI, model);
} // ----------------------------------------------------------------------------

var vtkStreamingOpenGLRenderWindow_newInstance = macro_default().newInstance(vtkStreamingOpenGLRenderWindow_extend, 'vtkStreamingOpenGLRenderWindow'); // ----------------------------------------------------------------------------

/* harmony default export */ var vtkClasses_vtkStreamingOpenGLRenderWindow = ({
  newInstance: vtkStreamingOpenGLRenderWindow_newInstance,
  extend: vtkStreamingOpenGLRenderWindow_extend
});
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/Renderer"
var Core_Renderer_ = __webpack_require__(4680);
var Core_Renderer_default = /*#__PURE__*/__webpack_require__.n(Core_Renderer_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/RenderWindow"
var Core_RenderWindow_ = __webpack_require__(8305);
var Core_RenderWindow_default = /*#__PURE__*/__webpack_require__.n(Core_RenderWindow_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/RenderWindowInteractor"
var RenderWindowInteractor_ = __webpack_require__(4320);
var RenderWindowInteractor_default = /*#__PURE__*/__webpack_require__.n(RenderWindowInteractor_);
// EXTERNAL MODULE: external "vtk.js/Sources/Common/Core/Points"
var Points_ = __webpack_require__(3797);
// EXTERNAL MODULE: external "vtk.js/Sources/Common/DataModel/PolyData"
var PolyData_ = __webpack_require__(1605);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/Actor"
var Core_Actor_ = __webpack_require__(8208);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/Mapper"
var Mapper_ = __webpack_require__(8275);
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/vtkOffscreenMultiRenderWindow.js




 // Load basic classes for vtk() factory






/**
 * vtkOffscreenMultiRenderWindow - A class to deal with offscreen renderering with multiple renderers.
 *
 * This class is based on the vtkGenericRenderWindow with two key differences:
 * - the vtkGenericRenderWindow had a renderer at the top level, with helpers to get it from the renderWindow.
 *   although you could add more renderers, this gave special status to the first viewport. Which was confusing.
 * - When checking the size of the container element we no longer check the client size, as the canvas is offscreen.
 * - We aren't using interactor styles, so don't set one up.
 *
 * Additionally this class has some new helpers to easily add/associate renderers to different viewportUIDs.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */

function vtkOffscreenMultiRenderWindow(publicAPI, model) {
  // Capture resize trigger method to remove from publicAPI
  var invokeResize = publicAPI.invokeResize;
  delete publicAPI.invokeResize; // VTK renderWindow. No renderers set by default

  model.renderWindow = Core_RenderWindow_default().newInstance();
  model.rendererMap = {}; // OpenGLRenderWindow

  model.openGLRenderWindow = vtkClasses_vtkStreamingOpenGLRenderWindow.newInstance();
  model.renderWindow.addView(model.openGLRenderWindow); // Interactor

  model.interactor = RenderWindowInteractor_default().newInstance();
  model.interactor.setView(model.openGLRenderWindow);
  model.interactor.initialize();

  publicAPI.addRenderer = function (_ref) {
    var viewport = _ref.viewport,
        uid = _ref.uid,
        background = _ref.background;
    var renderer = Core_Renderer_default().newInstance({
      viewport: viewport,
      background: background || model.background
    });
    model.renderWindow.addRenderer(renderer);
    model.rendererMap[uid] = renderer;
  };

  publicAPI.removeRenderer = function (uid) {
    var renderer = publicAPI.getRenderer(uid);
    model.renderWindow.removeRenderer(renderer);
    delete model.rendererMap[uid];
  };

  publicAPI.getRenderer = function (uid) {
    return model.rendererMap[uid];
  };

  publicAPI.getRenderers = function () {
    var rendererMap = model.rendererMap;
    var renderers = Object.keys(rendererMap).map(function (uid) {
      return {
        uid: uid,
        renderer: rendererMap[uid]
      };
    });
    return renderers;
  }; // Handle window resize


  publicAPI.resize = function () {
    if (model.container) {
      // Don't use getBoundingClientRect() as in vtkGenericRenderWindow as is an offscreen canvas.
      var _model$container = model.container,
          width = _model$container.width,
          height = _model$container.height;
      var devicePixelRatio = 1;
      model.openGLRenderWindow.setSize(Math.floor(width * devicePixelRatio), Math.floor(height * devicePixelRatio));
      invokeResize();
      model.renderWindow.render();
    }
  }; // Handle DOM container relocation


  publicAPI.setContainer = function (el) {
    // Switch container
    model.container = el;
    model.openGLRenderWindow.setContainer(model.container);
  }; // Properly release GL context


  publicAPI.delete = macro_default().chain(publicAPI.setContainer, model.openGLRenderWindow.delete, publicAPI.delete);
  publicAPI.resize();
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------


var vtkOffscreenMultiRenderWindow_DEFAULT_VALUES = {
  background: [0.0, 0.0, 0.0],
  container: null
}; // ----------------------------------------------------------------------------

function vtkOffscreenMultiRenderWindow_extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, vtkOffscreenMultiRenderWindow_DEFAULT_VALUES, initialValues); // Object methods

  macro_default().obj(publicAPI, model);
  macro_default().get(publicAPI, model, ['renderWindow', 'openGLRenderWindow', 'interactor', 'container']);
  macro_default().event(publicAPI, model, 'resize'); // Object specific methods

  vtkOffscreenMultiRenderWindow(publicAPI, model);
} // ----------------------------------------------------------------------------

var vtkOffscreenMultiRenderWindow_newInstance = macro_default().newInstance(vtkOffscreenMultiRenderWindow_extend); // ----------------------------------------------------------------------------

/* harmony default export */ var vtkClasses_vtkOffscreenMultiRenderWindow = ({
  newInstance: vtkOffscreenMultiRenderWindow_newInstance,
  extend: vtkOffscreenMultiRenderWindow_extend
});
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/VolumeMapper"
var Core_VolumeMapper_ = __webpack_require__(3907);
var Core_VolumeMapper_default = /*#__PURE__*/__webpack_require__.n(Core_VolumeMapper_);
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/vtkSharedVolumeMapper.js


/**
 * vtkSharedVolumeMapper - A dervied class of the core vtkVolumeMapper class
 * the scalar texture in as an argument. This is so we can share the same texture
 * memory across different mappers/actors, so we don't duplicate memory usage.
 *
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */

function vtkSharedVolumeMapper(publicAPI, model) {
  model.classHierarchy.push('vtkSharedVolumeMapper');
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------


var vtkSharedVolumeMapper_DEFAULT_VALUES = {
  scalarTexture: null
};
function vtkSharedVolumeMapper_extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, vtkSharedVolumeMapper_DEFAULT_VALUES, initialValues);
  Core_VolumeMapper_default().extend(publicAPI, model, initialValues);
  macro_default().setGet(publicAPI, model, ['scalarTexture']); // Object methods

  vtkSharedVolumeMapper(publicAPI, model);
} // ----------------------------------------------------------------------------

var vtkSharedVolumeMapper_newInstance = macro_default().newInstance(vtkSharedVolumeMapper_extend, 'vtkSharedVolumeMapper'); // ----------------------------------------------------------------------------

/* harmony default export */ var vtkClasses_vtkSharedVolumeMapper = ({
  newInstance: vtkSharedVolumeMapper_newInstance,
  extend: vtkSharedVolumeMapper_extend
});
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture.js


/**
 * vtkStreamingOpenGLTexture - A dervied class of the core vtkOpenGLTexture.
 * This class has methods to update the texture memory on the GPU slice by slice
 * in an efficient yet GPU-architecture friendly manner.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */

function vtkStreamingOpenGLTexture(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLTexture');
  var superCreate3DFilterableFromRaw = publicAPI.create3DFilterableFromRaw;

  publicAPI.create3DFilterableFromRaw = function (width, height, depth, numComps, dataType, data) {
    model.inputDataType = dataType;
    model.inputNumComps = numComps;
    superCreate3DFilterableFromRaw(width, height, depth, numComps, dataType, data);
  };
  /**
   * This function updates the GPU texture memory to match the current
   * representation of data held in RAM.
   *
   * @param {Float32Array|Uint8Array} data The data array which has been updated.
   */


  publicAPI.update3DFromRaw = function (data) {
    var updatedFrames = model.updatedFrames;

    if (!updatedFrames.length) {
      return;
    }

    model.openGLRenderWindow.activateTexture(publicAPI);
    publicAPI.createTexture();
    publicAPI.bind();
    var bytesPerVoxel;
    var TypedArrayConstructor;

    if (data instanceof Uint8Array) {
      bytesPerVoxel = 1;
      TypedArrayConstructor = Uint8Array;
    } else if (data instanceof Int16Array) {
      bytesPerVoxel = 2;
      TypedArrayConstructor = Int16Array;
    } else if (data instanceof Float32Array) {
      bytesPerVoxel = 4;
      TypedArrayConstructor = Float32Array;
    } else {
      throw new Error("No support for given TypedArray.");
    }

    for (var i = 0; i < updatedFrames.length; i++) {
      if (updatedFrames[i]) {
        model.fillSubImage3D(data, i, bytesPerVoxel, TypedArrayConstructor);
      }
    } // Reset updatedFrames


    model.updatedFrames = [];

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();
    return true;
  };
  /**
   * This function updates the GPU texture memory to match the current
   * representation of data held in RAM.
   *
   * @param {Float32Array|Uint8Array} data The data array which has been updated.
   * @param {number} frameIndex The frame to load in.
   * @param {number} BytesPerVoxel The number of bytes per voxel in the data, so we don't have to constantly
   * check the array type.
   * @param {object} TypedArrayConstructor The constructor for the array type. Again so we don't have to constantly check.
   */


  model.fillSubImage3D = function (data, frameIndex, bytesPerVoxel, TypedArrayConstructor) {
    var buffer = data.buffer;
    var frameLength = model.width * model.height;
    var frameLengthInBytes = frameLength * model.components * bytesPerVoxel;
    var zOffset = frameIndex * frameLengthInBytes;
    var rowLength = model.width * model.components;
    var gl = model.context;
    /**
     * It appears that the implementation of texSubImage3D uses 2D textures to do the texture copy if
     * MAX_TEXTURE_SIZE is greater than MAX_TEXTURE_SIZE_3D. As such if you make a single block too big
     * the transfer messes up cleanly and you render a black box or some data if you are lucky.
     *
     * This block-size based on 2D texture size seems like the safest approach that should work on most systems.
     *
     * There are certainly further optimizations that could be done here, we can do bigger chunks with other systems
     * But we need to find the _exact_ criteria. And then its not even guaranteed it'll be much faster.
     */

    var MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    var blockHeight = Math.floor(bytesPerVoxel * MAX_TEXTURE_SIZE / model.width); // Cap to actual frame height:

    blockHeight = Math.min(blockHeight, model.height);
    var multiRowBlockLength = rowLength * blockHeight;
    var multiRowBlockLengthInBytes = multiRowBlockLength * bytesPerVoxel;
    var normalBlocks = Math.floor(model.height / blockHeight);
    var lastBlockHeight = model.height % blockHeight;
    var multiRowLastBlockLength = rowLength * lastBlockHeight; // Perform most blocks.

    for (var block = 0; block < normalBlocks; block++) {
      var yOffset = block * blockHeight; // Dataview of block

      var dataView = new TypedArrayConstructor(buffer, zOffset + block * multiRowBlockLengthInBytes, multiRowBlockLength);
      gl.texSubImage3D(model.target, // target
      0, // mipMap level (always zero)
      0, // xOffset
      yOffset, // yOffset
      frameIndex, model.width, blockHeight, //model.height,
      1, // numFramesInBlock,
      model.format, model.openGLDataType, dataView);
    } // perform last block if present


    if (lastBlockHeight !== 0) {
      var _yOffset = normalBlocks * blockHeight; // Dataview of last block


      var _dataView = new TypedArrayConstructor(buffer, zOffset + normalBlocks * multiRowBlockLengthInBytes, multiRowLastBlockLength);

      gl.texSubImage3D(model.target, // target
      0, // mipMap level (always zero)
      0, // xOffset
      _yOffset, // yOffset
      frameIndex, model.width, lastBlockHeight, //model.height,
      1, // numFramesInBlock,
      model.format, model.openGLDataType, _dataView);
    }
  };

  publicAPI.getTextureParameters = function () {
    return {
      width: model.width,
      height: model.height,
      depth: model.depth,
      numComps: model.inputNumComps,
      dataType: model.inputDataType
    };
  };
  /**
   * Called when a frame is loaded so that on next render we know which data to load in.
   * @param {number} frameIndex The frame to load in.
   */


  publicAPI.setUpdatedFrame = function (frameIndex) {
    model.updatedFrames[frameIndex] = true;
  };
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------


var vtkStreamingOpenGLTexture_DEFAULT_VALUES = {
  updatedFrames: []
};
function vtkStreamingOpenGLTexture_extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, vtkStreamingOpenGLTexture_DEFAULT_VALUES, initialValues);
  Texture_default().extend(publicAPI, model, initialValues); // Object methods

  vtkStreamingOpenGLTexture(publicAPI, model);
} // ----------------------------------------------------------------------------

var vtkStreamingOpenGLTexture_newInstance = macro_default().newInstance(vtkStreamingOpenGLTexture_extend, 'vtkStreamingOpenGLTexture'); // ----------------------------------------------------------------------------

/* harmony default export */ var vtkClasses_vtkStreamingOpenGLTexture = ({
  newInstance: vtkStreamingOpenGLTexture_newInstance,
  extend: vtkStreamingOpenGLTexture_extend
});
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/Camera"
var Core_Camera_ = __webpack_require__(2834);
var Core_Camera_default = /*#__PURE__*/__webpack_require__.n(Core_Camera_);
// EXTERNAL MODULE: external "vtk.js/Sources/Common/Core/Math"
var Math_ = __webpack_require__(6812);
var Math_default = /*#__PURE__*/__webpack_require__.n(Math_);
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/vtkSlabCamera.js




/**
 * vtkSlabCamera - A dervied class of the core vtkCamera class
 *
 * This class adds a slabThickness parameter. The difference between this and
 * the regular thickness parameter is that the set method will not modify the
 * vtk camera range parameters.
 *
 * NOTE1: there is a 1:1 correspondence between a camera and a viewport.
 *
 * NOTE2: while the thickness is a property unique to the viewport/camera, the
 * blendMode is a property of a volume (which can be shared over multiple viewports)
 * and one viewport can have multiple volumes.
 *
 * NOTE3: In the case of thickness > 0.1, this customization is needed to
 * distinguish cases different BlendMode in the mapper shader. In fact, the same
 * shader is called over multiple volumes which can have different blend modes.
 * For example, if the blend mode is different from COMPOSITE and we
 * are rendering thin layers, the camera parameters in the shaders are derived
 * from the new slabThickness (which does not affect the vtk camera
 * clipping/range parameters).
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */

function vtkSlabCamera(publicAPI, model) {
  model.classHierarchy.push('vtkSlabCamera');
  var tmpMatrix = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.create();
  /**
   * getProjectionMatrix - A fork of vtkCamera's getProjectionMatrix method.
   * This fork performs most of the same actions, but if slabThicknessActive is
   * true, then it uses the value of slabThickness for calculating the actual
   * clipping range for the Z-buffer values that map to the near and far
   * clipping planes.
   */

  publicAPI.getProjectionMatrix = function (aspect, nearz, farz) {
    var result = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.create();

    if (model.projectionMatrix) {
      var scale = 1 / model.physicalScale;
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.set(tmpvec1, scale, scale, scale);
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.copy(result, model.projectionMatrix);
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.scale(result, result, tmpvec1);
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.transpose(result, result);
      return result;
    }

    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.identity(tmpMatrix);
    var cRange0 = model.clippingRange[0];
    var cRange1 = model.clippingRange[1];

    if (model.slabThicknessActive) {
      var cameraMidpoint = (model.clippingRange[1] + model.clippingRange[0]) * 0.5;
      cRange0 = cameraMidpoint - model.slabThickness;
      cRange1 = cameraMidpoint + model.slabThickness;
    }

    var cWidth = cRange1 - cRange0;
    var cRange = [cRange0 + (nearz + 1) * cWidth / 2.0, cRange0 + (farz + 1) * cWidth / 2.0];

    if (model.parallelProjection) {
      // set up a rectangular parallelipiped
      var width = model.parallelScale * aspect;
      var height = model.parallelScale;
      var xmin = (model.windowCenter[0] - 1.0) * width;
      var xmax = (model.windowCenter[0] + 1.0) * width;
      var ymin = (model.windowCenter[1] - 1.0) * height;
      var ymax = (model.windowCenter[1] + 1.0) * height;
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.ortho(tmpMatrix, xmin, xmax, ymin, ymax, cRange[0], cRange[1]);
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.transpose(tmpMatrix, tmpMatrix);
    } else if (model.useOffAxisProjection) {
      throw new Error('Off-Axis projection is not supported at this time');
    } else {
      var tmp = Math.tan(Math_default().radiansFromDegrees(model.viewAngle) / 2.0);

      var _width;

      var _height;

      if (model.useHorizontalViewAngle === true) {
        _width = crange0 * tmp;
        _height = crange0 * tmp / aspect;
      } else {
        _width = crange0 * tmp * aspect;
        _height = crange0 * tmp;
      }

      var _xmin = (model.windowCenter[0] - 1.0) * _width;

      var _xmax = (model.windowCenter[0] + 1.0) * _width;

      var _ymin = (model.windowCenter[1] - 1.0) * _height;

      var _ymax = (model.windowCenter[1] + 1.0) * _height;

      var znear = cRange[0];
      var zfar = cRange[1];
      tmpMatrix[0] = 2.0 * znear / (_xmax - _xmin);
      tmpMatrix[5] = 2.0 * znear / (_ymax - _ymin);
      tmpMatrix[2] = (_xmin + _xmax) / (_xmax - _xmin);
      tmpMatrix[6] = (_ymin + _ymax) / (_ymax - _ymin);
      tmpMatrix[10] = -(znear + zfar) / (zfar - znear);
      tmpMatrix[14] = -1.0;
      tmpMatrix[11] = -2.0 * znear * zfar / (zfar - znear);
      tmpMatrix[15] = 0.0;
    }

    external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.mat4.copy(result, tmpMatrix);
    return result;
  };
} // ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------


var vtkSlabCamera_DEFAULT_VALUES = {
  slabThickness: null,
  slabThicknessActive: false
};
function vtkSlabCamera_extend(publicAPI, model) {
  var initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, vtkSlabCamera_DEFAULT_VALUES, initialValues);
  Core_Camera_default().extend(publicAPI, model, initialValues);
  macro_default().setGet(publicAPI, model, ['slabThickness', 'slabThicknessActive']); // Object methods

  vtkSlabCamera(publicAPI, model);
} // ----------------------------------------------------------------------------

var vtkSlabCamera_newInstance = macro_default().newInstance(vtkSlabCamera_extend, 'vtkSlabCamera'); // ----------------------------------------------------------------------------

/* harmony default export */ var vtkClasses_vtkSlabCamera = ({
  newInstance: vtkSlabCamera_newInstance,
  extend: vtkSlabCamera_extend
});
;// CONCATENATED MODULE: ./src/RenderingEngine/vtkClasses/index.js





;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/assertThisInitialized.js
function _assertThisInitialized(self) {
  if (self === void 0) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return self;
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/setPrototypeOf.js
function _setPrototypeOf(o, p) {
  _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {
    o.__proto__ = p;
    return o;
  };

  return _setPrototypeOf(o, p);
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/inherits.js

function _inherits(subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function");
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      writable: true,
      configurable: true
    }
  });
  if (superClass) _setPrototypeOf(subClass, superClass);
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/typeof.js
function _typeof(obj) {
  "@babel/helpers - typeof";

  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function _typeof(obj) {
      return typeof obj;
    };
  } else {
    _typeof = function _typeof(obj) {
      return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
    };
  }

  return _typeof(obj);
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/possibleConstructorReturn.js


function _possibleConstructorReturn(self, call) {
  if (call && (_typeof(call) === "object" || typeof call === "function")) {
    return call;
  }

  return _assertThisInitialized(self);
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/getPrototypeOf.js
function _getPrototypeOf(o) {
  _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {
    return o.__proto__ || Object.getPrototypeOf(o);
  };
  return _getPrototypeOf(o);
}
// EXTERNAL MODULE: ../../node_modules/lodash.clonedeep/index.js
var lodash_clonedeep = __webpack_require__(9907);
var lodash_clonedeep_default = /*#__PURE__*/__webpack_require__.n(lodash_clonedeep);
// EXTERNAL MODULE: external "vtk.js/Sources/Common/Core/MatrixBuilder"
var MatrixBuilder_ = __webpack_require__(8653);
var MatrixBuilder_default = /*#__PURE__*/__webpack_require__.n(MatrixBuilder_);
;// CONCATENATED MODULE: ./src/RenderingEngine/Viewport.ts













/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
var Viewport = /*#__PURE__*/function () {
  function Viewport(props) {
    _classCallCheck(this, Viewport);

    _defineProperty(this, "uid", void 0);

    _defineProperty(this, "sceneUID", undefined);

    _defineProperty(this, "renderingEngineUID", void 0);

    _defineProperty(this, "type", void 0);

    _defineProperty(this, "canvas", void 0);

    _defineProperty(this, "sx", void 0);

    _defineProperty(this, "sy", void 0);

    _defineProperty(this, "sWidth", void 0);

    _defineProperty(this, "sHeight", void 0);

    _defineProperty(this, "_actors", void 0);

    _defineProperty(this, "defaultOptions", void 0);

    _defineProperty(this, "options", void 0);

    _defineProperty(this, "getFrameOfReferenceUID", void 0);

    _defineProperty(this, "canvasToWorld", void 0);

    _defineProperty(this, "worldToCanvas", void 0);

    this.uid = props.uid;
    this.renderingEngineUID = props.renderingEngineUID;
    this.type = props.type;
    this.canvas = props.canvas;
    this.sx = props.sx;
    this.sy = props.sy;
    this.sWidth = props.sWidth;
    this.sHeight = props.sHeight;
    this._actors = new Map(); // Set data attributes for render events

    this.canvas.setAttribute('data-viewport-uid', this.uid);
    this.canvas.setAttribute('data-rendering-engine-uid', this.renderingEngineUID);

    if (props.sceneUID) {
      this.sceneUID = props.sceneUID;
      this.canvas.setAttribute('data-scene-uid', this.sceneUID);
    }

    this.defaultOptions = lodash_clonedeep_default()(props.defaultOptions);
    this.options = lodash_clonedeep_default()(props.defaultOptions);
  }

  _createClass(Viewport, [{
    key: "getIntensityFromWorld",
    value: function getIntensityFromWorld(point) {
      var volumeActor = this.getDefaultActor().volumeActor;
      var imageData = volumeActor.getMapper().getInputData();
      return imageData.getScalarValueFromWorld(point);
    }
  }, {
    key: "getDefaultActor",
    value: function getDefaultActor() {
      return this.getActors()[0];
    }
  }, {
    key: "getActors",
    value: function getActors() {
      return Array.from(this._actors.values());
    }
  }, {
    key: "getActor",
    value: function getActor(actorUID) {
      return this._actors.get(actorUID);
    }
  }, {
    key: "setActors",
    value: function setActors(actors) {
      this.removeAllActors();
      this.addActors(actors);
    }
  }, {
    key: "addActors",
    value: function addActors(actors) {
      var _this = this;

      actors.forEach(function (actor) {
        return _this.addActor(actor);
      });
    }
  }, {
    key: "addActor",
    value: function addActor(actorEntry) {
      var actorUID = actorEntry.uid,
          volumeActor = actorEntry.volumeActor;

      if (!actorUID || !volumeActor) {
        throw new Error('Actors should have uid and vtk volumeActor properties');
      }

      var actor = this.getActor(actorUID);

      if (actor) {
        console.warn("Actor ".concat(actorUID, " already exists for this viewport"));
        return;
      }

      var renderer = this.getRenderer();
      renderer.addActor(volumeActor);

      this._actors.set(actorUID, Object.assign({}, actorEntry));
    }
    /*
    Todo: remove actor and remove actors does not work for some reason
    public removeActor(actorUID: string): void {
      const actor = this.getActor(actorUID)
      if (!actor) {
        console.warn(`Actor ${actorUID} does not exist for this viewport`)
        return
      }
      const renderer = this.getRenderer()
      renderer.removeViewProp(actor) // removeActor not implemented in vtk?
      this._actors.delete(actorUID)
    }
      public removeActors(actorUIDs: Array<string>): void {
      actorUIDs.forEach((actorUID) => {
        this.removeActor(actorUID)
      })
    }
    */

  }, {
    key: "removeAllActors",
    value: function removeAllActors() {
      this.getRenderer().removeAllViewProps();
      this._actors = new Map();
      return;
    }
    /**
     * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
     *
     * @returns {RenderingEngine} The RenderingEngine instance.
     */

  }, {
    key: "getRenderingEngine",
    value: function getRenderingEngine() {
      return RenderingEngine_renderingEngineCache.get(this.renderingEngineUID);
    }
    /**
     * @method getRenderer Returns the `vtkRenderer` responsible for rendering the `Viewport`.
     *
     * @returns {object} The `vtkRenderer` for the `Viewport`.
     */

  }, {
    key: "getRenderer",
    value: function getRenderer() {
      var renderingEngine = this.getRenderingEngine();
      return renderingEngine.offscreenMultiRenderWindow.getRenderer(this.uid);
    }
    /**
     * @method render Renders the `Viewport` using the `RenderingEngine`.
     */

  }, {
    key: "render",
    value: function render() {
      var renderingEngine = this.getRenderingEngine();
      renderingEngine.renderViewport(this.uid);
    }
    /**
     * @method setOptions Sets new options and (TODO) applies them.
     *
     * @param {ViewportInputOptions} options The viewport options to set.
     * @param {boolean} [immediate=false] If `true`, renders the viewport after the options are set.
     */

  }, {
    key: "setOptions",
    value: function setOptions(options) {
      var immediate = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      this.options = lodash_clonedeep_default()(options); // TODO When this is needed we need to move the camera position.
      // We can steal some logic from the tools we build to do this.

      if (immediate) {
        this.render();
      }
    }
    /**
     * @method getBounds gets the visible bounds of the viewport
     *
     * @param {any} bounds of the viewport
     */

  }, {
    key: "getBounds",
    value: function getBounds() {
      var renderer = this.getRenderer();
      return renderer.computeVisiblePropBounds();
    }
    /**
     * @method reset Resets the options the `Viewport`'s `defaultOptions`.`
     *
     * @param {boolean} [immediate=false] If `true`, renders the viewport after the options are reset.
     */

  }, {
    key: "reset",
    value: function reset() {
      var immediate = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
      this.options = lodash_clonedeep_default()(this.defaultOptions); // TODO When this is needed we need to move the camera position.
      // We can steal some logic from the tools we build to do this.

      if (immediate) {
        this.render();
      }
    }
  }, {
    key: "resetCamera",
    value: function resetCamera() {
      var renderer = this.getRenderer();
      var bounds = renderer.computeVisiblePropBounds();
      var focalPoint = [0, 0, 0];
      var activeCamera = this.getVtkActiveCamera();
      var viewPlaneNormal = activeCamera.getViewPlaneNormal();
      var viewUp = activeCamera.getViewUp(); // Reset the perspective zoom factors, otherwise subsequent zooms will cause
      // the view angle to become very small and cause bad depth sorting.

      activeCamera.setViewAngle(30.0);
      focalPoint[0] = (bounds[0] + bounds[1]) / 2.0;
      focalPoint[1] = (bounds[2] + bounds[3]) / 2.0;
      focalPoint[2] = (bounds[4] + bounds[5]) / 2.0;

      var _this$_getWorldDistan = this._getWorldDistanceViewUpAndViewRight(bounds, viewUp, viewPlaneNormal),
          widthWorld = _this$_getWorldDistan.widthWorld,
          heightWorld = _this$_getWorldDistan.heightWorld;

      var canvasSize = [this.sWidth, this.sHeight];
      var boundsAspectRatio = widthWorld / heightWorld;
      var canvasAspectRatio = canvasSize[0] / canvasSize[1];
      var radius;

      if (boundsAspectRatio < canvasAspectRatio) {
        // can fit full height, so use it.
        radius = heightWorld / 2;
      } else {
        var scaleFactor = boundsAspectRatio / canvasAspectRatio;
        radius = heightWorld * scaleFactor / 2;
      }

      var angle = Math_default().radiansFromDegrees(activeCamera.getViewAngle());
      var parallelScale = radius;
      var distance;

      if (activeCamera.getParallelProjection()) {
        // Stick the camera just outside of the bounding sphere of all the volumeData so that MIP behaves correctly.
        var w1 = bounds[1] - bounds[0];
        var w2 = bounds[3] - bounds[2];
        var w3 = bounds[5] - bounds[4];
        w1 *= w1;
        w2 *= w2;
        w3 *= w3;
        distance = w1 + w2 + w3; // If we have just a single point, pick a radius of 1.0

        distance = distance === 0 ? 1.0 : distance; // compute the radius of the enclosing sphere

        distance = 1.1 * (Math.sqrt(distance) / 2);
      } else {
        distance = radius / Math.sin(angle * 0.5);
      } // check view-up vector against view plane normal


      if (Math.abs(Math_default().dot(viewUp, viewPlaneNormal)) > 0.999) {
        activeCamera.setViewUp(-viewUp[2], viewUp[0], viewUp[1]);
      } // update the camera


      activeCamera.setFocalPoint.apply(activeCamera, focalPoint);
      activeCamera.setPosition(focalPoint[0] + distance * viewPlaneNormal[0], focalPoint[1] + distance * viewPlaneNormal[1], focalPoint[2] + distance * viewPlaneNormal[2]);
      renderer.resetCameraClippingRange(bounds); // setup default parallel scale

      activeCamera.setParallelScale(parallelScale); // update reasonable world to physical values

      activeCamera.setPhysicalScale(radius);
      activeCamera.setPhysicalTranslation(-focalPoint[0], -focalPoint[1], -focalPoint[2]);
      var RESET_CAMERA_EVENT = {
        type: 'ResetCameraEvent',
        renderer: renderer
      }; // Here to let parallel/distributed compositing intercept
      // and do the right thing.

      renderer.invokeEvent(RESET_CAMERA_EVENT);
      return true;
    }
    /**
     * @method getCanvas Gets the target ouput canvas for the `Viewport`.
     *
     * @returns {HTMLCanvasElement}
     */

  }, {
    key: "getCanvas",
    value: function getCanvas() {
      return this.canvas;
    }
    /**
     * @method getActiveCamera Gets the active vtkCamera for the viewport.
     *
     * @returns {object} the vtkCamera.
     */

  }, {
    key: "getVtkActiveCamera",
    value: function getVtkActiveCamera() {
      var renderer = this.getRenderer();
      return renderer.getActiveCamera();
    }
  }, {
    key: "getCamera",
    value: function getCamera() {
      var vtkCamera = this.getVtkActiveCamera(); // TODO: Make sure these are deep copies.

      var slabThickness; // Narrowing down the type for typescript

      if ('getSlabThickness' in vtkCamera) {
        slabThickness = vtkCamera.getSlabThickness();
      }

      return {
        viewUp: vtkCamera.getViewUp(),
        viewPlaneNormal: vtkCamera.getViewPlaneNormal(),
        clippingRange: vtkCamera.getClippingRange(),
        // TODO: I'm really not sure about this, it requires a calculation, and
        // how useful is this without the renderer context?
        // Lets add it back if we find we need it.
        //compositeProjectionMatrix: vtkCamera.getCompositeProjectionMatrix(),
        position: vtkCamera.getPosition(),
        focalPoint: vtkCamera.getFocalPoint(),
        parallelProjection: vtkCamera.getParallelProjection(),
        parallelScale: vtkCamera.getParallelScale(),
        viewAngle: vtkCamera.getViewAngle(),
        slabThickness: slabThickness
      };
    }
  }, {
    key: "setCamera",
    value: function setCamera(cameraInterface) {
      var vtkCamera = this.getVtkActiveCamera();
      var previousCamera = JSON.parse(JSON.stringify(this.getCamera()));
      var updatedCamera = Object.assign({}, previousCamera, cameraInterface);
      var viewUp = cameraInterface.viewUp,
          viewPlaneNormal = cameraInterface.viewPlaneNormal,
          clippingRange = cameraInterface.clippingRange,
          position = cameraInterface.position,
          focalPoint = cameraInterface.focalPoint,
          parallelScale = cameraInterface.parallelScale,
          viewAngle = cameraInterface.viewAngle,
          slabThickness = cameraInterface.slabThickness;

      if (viewUp !== undefined) {
        vtkCamera.setViewUp(viewUp);
      }

      if (viewPlaneNormal !== undefined) {
        vtkCamera.setDirectionOfProjection(-viewPlaneNormal[0], -viewPlaneNormal[1], -viewPlaneNormal[2]);
      }

      if (clippingRange !== undefined) {
        vtkCamera.setClippingRange(clippingRange);
      }

      if (position !== undefined) {
        vtkCamera.setPosition.apply(vtkCamera, _toConsumableArray(position));
      }

      if (focalPoint !== undefined) {
        vtkCamera.setFocalPoint.apply(vtkCamera, _toConsumableArray(focalPoint));
      }

      if (parallelScale !== undefined) {
        vtkCamera.setParallelScale(parallelScale);
      }

      if (viewAngle !== undefined) {
        vtkCamera.setViewAngle(viewAngle);
      }

      if (slabThickness !== undefined && 'setSlabThickness' in vtkCamera) {
        vtkCamera.setSlabThickness(slabThickness);
      }

      var eventDetail = {
        previousCamera: previousCamera,
        camera: updatedCamera,
        canvas: this.canvas,
        viewportUID: this.uid,
        sceneUID: this.sceneUID,
        renderingEngineUID: this.renderingEngineUID
      };
      triggerEvent(this.canvas, events.CAMERA_MODIFIED, eventDetail);

      if (this.type == viewportType.PERSPECTIVE) {
        var renderer = this.getRenderer();
        renderer.resetCameraClippingRange();
      }
    }
  }, {
    key: "_getWorldDistanceViewUpAndViewRight",
    value: function _getWorldDistanceViewUpAndViewRight(bounds, viewUp, viewPlaneNormal) {
      var viewUpCorners = this._getCorners(bounds);

      var viewRightCorners = this._getCorners(bounds);

      var viewRight = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.cross(viewRight, viewUp, viewPlaneNormal);
      viewRight = [-viewRight[0], -viewRight[1], -viewRight[2]];
      var transform = MatrixBuilder_default().buildFromDegree().identity().rotateFromDirections(viewUp, [1, 0, 0]);
      viewUpCorners.forEach(function (pt) {
        return transform.apply(pt);
      }); // range is now maximum X distance

      var minY = Infinity;
      var maxY = -Infinity;

      for (var i = 0; i < 8; i++) {
        var y = viewUpCorners[i][0];

        if (y > maxY) {
          maxY = y;
        }

        if (y < minY) {
          minY = y;
        }
      }

      transform = MatrixBuilder_default().buildFromDegree().identity().rotateFromDirections(viewRight, [1, 0, 0]);
      viewRightCorners.forEach(function (pt) {
        return transform.apply(pt);
      }); // range is now maximum Y distance

      var minX = Infinity;
      var maxX = -Infinity;

      for (var _i = 0; _i < 8; _i++) {
        var x = viewRightCorners[_i][0];

        if (x > maxX) {
          maxX = x;
        }

        if (x < minX) {
          minX = x;
        }
      }

      return {
        widthWorld: maxX - minX,
        heightWorld: maxY - minY
      };
    }
  }, {
    key: "_getCorners",
    value: function _getCorners(bounds) {
      return [[bounds[0], bounds[2], bounds[4]], [bounds[0], bounds[2], bounds[5]], [bounds[0], bounds[3], bounds[4]], [bounds[0], bounds[3], bounds[5]], [bounds[1], bounds[2], bounds[4]], [bounds[1], bounds[2], bounds[5]], [bounds[1], bounds[3], bounds[4]], [bounds[1], bounds[3], bounds[5]]];
    }
  }]);

  return Viewport;
}();

/* harmony default export */ var RenderingEngine_Viewport = (Viewport);
;// CONCATENATED MODULE: ./src/RenderingEngine/VolumeViewport.ts









function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }

function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }





/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
var VolumeViewport = /*#__PURE__*/function (_Viewport) {
  _inherits(VolumeViewport, _Viewport);

  var _super = _createSuper(VolumeViewport);

  function VolumeViewport(props) {
    var _this;

    _classCallCheck(this, VolumeViewport);

    _this = _super.call(this, props);

    _defineProperty(_assertThisInitialized(_this), "getFrameOfReferenceUID", function () {
      return _this.getScene().getFrameOfReferenceUID();
    });

    _defineProperty(_assertThisInitialized(_this), "canvasToWorld", function (canvasPos) {
      var vtkCamera = _this.getVtkActiveCamera();

      var slabThicknessActive = vtkCamera.getSlabThicknessActive(); // NOTE: this is necessary to disable our customization of getProjectionMatrix in the vtkSlabCamera,
      // since getProjectionMatrix is used in vtk vtkRenderer.projectionToView. vtkRenderer.projectionToView is used
      // in the volumeMapper (where we need our custom getProjectionMatrix) and in the coordinates transformations
      // (where we don't need our custom getProjectionMatrix)
      // TO DO: we should customize vtk to use our custom getProjectionMatrix only in the volumeMapper

      vtkCamera.setSlabThicknessActive(false);

      var renderer = _this.getRenderer();

      var offscreenMultiRenderWindow = _this.getRenderingEngine().offscreenMultiRenderWindow;

      var openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
      var size = openGLRenderWindow.getSize();
      var displayCoord = [canvasPos[0] + _this.sx, canvasPos[1] + _this.sy]; // The y axis display coordinates are inverted with respect to canvas coords

      displayCoord[1] = size[1] - displayCoord[1];
      var worldCoord = openGLRenderWindow.displayToWorld(displayCoord[0], displayCoord[1], 0, renderer);
      vtkCamera.setSlabThicknessActive(slabThicknessActive);
      return worldCoord;
    });

    _defineProperty(_assertThisInitialized(_this), "worldToCanvas", function (worldPos) {
      var vtkCamera = _this.getVtkActiveCamera();

      var slabThicknessActive = vtkCamera.getSlabThicknessActive(); // NOTE: this is necessary to disable our customization of getProjectionMatrix in the vtkSlabCamera,
      // since getProjectionMatrix is used in vtk vtkRenderer.projectionToView. vtkRenderer.projectionToView is used
      // in the volumeMapper (where we need our custom getProjectionMatrix) and in the coordinates transformations
      // (where we don't need our custom getProjectionMatrix)
      // TO DO: we should customize vtk to use our custom getProjectionMatrix only in the volumeMapper

      vtkCamera.setSlabThicknessActive(false);

      var renderer = _this.getRenderer();

      var offscreenMultiRenderWindow = _this.getRenderingEngine().offscreenMultiRenderWindow;

      var openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
      var size = openGLRenderWindow.getSize();
      var displayCoord = openGLRenderWindow.worldToDisplay.apply(openGLRenderWindow, _toConsumableArray(worldPos).concat([renderer])); // The y axis display coordinates are inverted with respect to canvas coords

      displayCoord[1] = size[1] - displayCoord[1];
      var canvasCoord = [displayCoord[0] - _this.sx, displayCoord[1] - _this.sy];
      vtkCamera.setSlabThicknessActive(slabThicknessActive);
      return canvasCoord;
    });

    var _renderer = _this.getRenderer();

    var camera = vtkClasses_vtkSlabCamera.newInstance();

    _renderer.setActiveCamera(camera);

    switch (_this.type) {
      case viewportType.ORTHOGRAPHIC:
        camera.setParallelProjection(true);
        break;

      case viewportType.PERSPECTIVE:
        camera.setParallelProjection(false);
        break;

      default:
        throw new Error("Unrecognized viewport type: ".concat(_this.type));
    }

    var _this$defaultOptions$ = _this.defaultOptions.orientation,
        sliceNormal = _this$defaultOptions$.sliceNormal,
        viewUp = _this$defaultOptions$.viewUp;
    camera.setDirectionOfProjection(-sliceNormal[0], -sliceNormal[1], -sliceNormal[2]);
    camera.setViewUp.apply(camera, _toConsumableArray(viewUp));
    camera.setFreezeFocalPoint(true);

    _this.resetCamera();

    return _this;
  }

  _createClass(VolumeViewport, [{
    key: "setSlabThickness",
    value:
    /**
     * @method Sets the slab thickness option in the `Viewport`'s `options`.
     *
     * @param {number} [slabThickness]
     */
    function setSlabThickness(slabThickness) {
      this.setCamera({
        slabThickness: slabThickness
      });
    }
    /**
     * @method Gets the slab thickness option in the `Viewport`'s `options`.
     *
     * @returns {number} [slabThickness]
     */

  }, {
    key: "getSlabThickness",
    value: function getSlabThickness() {
      var _this$getCamera = this.getCamera(),
          slabThickness = _this$getCamera.slabThickness;

      return slabThickness;
    }
    /**
     * @method getScene Gets the `Scene` object that the `Viewport` is associated with.
     *
     * @returns {Scene} The `Scene` object.
     */

  }, {
    key: "getScene",
    value: function getScene() {
      var renderingEngine = this.getRenderingEngine();
      return renderingEngine.getScene(this.sceneUID);
    }
    /**
     * @method _setVolumeActors Attaches the volume actors to the viewport.
     *
     * @param {Array<ActorEntry>} volumeActorEntries The volume actors to add the viewport.
     *
     * NOTE: overwrites the slab thickness value in the options if one of the actor has a higher value
     */

  }, {
    key: "_setVolumeActors",
    value: function _setVolumeActors(volumeActorEntries) {
      var renderer = this.getRenderer();
      this.setActors(volumeActorEntries); // volumeActorEntries.forEach((va) => renderer.addActor(va.volumeActor))

      var slabThickness = null;

      if (this.type === viewportType.ORTHOGRAPHIC) {
        volumeActorEntries.forEach(function (va) {
          if (va.slabThickness && va.slabThickness > slabThickness) {
            slabThickness = va.slabThickness;
          }
        });
        this.resetCamera();
        var activeCamera = renderer.getActiveCamera(); // This is necessary to initialize the clipping range and it is not related
        // to our custom slabThickness.

        activeCamera.setThicknessFromFocalPoint(0.1); // This is necessary to give the slab thickness.
        // NOTE: our custom camera implementation has an additional slab thickness
        // values to handle MIP and non MIP volumes in the same viewport.

        activeCamera.setSlabThickness(slabThickness);
        activeCamera.setFreezeFocalPoint(true);
      } else {
        // Use default renderer resetCamera, fits bounding sphere of data.
        renderer.resetCamera();

        var _activeCamera = renderer.getActiveCamera();

        _activeCamera.setFreezeFocalPoint(true);
      }
    }
    /**
     * canvasToWorld Returns the world coordinates of the given `canvasPos`
     * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
     * and the direction of projection.
     *
     * @param canvasPos The position in canvas coordinates.
     * @returns The corresponding world coordinates.
     * @public
     */
    //public getCurrentImageId() : string | undefined => {
    // check current viewPlane and focal point from camera
    // against stack of imageIds. If we are within some precision,
    // return that imageId.
    //}
    // this api only exists here for developers that are displaying data
    // and who did not create a scene explicitly beforehand
    // (scenes are optional for the public API but internally created either way)

    /*setVolumes(a) {
      scene.setVolumes(a)
    }*/

  }]);

  return VolumeViewport;
}(RenderingEngine_Viewport);

/* harmony default export */ var RenderingEngine_VolumeViewport = (VolumeViewport);
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/arrayWithHoles.js
function _arrayWithHoles(arr) {
  if (Array.isArray(arr)) return arr;
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/iterableToArrayLimit.js
function _iterableToArrayLimit(arr, i) {
  var _i = arr && (typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"]);

  if (_i == null) return;
  var _arr = [];
  var _n = true;
  var _d = false;

  var _s, _e;

  try {
    for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) {
      _arr.push(_s.value);

      if (i && _arr.length === i) break;
    }
  } catch (err) {
    _d = true;
    _e = err;
  } finally {
    try {
      if (!_n && _i["return"] != null) _i["return"]();
    } finally {
      if (_d) throw _e;
    }
  }

  return _arr;
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/nonIterableRest.js
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/slicedToArray.js




function _slicedToArray(arr, i) {
  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
}
// EXTERNAL MODULE: external "vtk.js/Sources/Common/DataModel/ImageData"
var ImageData_ = __webpack_require__(253);
var ImageData_default = /*#__PURE__*/__webpack_require__.n(ImageData_);
// EXTERNAL MODULE: external "vtk.js/Sources/Rendering/Core/Volume"
var Core_Volume_ = __webpack_require__(3140);
var Core_Volume_default = /*#__PURE__*/__webpack_require__.n(Core_Volume_);
;// CONCATENATED MODULE: ./src/metaData.ts
// This module defines a way to access various metadata about an imageId.  This layer of abstraction exists
// So metadata can be provided in different ways (e.g. by parsing DICOM P10 or by a WADO-RS document)
var providers = [];
/**
 * Adds a metadata provider with the specified priority
 * @param {Function} provider Metadata provider function
 * @param {Number} [priority=0] - 0 is default/normal, > 0 is high, < 0 is low
 *
 * @returns {void}
 *
 * @function addProvider
 * @category MetaData
 */

function addProvider(provider) {
  var priority = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  var i; // Find the right spot to insert this provider based on priority

  for (i = 0; i < providers.length; i++) {
    if (providers[i].priority <= priority) {
      break;
    }
  } // Insert the decode task at position i


  providers.splice(i, 0, {
    priority: priority,
    provider: provider
  });
}
/**
 * Removes the specified provider
 *
 * @param {Function} provider Metadata provider function
 *
 * @returns {void}
 *
 * @function removeProvider
 * @category MetaData
 */

function removeProvider(provider) {
  for (var i = 0; i < providers.length; i++) {
    if (providers[i].provider === provider) {
      providers.splice(i, 1);
      break;
    }
  }
}
/**
 * Removes all providers
 *
 *
 * @returns {void}
 *
 * @function removeAllProviders
 * @category MetaData
 */

function removeAllProviders() {
  while (providers.length > 0) {
    providers.pop();
  }
}
/**
 * Gets metadata from the registered metadata providers.  Will call each one from highest priority to lowest
 * until one responds
 *
 * @param {String} type The type of metadata requested from the metadata store
 * @param {String} imageId The Cornerstone Image Object's imageId
 *
 * @returns {*} The metadata retrieved from the metadata store
 * @category MetaData
 */

function getMetaData(type, imageId) {
  // Invoke each provider in priority order until one returns something
  for (var i = 0; i < providers.length; i++) {
    var result = providers[i].provider(type, imageId);

    if (result !== undefined) {
      return result;
    }
  }
}

var metaData = {
  addProvider: addProvider,
  removeProvider: removeProvider,
  removeAllProviders: removeAllProviders,
  get: getMetaData
};

/* harmony default export */ var src_metaData = (metaData);
;// CONCATENATED MODULE: ./src/cache/cache.ts




function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = cache_unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it.return != null) it.return(); } finally { if (didErr) throw err; } } }; }

function cache_unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return cache_arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return cache_arrayLikeToArray(o, minLen); }

function cache_arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }





var MAX_CACHE_SIZE_1GB = 1073741824;

/**
 * This module deals with Caching of images and volumes
 * The cache has two main components: a volatile portion for images and a
 * non-volatile portion for volumes. Individual 2D images are volatile and
 * will be replaced by new images hitting the cache. When you allocate volumes,
 * these are non-volatile and reserve a block of memory from the cache.
 * Volumes must be released manually.
 * We will have a shared block of memory allocated for the entire cache, e.g. 1GB
 * which will be shared for images and volumes.
 *
 * **When a new image is added:**
 * We check if there is enough unallocated + volatile space for the single image
 *
 * if so
 * - We allocate the image in image cache, and if necessary oldest images
 * are decached to match the maximumCacheSize criteria
 * - If a volume contains that imageId, copy it over using TypedArray's set method.
 * If no volumes contain the imageId, the image is fetched by image loaders
 *
 * If not (cache is mostly/completely full with volumes)
 * - throw that the cache does not have enough working space to allocate the image
 *
 *
 * **When a new volume is added:**
 * Check if there is enough unallocated + volatile space to allocate the volume:
 *
 * If so:
 * - Decache oldest images which won't be included in this volume until
 * we have enough free space for the volume
 * - If not enough space from previous space, decache images that will be included
 * in the volume until we have enough free space (These will need to be re-fetched,
 * but we must do this not to straddle over the given memory limit, even for a
 * short time, as this may crash the app)
 * - At this point, if any of the frames (indexed by imageId) are present in the volatile
 * image cache, copy these over to the volume now
 *
 * If not (cache is mostly/completely full with volumes),
 * - throw that the cache does not have enough working space to allocate the volume.
 *
 */
var Cache = /*#__PURE__*/function () {
  // volatile space
  // non-volatile space
  function Cache() {
    var _this = this;

    _classCallCheck(this, Cache);

    _defineProperty(this, "_imageCache", void 0);

    _defineProperty(this, "_volumeCache", void 0);

    _defineProperty(this, "_imageCacheSize", void 0);

    _defineProperty(this, "_volumeCacheSize", void 0);

    _defineProperty(this, "_maxCacheSize", void 0);

    _defineProperty(this, "setMaxCacheSize", function (newMaxCacheSize) {
      if (!newMaxCacheSize || typeof newMaxCacheSize !== 'number') {
        var errorMessage = "New max cacheSize ".concat(_this._maxCacheSize, " should be defined and should be a number.");
        throw new Error(errorMessage);
      }

      _this._maxCacheSize = newMaxCacheSize;
    });

    _defineProperty(this, "isCacheable", function (byteLength) {
      var unallocatedSpace = _this.getBytesAvailable();

      var imageCacheSize = _this._imageCacheSize;

      if (unallocatedSpace + imageCacheSize < byteLength) {
        throw new Error(errorCodes.CACHE_SIZE_EXCEEDED);
      }
    });

    _defineProperty(this, "getMaxCacheSize", function () {
      return _this._maxCacheSize;
    });

    _defineProperty(this, "getCacheSize", function () {
      return _this._imageCacheSize + _this._volumeCacheSize;
    });

    _defineProperty(this, "_decacheImage", function (imageId) {
      var _this$_imageCache$get = _this._imageCache.get(imageId),
          imageLoadObject = _this$_imageCache$get.imageLoadObject; // Cancel any in-progress loading


      if (imageLoadObject.cancel) {
        imageLoadObject.cancel();
      }

      if (imageLoadObject.decache) {
        imageLoadObject.decache();
      }

      _this._imageCache.delete(imageId);
    });

    _defineProperty(this, "_decacheVolume", function (volumeId) {
      var cachedVolume = _this._volumeCache.get(volumeId);

      var volumeLoadObject = cachedVolume.volumeLoadObject; // Cancel any in-progress loading

      if (volumeLoadObject.cancel) {
        volumeLoadObject.cancel();
      }

      if (volumeLoadObject.decache) {
        volumeLoadObject.decache();
      } // Clear texture memory (it will probably only be released at garbage collection of the DOM element, but might as well try)
      // TODO We need to actually check if this particular scalar is used.
      // TODO: Put this in the volume loader's decache function?

      /*if (volume && volume.vtkOpenGLTexture) {
        volume.vtkOpenGLTexture.releaseGraphicsResources()
      }*/


      _this._volumeCache.delete(volumeId);
    });

    _defineProperty(this, "purgeCache", function () {
      var imageIterator = _this._imageCache.keys();
      /* eslint-disable no-constant-condition */


      while (true) {
        var _imageIterator$next = imageIterator.next(),
            imageId = _imageIterator$next.value,
            done = _imageIterator$next.done;

        if (done) {
          break;
        }

        _this.removeImageLoadObject(imageId);

        triggerEvent(src_eventTarget, events.IMAGE_CACHE_IMAGE_REMOVED, {
          imageId: imageId
        });
      }

      var volumeIterator = _this._volumeCache.keys();
      /* eslint-disable no-constant-condition */


      while (true) {
        var _volumeIterator$next = volumeIterator.next(),
            volumeId = _volumeIterator$next.value,
            _done = _volumeIterator$next.done;

        if (_done) {
          break;
        }

        _this.removeVolumeLoadObject(volumeId);

        triggerEvent(src_eventTarget, events.IMAGE_CACHE_VOLUME_REMOVED, {
          volumeId: volumeId
        });
      }
    });

    _defineProperty(this, "getVolumeLoadObject", function (volumeId) {
      if (volumeId === undefined) {
        throw new Error('getVolumeLoadObject: volumeId must not be undefined');
      }

      var cachedVolume = _this._volumeCache.get(volumeId);

      if (cachedVolume === undefined) {
        return;
      } // Bump time stamp for cached volume (not used for anything for now)


      cachedVolume.timeStamp = Date.now();
      return cachedVolume.volumeLoadObject;
    });

    _defineProperty(this, "getVolume", function (volumeId) {
      if (volumeId === undefined) {
        throw new Error('getVolume: volumeId must not be undefined');
      }

      var cachedVolume = _this._volumeCache.get(volumeId);

      if (cachedVolume === undefined) {
        return;
      } // Bump time stamp for cached volume (not used for anything for now)


      cachedVolume.timeStamp = Date.now();
      return cachedVolume.volume;
    });

    _defineProperty(this, "removeImageLoadObject", function (imageId) {
      if (imageId === undefined) {
        throw new Error('removeImageLoadObject: imageId must not be undefined');
      }

      var cachedImage = _this._imageCache.get(imageId);

      if (cachedImage === undefined) {
        throw new Error('removeImageLoadObject: imageId was not present in imageCache');
      }

      _this._incrementImageCacheSize(-cachedImage.sizeInBytes);

      var eventDetails = {
        image: cachedImage,
        imageId: imageId
      };
      triggerEvent(src_eventTarget, events.IMAGE_CACHE_IMAGE_REMOVED, eventDetails);

      _this._decacheImage(imageId);
    });

    _defineProperty(this, "removeVolumeLoadObject", function (volumeId) {
      if (volumeId === undefined) {
        throw new Error('removeVolumeLoadObject: volumeId must not be undefined');
      }

      var cachedVolume = _this._volumeCache.get(volumeId);

      if (cachedVolume === undefined) {
        throw new Error('removeVolumeLoadObject: volumeId was not present in volumeCache');
      }

      _this._incrementVolumeCacheSize(-cachedVolume.sizeInBytes);

      var eventDetails = {
        volume: cachedVolume,
        volumeId: volumeId
      };
      triggerEvent(src_eventTarget, events.IMAGE_CACHE_VOLUME_REMOVED, eventDetails);

      _this._decacheVolume(volumeId);
    });

    _defineProperty(this, "_incrementImageCacheSize", function (increment) {
      _this._imageCacheSize += increment;
    });

    _defineProperty(this, "_incrementVolumeCacheSize", function (increment) {
      _this._volumeCacheSize += increment;
    });

    this._imageCache = new Map();
    this._volumeCache = new Map();
    this._imageCacheSize = 0;
    this._volumeCacheSize = 0;
    this._maxCacheSize = MAX_CACHE_SIZE_1GB; // Default 1GB
  }
  /**
   * Set the maximum cache Size
   *
   * Maximum cache size should be set before adding the data; otherwise, it
   * will throw an error.
   *
   * @param {number} newMaxCacheSize new maximum cache size
   *
   * @returns {void}
   */


  _createClass(Cache, [{
    key: "getBytesAvailable",
    value:
    /**
     * Returns the unallocated size of the cache
     *
     */
    function getBytesAvailable() {
      return this.getMaxCacheSize() - this.getCacheSize();
    }
    /**
     * Deletes the imageId from the image cache
     *
     * @param {string} imageId imageId
     *
     * @returns {void}
     */

  }, {
    key: "decacheIfNecessaryUntilBytesAvailable",
    value:
    /**
     * Purges the cache if necessary based on the requested number of bytes
     *
     * 1) it sorts the volatile (image) cache based on the most recent used images
     * and starts purging from the oldest ones.
     * Note: for a volume, if the volume-related image Ids is provided, it starts
     * by purging the none-related image Ids (those that are not related to the
     * current volume)
     * 2) For a volume, if we purge all images that won't be included in this volume and still
     * don't have enough unallocated space, purge images that will be included
     * in this volume until we have enough space. These will need to be
     * re-fetched, but we must do this not to straddle over the given memory
     * limit, even for a short time, as this may crash the application.
     *
     * @params {number} numBytes - Number of bytes for the image/volume that is
     * going to be stored inside the cache
     * @params {Array} [volumeImageIds] list of imageIds that correspond to the
     * volume whose numberOfBytes we want to store in the cache.
     * @returns {number | undefined} bytesAvailable or undefined in purging cache
     * does not successfully make enough space for the requested number of bytes
     */
    function decacheIfNecessaryUntilBytesAvailable(numBytes, volumeImageIds) {
      var bytesAvailable = this.getBytesAvailable(); // If max cache size has not been exceeded, do nothing

      if (bytesAvailable >= numBytes) {
        return bytesAvailable;
      }

      var cachedImages = Array.from(this._imageCache.values()); // Cache size has been exceeded, create list of images sorted by timeStamp
      // So we can purge the least recently used image

      function compare(a, b) {
        if (a.timeStamp > b.timeStamp) {
          return 1;
        }

        if (a.timeStamp < b.timeStamp) {
          return -1;
        }

        return 0;
      }

      cachedImages.sort(compare);
      var cachedImageIds = cachedImages.map(function (im) {
        return im.imageId;
      });
      var imageIdsToPurge = cachedImageIds; // if we are making space for a volume, we start by purging the imageIds
      // that are not related to the volume

      if (volumeImageIds) {
        imageIdsToPurge = cachedImageIds.filter(function (id) {
          return !volumeImageIds.includes(id);
        });
      } // Remove images (that are not related to the volume) from volatile cache
      // until the requested number of bytes become available


      var _iterator = _createForOfIteratorHelper(imageIdsToPurge),
          _step;

      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var imageId = _step.value;
          this.removeImageLoadObject(imageId);
          triggerEvent(src_eventTarget, events.IMAGE_CACHE_IMAGE_REMOVED, {
            imageId: imageId
          });
          bytesAvailable = this.getBytesAvailable();

          if (bytesAvailable >= numBytes) {
            return bytesAvailable;
          }
        } // Remove the imageIds (both volume related and not related)

      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }

      cachedImages = Array.from(this._imageCache.values());
      cachedImageIds = cachedImages.map(function (im) {
        return im.imageId;
      }); // Remove volume-image Ids from volatile cache until the requested number of bytes
      // become available

      var _iterator2 = _createForOfIteratorHelper(cachedImageIds),
          _step2;

      try {
        for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
          var _imageId = _step2.value;
          this.removeImageLoadObject(_imageId);
          triggerEvent(src_eventTarget, events.IMAGE_CACHE_IMAGE_REMOVED, {
            imageId: _imageId
          });
          bytesAvailable = this.getBytesAvailable();

          if (bytesAvailable >= numBytes) {
            return bytesAvailable;
          }
        } // Technically we should not reach here, since isCacheable will throw an
        // error if unallocated + volatile (image) cache cannot fit the upcoming
        // number of bytes

      } catch (err) {
        _iterator2.e(err);
      } finally {
        _iterator2.f();
      }
    }
    /**
     * Puts a new image load object into the cache
     *
     * First, it creates a CachedImage object and put it inside the imageCache for
     * the imageId. After the imageLoadObject promise resolves to an image,
     * it: 1) adds the image into the correct CachedImage object 2) increments the
     * cache size, 3) triggers IMAGE_CACHE_IMAGE_ADDED  4) Purge the cache if
     * necessary -- if the cache size is greater than the maximum cache size, it
     * iterates over the imageCache and decache them one by one until the cache
     * size becomes less than the maximum allowed cache size
     *
     * @param {string} imageId ImageId for the image
     * @param {Object} imageLoadObject The object that is loading or loaded the image
     * @returns {void}
     */

  }, {
    key: "putImageLoadObject",
    value: function putImageLoadObject(imageId, imageLoadObject) {
      var _this2 = this;

      if (imageId === undefined) {
        throw new Error('putImageLoadObject: imageId must not be undefined');
      }

      if (imageLoadObject.promise === undefined) {
        throw new Error('putImageLoadObject: imageLoadObject.promise must not be undefined');
      }

      if (this._imageCache.has(imageId)) {
        throw new Error('putImageLoadObject: imageId already in cache');
      }

      if (imageLoadObject.cancel && typeof imageLoadObject.cancel !== 'function') {
        throw new Error('putImageLoadObject: imageLoadObject.cancel must be a function');
      }

      var cachedImage = {
        loaded: false,
        imageId: imageId,
        sharedCacheKey: undefined,
        // The sharedCacheKey for this imageId.  undefined by default
        imageLoadObject: imageLoadObject,
        timeStamp: Date.now(),
        sizeInBytes: 0
      };

      this._imageCache.set(imageId, cachedImage);

      return imageLoadObject.promise.then(function (image) {
        if (!_this2._imageCache.get(imageId)) {
          // If the image has been purged before being loaded, we stop here.
          console.warn('The image was purged from the cache before it completed loading.');
          return;
        }

        if (image.sizeInBytes === undefined) {
          throw new Error('putImageLoadObject: image.sizeInBytes must not be undefined');
        }

        if (image.sizeInBytes.toFixed === undefined) {
          throw new Error('putImageLoadObject: image.sizeInBytes is not a number');
        } // check if there is enough space in unallocated + image Cache


        _this2.isCacheable(image.sizeInBytes); // if there is, decache if necessary


        _this2.decacheIfNecessaryUntilBytesAvailable(image.sizeInBytes);

        cachedImage.loaded = true;
        cachedImage.image = image;
        cachedImage.sizeInBytes = image.sizeInBytes;

        _this2._incrementImageCacheSize(cachedImage.sizeInBytes);

        var eventDetails = {
          image: cachedImage
        };
        triggerEvent(src_eventTarget, events.IMAGE_CACHE_IMAGE_ADDED, eventDetails);
        cachedImage.sharedCacheKey = image.sharedCacheKey;
      }).catch(function (error) {
        // console.warn(error)
        _this2._imageCache.delete(imageId);

        throw error;
      });
    }
    /**
     * Returns the object that is loading a given imageId
     *
     * @param {string} imageId Image ID
     * @returns {void}
     */

  }, {
    key: "getImageLoadObject",
    value: function getImageLoadObject(imageId) {
      if (imageId === undefined) {
        throw new Error('getImageLoadObject: imageId must not be undefined');
      }

      var cachedImage = this._imageCache.get(imageId);

      if (cachedImage === undefined) {
        return;
      } // Bump time stamp for cached image


      cachedImage.timeStamp = Date.now();
      return cachedImage.imageLoadObject;
    }
    /**
     * Returns the volume that contains the requested imageId. It will check the
     * imageIds inside the volume to find a match.
     *
     * @param {string} imageId Image ID
     * @returns {{ImageVolume, string}|undefined} {volume, imageIdIndex}
     */

  }, {
    key: "getVolumeContainingImageId",
    value: function getVolumeContainingImageId(imageId) {
      var volumeIds = Array.from(this._volumeCache.keys());
      var imageIdToUse = imageIdToURI(imageId);

      for (var _i = 0, _volumeIds = volumeIds; _i < _volumeIds.length; _i++) {
        var volumeId = _volumeIds[_i];

        var cachedVolume = this._volumeCache.get(volumeId);

        var volumeImageIds = cachedVolume.volume.imageIds;
        volumeImageIds = volumeImageIds.map(function (id) {
          return imageIdToURI(id);
        });
        var imageIdIndex = volumeImageIds.indexOf(imageIdToUse);

        if (imageIdIndex > -1) {
          return {
            volume: cachedVolume.volume,
            imageIdIndex: imageIdIndex
          };
        }
      }
    }
    /**
     * Returns the cached image from the imageCache for the requested imageId.
     * It first strips the imageId to remove the data loading scheme.
     *
     * @param {string} imageId Image ID
     * @returns {CachedImage} cached image
     */

  }, {
    key: "getCachedImageBasedOnImageURI",
    value: function getCachedImageBasedOnImageURI(imageId) {
      var imageIdToUse = imageIdToURI(imageId);
      var imageIdsInCache = Array.from(this._imageCache.keys());
      var foundImageId = imageIdsInCache.find(function (id) {
        return id.indexOf(imageIdToUse) !== -1;
      });
      return this._imageCache.get(foundImageId);
    }
    /**
     * Puts a new image load object into the cache
     *
     * First, it creates a CachedVolume object and put it inside the volumeCache for
     * the volumeId. After the volumeLoadObject promise resolves to a volume,
     * it: 1) adds the volume into the correct CachedVolume object inside volumeCache
     * 2) increments the cache size, 3) triggers IMAGE_CACHE_VOLUME_ADDED  4) Purge
     * the cache if necessary -- if the cache size is greater than the maximum cache size, it
     * iterates over the imageCache (not volumeCache) and decache them one by one
     * until the cache size becomes less than the maximum allowed cache size
     *
     * @param {string} volumeId volumeId of the volume
     * @param {Object} volumeLoadObject The object that is loading or loaded the volume
     * @returns {void}
     */

  }, {
    key: "putVolumeLoadObject",
    value: function putVolumeLoadObject(volumeId, volumeLoadObject) {
      var _this3 = this;

      if (volumeId === undefined) {
        throw new Error('putVolumeLoadObject: volumeId must not be undefined');
      }

      if (volumeLoadObject.promise === undefined) {
        throw new Error('putVolumeLoadObject: volumeLoadObject.promise must not be undefined');
      }

      if (this._volumeCache.has(volumeId)) {
        throw new Error('putVolumeLoadObject: volumeId already in cache');
      }

      if (volumeLoadObject.cancel && typeof volumeLoadObject.cancel !== 'function') {
        throw new Error('putVolumeLoadObject: volumeLoadObject.cancel must be a function');
      } // todo: @Erik there are two loaded flags, one inside cachedVolume and the other
      // inside the volume.loadStatus.loaded, the actual all pixelData loaded is the
      // loadStatus one. This causes confusion


      var cachedVolume = {
        loaded: false,
        volumeId: volumeId,
        volumeLoadObject: volumeLoadObject,
        timeStamp: Date.now(),
        sizeInBytes: 0
      };

      this._volumeCache.set(volumeId, cachedVolume);

      return volumeLoadObject.promise.then(function (volume) {
        if (!_this3._volumeCache.get(volumeId)) {
          // If the image has been purged before being loaded, we stop here.
          console.warn('The image was purged from the cache before it completed loading.');
          return;
        }

        if (volume.sizeInBytes === undefined) {
          throw new Error('putVolumeLoadObject: volume.sizeInBytes must not be undefined');
        }

        if (volume.sizeInBytes.toFixed === undefined) {
          throw new Error('putVolumeLoadObject: volume.sizeInBytes is not a number');
        } // this.isCacheable is called at the volume loader, before requesting
        // the images of the volume


        _this3.decacheIfNecessaryUntilBytesAvailable(volume.sizeInBytes, // @ts-ignore: // todo ImageVolume does not have imageIds
        volume.imageIds); // cachedVolume.loaded = true


        cachedVolume.volume = volume;
        cachedVolume.sizeInBytes = volume.sizeInBytes;

        _this3._incrementVolumeCacheSize(cachedVolume.sizeInBytes);

        var eventDetails = {
          volume: cachedVolume,
          volumeId: volumeId
        };
        triggerEvent(src_eventTarget, events.IMAGE_CACHE_VOLUME_ADDED, eventDetails);
      }).catch(function (error) {
        _this3._volumeCache.delete(volumeId);

        throw error;
      });
    }
    /**
     * Returns the object that is loading a given volumeId
     *
     * @param {string} volumeId Volume ID
     * @returns {void}
     */

  }]);

  return Cache;
}();

var cache_cache = new Cache();
/* harmony default export */ var src_cache_cache = (cache_cache);
 // for documentation
;// CONCATENATED MODULE: ./src/requestPool/getMaxSimultaneousRequests.js
var configMaxSimultaneousRequests; // Maximum concurrent connections to the same server
// Information from http://sgdev-blog.blogspot.fr/2014/01/maximum-concurrent-connection-to-same.html

var maxSimultaneousRequests = {
  default: 16,
  IE: {
    9: 6,
    10: 8,
    default: 8
  },
  Firefox: {
    default: 6
  },
  Opera: {
    10: 8,
    11: 6,
    12: 6,
    default: 6
  },
  Chrome: {
    default: 16
  },
  Safari: {
    default: 6
  }
}; // Browser name / version detection
//
//

/**
 * Browser name / version detection
 * http://stackoverflow.com/questions/2400935/browser-detection-in-javascript
 * @export @public @method
 * @name getBrowserInfo
 *
 * @returns {string} The name and version of the browser.
 */

function getBrowserInfo() {
  var ua = navigator.userAgent;
  var M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
  var tem;

  if (/trident/i.test(M[1])) {
    tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
    return "IE ".concat(tem[1] || '');
  }

  if (M[1] === 'Chrome') {
    tem = ua.match(/\b(OPR|Edge)\/(\d+)/);

    if (tem !== null) {
      return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }
  }

  M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];

  if ((tem = ua.match(/version\/(\d+)/i)) !== null) {
    M.splice(1, 1, tem[1]);
  }

  return M.join(' ');
}
/**
 * Sets the maximum number of simultaneous requests.
 * @export @public @method
 * @name setMaxSimultaneousRequests
 *
 * @param  {number} newMaxSimultaneousRequests The value.
 * @returns {void}
 */


function setMaxSimultaneousRequests(newMaxSimultaneousRequests) {
  configMaxSimultaneousRequests = newMaxSimultaneousRequests;
}
/**
 * Returns the maximum number of simultaneous requests.
 * @export @public @method
 * @name getMaxSimultaneousRequests
 *
 * @returns {number} The maximum number of simultaneous requests
 */


function getMaxSimultaneousRequests() {
  if (configMaxSimultaneousRequests) {
    return configMaxSimultaneousRequests;
  }

  return getDefaultSimultaneousRequests();
}
/**
 * Returns the default number of simultaneous requests.
 * @export @public @method
 * @name getDefaultSimultaneousRequests
 *
 * @returns {number} The default number of simultaneous requests.
 */


function getDefaultSimultaneousRequests() {
  var infoString = getBrowserInfo();
  var info = infoString.split(' ');
  var browserName = info[0];
  var browserVersion = info[1];
  var browserData = maxSimultaneousRequests[browserName];

  if (!browserData) {
    return maxSimultaneousRequests.default;
  }

  if (!browserData[browserVersion]) {
    return browserData.default;
  }

  return browserData[browserVersion];
}
/**
 * Checks if cornerstoneTools is operating on a mobile device.
 * @export @public @method
 * @name isMobileDevice
 *
 * @returns {boolean} True if running on a mobile device.
 */


function isMobileDevice() {
  var pattern = new RegExp('Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini');
  return pattern.test(navigator.userAgent);
}


;// CONCATENATED MODULE: ./src/requestPool/requestPoolManager.ts
function requestPoolManager_createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = requestPoolManager_unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it.return != null) it.return(); } finally { if (didErr) throw err; } } }; }

function requestPoolManager_unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return requestPoolManager_arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return requestPoolManager_arrayLikeToArray(o, minLen); }

function requestPoolManager_arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }


// priority is fixed for interaction and thumbnail to be 0, however,
// the priority of prefetch can be configured and it can have priorities other
// than 0 (highest priority)
var requestPool = {
  interaction: {
    0: []
  },
  thumbnail: {
    0: []
  },
  prefetch: {
    0: []
  }
};
var numRequests = {
  interaction: 0,
  thumbnail: 0,
  prefetch: 0
};
var maxNumRequests = {
  interaction: 6,
  thumbnail: 6,
  prefetch: 5
};
var awake = false;
var grabDelay = 5;
/**
 * Adds the requests to the pool of requests.
 *
 * @param requestFn - A function that returns a promise which resolves in the image
 * @param type - Priority category, it can be either of interaction, prefetch,
 * or thumbnail.
 * @param additionalDetails - Additional details that requests can contain.
 * For instance the volumeUID for the volume requests
 * @param priority - Priority number for each category of requests. Its default
 * value is priority 0. The lower the priority number, the higher the priority number
 *
 * @returns void
 *
 */

function addRequest(requestFn, type, additionalDetails) {
  var priority = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
  // Describe the request
  var requestDetails = {
    requestFn: requestFn,
    type: type,
    additionalDetails: additionalDetails
  }; // Check if the priority group exists on the request type

  if (requestPool[type][priority] === undefined) {
    requestPool[type][priority] = [];
  } // Adding the request to the correct priority group of the request type


  requestPool[type][priority].push(requestDetails); // Wake up

  if (!awake) {
    awake = true;
    startGrabbing();
  }
}
/**
 * Filter the requestPoolManager's pool of request based on the result of
 * provided filter function. The provided filter function needs to return false or true
 *
 * @param filterFunction The filter function for filtering of the requests to keep
 * @category requestPool
 */


function filterRequests(filterFunction) {
  Object.keys(requestPool).forEach(function (type) {
    var requestType = requestPool[type];
    Object.keys(requestType).forEach(function (priority) {
      requestType[priority] = requestType[priority].filter(function (requestDetails) {
        return filterFunction(requestDetails);
      });
    });
  });
}
/**
 * Clears the requests specific to the provided type. For instance, the
 * pool of requests of type 'interaction' can be cleared via this function.
 *
 *
 * @param type category of the request (either interaction, prefetch or thumbnail)
 * @category requestPool
 */


function clearRequestStack(type) {
  if (!requestPool[type]) {
    throw new Error("No category for the type ".concat(type, " found"));
  }

  requestPool[type] = {
    0: []
  };
}

function startAgain() {
  if (!awake) {
    return;
  }

  setTimeout(function () {
    startGrabbing();
  }, grabDelay);
}

function sendRequest(_ref) {
  var requestFn = _ref.requestFn,
      type = _ref.type;
  // Increment the number of current requests of this type
  numRequests[type]++;
  awake = true;
  requestFn().finally(function () {
    numRequests[type]--;
    startAgain();
  });
}

function startGrabbing() {
  // Begin by grabbing X images
  var maxSimultaneousRequests = getMaxSimultaneousRequests();
  maxNumRequests = {
    interaction: Math.max(maxSimultaneousRequests, 1),
    thumbnail: Math.max(maxSimultaneousRequests - 2, 1),
    prefetch: Math.max(maxSimultaneousRequests - 1, 1)
  };
  var currentRequests = numRequests.interaction + numRequests.thumbnail + numRequests.prefetch;
  var requestsToSend = maxSimultaneousRequests - currentRequests;

  for (var i = 0; i < requestsToSend; i++) {
    var _requestDetails = getNextRequest();

    if (_requestDetails) {
      sendRequest(_requestDetails);
    }
  }
}

function getSortedPriorityGroups(type) {
  var priorities = Object.keys(requestPool[type]).map(Number).filter(function (priority) {
    return requestPool[type][priority].length;
  }).sort();
  return priorities;
}

function getNextRequest() {
  var interactionPriorities = getSortedPriorityGroups('interaction');

  var _iterator = requestPoolManager_createForOfIteratorHelper(interactionPriorities),
      _step;

  try {
    for (_iterator.s(); !(_step = _iterator.n()).done;) {
      var priority = _step.value;

      if (requestPool.interaction[priority].length && numRequests.interaction < maxNumRequests.interaction) {
        return requestPool.interaction[priority].shift();
      }
    }
  } catch (err) {
    _iterator.e(err);
  } finally {
    _iterator.f();
  }

  var thumbnailPriorities = getSortedPriorityGroups('thumbnail');

  var _iterator2 = requestPoolManager_createForOfIteratorHelper(thumbnailPriorities),
      _step2;

  try {
    for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
      var _priority = _step2.value;

      if (requestPool.thumbnail[_priority].length && numRequests.thumbnail < maxNumRequests.thumbnail) {
        return requestPool.thumbnail[_priority].shift();
      }
    }
  } catch (err) {
    _iterator2.e(err);
  } finally {
    _iterator2.f();
  }

  var prefetchPriorities = getSortedPriorityGroups('prefetch');

  var _iterator3 = requestPoolManager_createForOfIteratorHelper(prefetchPriorities),
      _step3;

  try {
    for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
      var _priority2 = _step3.value;

      if (requestPool.prefetch[_priority2].length && numRequests.prefetch < maxNumRequests.prefetch) {
        return requestPool.prefetch[_priority2].shift();
      }
    }
  } catch (err) {
    _iterator3.e(err);
  } finally {
    _iterator3.f();
  }

  if (!interactionPriorities.length && !thumbnailPriorities.length && !prefetchPriorities.length) {
    awake = false;
  }

  return false;
}
/**
 * Returns the request pool containing different categories, their priority and
 * the added request details.
 *
 * @returns
 * @category requestPool
 */


function getRequestPool() {
  return requestPool;
}

var requestPoolManager = {
  addRequest: addRequest,
  clearRequestStack: clearRequestStack,
  getRequestPool: getRequestPool,
  filterRequests: filterRequests
};
/* harmony default export */ var requestPool_requestPoolManager = (requestPoolManager);
;// CONCATENATED MODULE: ./src/imageLoader.ts






/**
 * This module deals with ImageLoaders, loading images and caching images
 * @module
 */
var imageLoaders = {};
var unknownImageLoader;
/**
 * Loads an image using a registered Cornerstone Image Loader.
 *
 * The image loader that is used will be
 * determined by the image loader scheme matching against the imageId.
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @category ImageLoader
 */

function loadImageFromImageLoader(imageId, options) {
  // Extract the image loader scheme: wadors:https://image1 => wadors
  var colonIndex = imageId.indexOf(':');
  var scheme = imageId.substring(0, colonIndex);
  var loader = imageLoaders[scheme];

  if (loader === undefined || loader === null) {
    if (unknownImageLoader !== undefined) {
      return unknownImageLoader(imageId);
    }

    throw new Error('loadImageFromImageLoader: no image loader for imageId');
  } // Load using the registered loader


  var imageLoadObject = loader(imageId, options); // Broadcast an image loaded event once the image is loaded

  imageLoadObject.promise.then(function (image) {
    triggerEvent(src_eventTarget, events.IMAGE_LOADED, {
      image: image
    });
  }, function (error) {
    var errorObject = {
      imageId: imageId,
      error: error
    };
    triggerEvent(src_eventTarget, events.IMAGE_LOAD_FAILED, errorObject);
  });
  return imageLoadObject;
}
/**
 * Gets the imageLoadObject by 1) Looking in to the cache to see if the
 * imageLoadObject has already been cached, 2) Checks inside the volume cache
 * to see if there is a volume that contains the same imageURI for the requested
 * imageID 3) Checks inside the imageCache for similar imageURI that might have
 * been stored as a result of decaching a volume 4) Finally if none were found
 * it request it from the registered imageLoaders.
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} options Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @category ImageLoader
 */


function loadImageFromCacheOrVolume(imageId, options) {
  // 1. Check inside the image cache for imageId
  var imageLoadObject = src_cache_cache.getImageLoadObject(imageId);

  if (imageLoadObject !== undefined) {
    return imageLoadObject;
  } // 2. Check if there exists a volume in the cache containing the imageId,
  // we copy the pixelData over.


  var cachedVolumeInfo = src_cache_cache.getVolumeContainingImageId(imageId);

  if (cachedVolumeInfo && cachedVolumeInfo.volume.loadStatus.loaded) {
    // 2.1 Convert the volume at the specific slice to a cornerstoneImage object.
    // this will copy the pixel data over.
    var volume = cachedVolumeInfo.volume,
        imageIdIndex = cachedVolumeInfo.imageIdIndex;
    imageLoadObject = volume.convertToCornerstoneImage(imageId, imageIdIndex);
    return imageLoadObject;
  } // 3. If no volume found, we search inside the imageCache for the imageId
  // that has the same URI which had been cached if the volume was converted
  // to an image


  var cachedImage = src_cache_cache.getCachedImageBasedOnImageURI(imageId);

  if (cachedImage) {
    imageLoadObject = cachedImage.imageLoadObject;
    return imageLoadObject;
  } // 4. if not in image cache nor inside the volume cache, we request the
  // image loaders to load it


  imageLoadObject = loadImageFromImageLoader(imageId, options);
  return imageLoadObject;
}
/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The loaded image is not stored in the cache.
 *
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @category ImageLoader
 */


function loadImage(imageId) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
    priority: 0,
    requestType: 'prefetch'
  };

  if (imageId === undefined) {
    throw new Error('loadImage: parameter imageId must not be undefined');
  }

  return loadImageFromCacheOrVolume(imageId, options).promise;
}
/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The image is stored in the cache.
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} Image Loader Object
 * @category ImageLoader
 */

function loadAndCacheImage(imageId) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
    priority: 0,
    requestType: 'prefetch'
  };

  if (imageId === undefined) {
    throw new Error('loadAndCacheImage: parameter imageId must not be undefined');
  }

  var imageLoadObject = loadImageFromCacheOrVolume(imageId, options); // if not inside cache, store it

  if (!src_cache_cache.getImageLoadObject(imageId)) {
    src_cache_cache.putImageLoadObject(imageId, imageLoadObject).catch(function (err) {
      console.warn(err);
    });
  }

  return imageLoadObject.promise;
}
/**
 * Load and cache a list of imageIds
 *
 * @param {Array} imageIds list of imageIds
 * @param {ImageLoaderOptions} options options for loader
 * @category ImageLoader
 *
 */

function loadAndCacheImages(imageIds) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
    priority: 0,
    requestType: 'prefetch'
  };

  if (!imageIds || imageIds.length === 0) {
    throw new Error('loadAndCacheImages: parameter imageIds must be list of image Ids');
  }

  var allPromises = imageIds.map(function (imageId) {
    return loadAndCacheImage(imageId, options);
  });
  return allPromises;
}
/**
 * Removes the imageId from the request pool manager
 *
 * @param {String} imageId
 *
 * @returns {void}
 * @category ImageLoader
 */

function cancelLoadImage(imageId) {
  var filterFunction = function filterFunction(_ref) {
    var additionalDetails = _ref.additionalDetails;

    if (additionalDetails.imageId) {
      return additionalDetails.imageId !== imageId;
    } // for volumes


    return true;
  }; // Instruct the request pool manager to filter queued
  // requests to ensure requests we no longer need are
  // no longer sent.


  requestPool_requestPoolManager.filterRequests(filterFunction); // cancel image loading if in progress

  var imageLoadObject = src_cache_cache.getImageLoadObject(imageId);

  if (imageLoadObject) {
    imageLoadObject.cancel();
  }
}
/**
 * Removes the imageIds from the request pool manager
 *
 * @param {Array} Array of imageIds
 *
 * @returns {void}
 * @category ImageLoader
 */

function cancelLoadImages(imageIds) {
  imageIds.forEach(function (imageId) {
    return cancelLoadImage(imageId);
  });
}
/**
 * Removes all the requests
 *
 * @param {Array} Array of imageIds
 *
 * @returns {void}
 * @category ImageLoader
 */

function cancelLoadAll() {
  var requestPool = requestPool_requestPoolManager.getRequestPool();
  Object.keys(requestPool).forEach(function (type) {
    var requests = requestPool[type];
    Object.keys(requests).forEach(function (priority) {
      var requestDetails = requests[priority].pop();
      var _requestDetails$addit = requestDetails.additionalDetails,
          imageId = _requestDetails$addit.imageId,
          volumeUID = _requestDetails$addit.volumeUID;
      var loadObject;

      if (imageId) {
        loadObject = src_cache_cache.getImageLoadObject(imageId);
      } else if (volumeUID) {
        loadObject = src_cache_cache.getVolumeLoadObject(volumeUID);
      }

      if (loadObject) {
        loadObject.cancel();
      }
    }); // reseting the pool types to be empty

    requestPool_requestPoolManager.clearRequestStack(type);
  });
}
/**
 * Registers an imageLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this image loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} imageLoader A Cornerstone Image Loader function
 * @returns {void}
 * @category ImageLoader
 */

function registerImageLoader(scheme, imageLoader) {
  imageLoaders[scheme] = imageLoader;
}
/**
 * Registers a new unknownImageLoader and returns the previous one
 *
 * @param {Function} imageLoader A Cornerstone Image Loader
 *
 * @returns {Function|Undefined} The previous Unknown Image Loader
 * @category ImageLoader
 */

function registerUnknownImageLoader(imageLoader) {
  var oldImageLoader = unknownImageLoader;
  unknownImageLoader = imageLoader;
  return oldImageLoader;
}
/**
 * Removes all registered and unknown image loaders
 *
 * @returns {void}
 * @category ImageLoader
 */

function unregisterAllImageLoaders() {
  Object.keys(imageLoaders).forEach(function (imageLoader) {
    return delete imageLoaders[imageLoader];
  });
  unknownImageLoader = undefined;
}
;// CONCATENATED MODULE: ./src/RenderingEngine/StackViewport.ts










function StackViewport_createSuper(Derived) { var hasNativeReflectConstruct = StackViewport_isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }

function StackViewport_isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
















/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
var StackViewport = /*#__PURE__*/function (_Viewport) {
  _inherits(StackViewport, _Viewport);

  var _super = StackViewport_createSuper(StackViewport);

  // private _stackActors: Map<string, any>
  // vtk image data
  function StackViewport(props) {
    var _this;

    _classCallCheck(this, StackViewport);

    _this = _super.call(this, props);

    _defineProperty(_assertThisInitialized(_this), "imageIds", void 0);

    _defineProperty(_assertThisInitialized(_this), "currentImageIdIndex", void 0);

    _defineProperty(_assertThisInitialized(_this), "_imageData", void 0);

    _defineProperty(_assertThisInitialized(_this), "stackActorVOI", void 0);

    _defineProperty(_assertThisInitialized(_this), "getFrameOfReferenceUID", function () {
      // Get the current image that is displayed in the viewport
      var imageId = _this.getCurrentImageId(); // Use the metadata provider to grab its imagePlaneModule metadata


      var imagePlaneModule = src_metaData.get('imagePlaneModule', imageId); // If nothing exists, return undefined

      if (!imagePlaneModule) {
        return;
      } // Otherwise, provide the FrameOfReferenceUID so we can map
      // annotations made on VolumeViewports back to StackViewports
      // and vice versa


      return imagePlaneModule.frameOfReferenceUID;
    });

    _defineProperty(_assertThisInitialized(_this), "createActorMapper", function (imageData) {
      var mapper = Core_VolumeMapper_default().newInstance();
      mapper.setInputData(imageData);
      mapper.setSampleDistance(1.0);
      var actor = Core_Volume_default().newInstance();
      actor.setMapper(mapper);
      var sampleDistance = 1.2 * Math.sqrt(imageData.getSpacing().map(function (v) {
        return v * v;
      }).reduce(function (a, b) {
        return a + b;
      }, 0));
      mapper.setSampleDistance(sampleDistance); // Todo: for some reason the following logic led to warning for sampleDistance
      // being greater than the allowed limit
      // const spacing = imageData.getSpacing()
      // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
      // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
      // const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6
      // @ts-ignore: vtkjs incorrect typing

      var tfunc = actor.getProperty().getRGBTransferFunction(0);

      if (!_this.stackActorVOI) {
        // setting the range for the first time
        var range = imageData.getPointData().getScalars().getRange();
        tfunc.setRange(range[0], range[1]);
        _this.stackActorVOI = {
          lower: range[0],
          upper: range[1]
        };
      } else {
        // keeping the viewport range for a new image
        var _this$stackActorVOI = _this.stackActorVOI,
            lower = _this$stackActorVOI.lower,
            upper = _this$stackActorVOI.upper;
        tfunc.setRange(lower, upper);
      }

      if (imageData.getPointData().getNumberOfComponents() > 1) {
        // @ts-ignore: vtkjs incorrect typing
        actor.getProperty().setIndependentComponents(false);
      }

      return actor;
    });

    _defineProperty(_assertThisInitialized(_this), "canvasToWorld", function (canvasPos) {
      var renderer = _this.getRenderer();

      var offscreenMultiRenderWindow = _this.getRenderingEngine().offscreenMultiRenderWindow;

      var openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
      var size = openGLRenderWindow.getSize();
      var displayCoord = [canvasPos[0] + _this.sx, canvasPos[1] + _this.sy]; // The y axis display coordinates are inverted with respect to canvas coords

      displayCoord[1] = size[1] - displayCoord[1];
      return openGLRenderWindow.displayToWorld(displayCoord[0], displayCoord[1], 0, renderer);
    });

    _defineProperty(_assertThisInitialized(_this), "worldToCanvas", function (worldPos) {
      var renderer = _this.getRenderer();

      var offscreenMultiRenderWindow = _this.getRenderingEngine().offscreenMultiRenderWindow;

      var openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
      var size = openGLRenderWindow.getSize();
      var displayCoord = openGLRenderWindow.worldToDisplay.apply(openGLRenderWindow, _toConsumableArray(worldPos).concat([renderer])); // The y axis display coordinates are inverted with respect to canvas coords

      displayCoord[1] = size[1] - displayCoord[1];
      var canvasCoord = [displayCoord[0] - _this.sx, displayCoord[1] - _this.sy];
      return canvasCoord;
    });

    _defineProperty(_assertThisInitialized(_this), "getCurrentImageIdIndex", function () {
      return _this.currentImageIdIndex;
    });

    _defineProperty(_assertThisInitialized(_this), "getImageIds", function () {
      return _this.imageIds;
    });

    _defineProperty(_assertThisInitialized(_this), "getCurrentImageId", function () {
      return _this.imageIds[_this.currentImageIdIndex];
    });

    var _renderer = _this.getRenderer();

    var camera = Core_Camera_default().newInstance();

    _renderer.setActiveCamera(camera);

    var _this$defaultOptions$ = _this.defaultOptions.orientation,
        sliceNormal = _this$defaultOptions$.sliceNormal,
        viewUp = _this$defaultOptions$.viewUp;
    camera.setDirectionOfProjection(-sliceNormal[0], -sliceNormal[1], -sliceNormal[2]);
    camera.setViewUp.apply(camera, _toConsumableArray(viewUp));
    camera.setParallelProjection(true); // @ts-ignore: vtkjs incorrect typing

    camera.setFreezeFocalPoint(true);
    _this.imageIds = [];
    _this.currentImageIdIndex = 0;

    _this.resetCamera();

    return _this;
  }

  _createClass(StackViewport, [{
    key: "buildMetadata",
    value: function buildMetadata(imageId) {
      var _metaData$get = src_metaData.get('imagePixelModule', imageId),
          pixelRepresentation = _metaData$get.pixelRepresentation,
          bitsAllocated = _metaData$get.bitsAllocated,
          bitsStored = _metaData$get.bitsStored,
          highBit = _metaData$get.highBit,
          photometricInterpretation = _metaData$get.photometricInterpretation,
          samplesPerPixel = _metaData$get.samplesPerPixel;

      var _metaData$get2 = src_metaData.get('voiLutModule', imageId),
          windowWidth = _metaData$get2.windowWidth,
          windowCenter = _metaData$get2.windowCenter; // TODO maybe expose voi lut lists?


      if (Array.isArray(windowWidth)) {
        windowWidth = windowWidth[0];
      }

      if (Array.isArray(windowCenter)) {
        windowCenter = windowCenter[0];
      }

      var _metaData$get3 = src_metaData.get('generalSeriesModule', imageId),
          modality = _metaData$get3.modality; // Compute the image size and spacing given the meta data we already have available.
      // const metaDataMap = new Map()
      // imageIds.forEach((imageId) => {
      //   metaDataMap.set(imageId, metaData.get('imagePlaneModule', imageId))
      // })


      return {
        imagePlaneModule: src_metaData.get('imagePlaneModule', imageId),
        // metaDataMap,
        imagePixelModule: {
          bitsAllocated: bitsAllocated,
          bitsStored: bitsStored,
          samplesPerPixel: samplesPerPixel,
          highBit: highBit,
          photometricInterpretation: photometricInterpretation,
          pixelRepresentation: pixelRepresentation,
          windowWidth: windowWidth,
          windowCenter: windowCenter,
          modality: modality
        }
      };
    }
  }, {
    key: "_getNumCompsFromPhotometricInterpretation",
    value: function _getNumCompsFromPhotometricInterpretation(photometricInterpretation) {
      // TODO: this function will need to have more logic later
      // see http://dicom.nema.org/medical/Dicom/current/output/chtml/part03/sect_C.7.6.3.html#sect_C.7.6.3.1.2
      var numberOfComponents = 1;

      if (photometricInterpretation === 'RGB') {
        numberOfComponents = 3;
      }

      return numberOfComponents;
    }
  }, {
    key: "_getImageDataMetadata",
    value: function _getImageDataMetadata(image) {
      // TODO: Creating a single image should probably not require a metadata provider.
      // We should define the minimum we need to display an image and it should live on
      // the Image object itself. Additional stuff (e.g. pixel spacing, direction, origin, etc)
      // should be optional and used if provided through a metadata provider.
      var _this$buildMetadata = this.buildMetadata(image.imageId),
          imagePlaneModule = _this$buildMetadata.imagePlaneModule,
          imagePixelModule = _this$buildMetadata.imagePixelModule;

      var rowCosines = imagePlaneModule.rowCosines,
          columnCosines = imagePlaneModule.columnCosines;
      var rowCosineVec = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.fromValues.apply(external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3, _toConsumableArray(rowCosines));
      var colCosineVec = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.fromValues.apply(external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3, _toConsumableArray(columnCosines));
      var scanAxisNormal = external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.create();
      external_root_window_commonjs_gl_matrix_commonjs2_gl_matrix_amd_gl_matrix_.vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);
      var origin = imagePlaneModule.imagePositionPatient;
      var xSpacing = imagePlaneModule.columnPixelSpacing || image.columnPixelSpacing;
      var ySpacing = imagePlaneModule.rowPixelSpacing || image.rowPixelSpacing;
      var xVoxels = image.columns;
      var yVoxels = image.rows; // We are using vtkVolumeMappers for rendering of stack (2D) images,
      // there seems to be a bug for having only one slice (zVoxel=1) and volume
      // rendering. Until further investigation we are using two slices, however,
      // we are only setting the scalar data for the first slice. The slice spacing
      // is set to be a small amount (0.1) to enable the correct canvasToWorld

      var zSpacing = 0.2;
      var zVoxels = 2;

      var numComps = image.numComps || this._getNumCompsFromPhotometricInterpretation(imagePixelModule.photometricInterpretation);

      return {
        bitsAllocated: imagePixelModule.bitsAllocated,
        numComps: numComps,
        origin: origin,
        direction: new Float32Array([].concat(_toConsumableArray(rowCosineVec), _toConsumableArray(colCosineVec), _toConsumableArray(scanAxisNormal))),
        dimensions: [xVoxels, yVoxels, zVoxels],
        spacing: [xSpacing, ySpacing, zSpacing],
        numVoxels: xVoxels * yVoxels * zVoxels
      };
    }
  }, {
    key: "_getCameraOrientation",
    value: function _getCameraOrientation(imageDataDirection) {
      var viewPlaneNormal = imageDataDirection.slice(6, 9).map(function (x) {
        return -x;
      });
      var viewUp = imageDataDirection.slice(3, 6).map(function (x) {
        return -x;
      });
      return {
        viewPlaneNormal: [viewPlaneNormal[0], viewPlaneNormal[1], viewPlaneNormal[2]],
        viewUp: [viewUp[0], viewUp[1], viewUp[2]]
      };
    }
  }, {
    key: "_createVTKImageData",
    value: function _createVTKImageData(image) {
      var _this$_getImageDataMe = this._getImageDataMetadata(image),
          origin = _this$_getImageDataMe.origin,
          direction = _this$_getImageDataMe.direction,
          dimensions = _this$_getImageDataMe.dimensions,
          spacing = _this$_getImageDataMe.spacing,
          bitsAllocated = _this$_getImageDataMe.bitsAllocated,
          numComps = _this$_getImageDataMe.numComps,
          numVoxels = _this$_getImageDataMe.numVoxels;

      var pixelArray;

      switch (bitsAllocated) {
        case 8:
          pixelArray = new Uint8Array(numVoxels);
          break;

        case 16:
          pixelArray = new Float32Array(numVoxels);
          break;

        case 24:
          pixelArray = new Uint8Array(numVoxels * 3);
          break;

        default:
          console.debug('bit allocation not implemented');
      }

      var scalarArray = DataArray_default().newInstance({
        name: 'Pixels',
        numberOfComponents: numComps,
        values: pixelArray
      });
      var imageData = ImageData_default().newInstance();
      imageData.setDimensions(dimensions);
      imageData.setSpacing(spacing);
      imageData.setDirection(direction);
      imageData.setOrigin(origin);
      imageData.getPointData().setScalars(scalarArray);
      return imageData;
    }
  }, {
    key: "setStack",
    value: function setStack(imageIds) {
      var currentImageIdIndex = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this.imageIds = imageIds;
      this.currentImageIdIndex = currentImageIdIndex;

      this._setImageIdIndex(currentImageIdIndex);
    }
  }, {
    key: "setStackActorVOI",
    value: function setStackActorVOI(range) {
      this.stackActorVOI = Object.assign({}, range);
    }
  }, {
    key: "_checkVTKImageDataMatchesCornerstoneImage",
    value: function _checkVTKImageDataMatchesCornerstoneImage(image, imageData) {
      if (!imageData) {
        return false;
      }

      var _imageData$getSpacing = imageData.getSpacing(),
          _imageData$getSpacing2 = _slicedToArray(_imageData$getSpacing, 3),
          xSpacing = _imageData$getSpacing2[0],
          ySpacing = _imageData$getSpacing2[1],
          zSpacing = _imageData$getSpacing2[2];

      var _imageData$getDimensi = imageData.getDimensions(),
          _imageData$getDimensi2 = _slicedToArray(_imageData$getDimensi, 3),
          xVoxels = _imageData$getDimensi2[0],
          yVoxels = _imageData$getDimensi2[1],
          zVoxels = _imageData$getDimensi2[2];

      var imagePlaneModule = src_metaData.get('imagePlaneModule', image.imageId);
      var direction = imageData.getDirection();
      var rowCosines = direction.slice(0, 3);
      var columnCosines = direction.slice(3, 6); // using spacing, size, and direction only for now

      if (xSpacing !== image.rowPixelSpacing || ySpacing !== image.columnPixelSpacing || xVoxels !== image.rows || yVoxels !== image.columns || !isEqual(imagePlaneModule.rowCosines, rowCosines) || !isEqual(imagePlaneModule.columnCosines, columnCosines)) {
        return false;
      }

      return true;
    } // Todo: rename since it may do more than set scalars

  }, {
    key: "_updateVTKImageDataFromCornerstoneImage",
    value: function _updateVTKImageDataFromCornerstoneImage(image) {
      var _this$_imageData, _this$_imageData2, _this$_imageData3;

      var _this$_getImageDataMe2 = this._getImageDataMetadata(image),
          origin = _this$_getImageDataMe2.origin,
          direction = _this$_getImageDataMe2.direction,
          dimensions = _this$_getImageDataMe2.dimensions,
          spacing = _this$_getImageDataMe2.spacing;

      (_this$_imageData = this._imageData).setDimensions.apply(_this$_imageData, _toConsumableArray(dimensions));

      (_this$_imageData2 = this._imageData).setSpacing.apply(_this$_imageData2, _toConsumableArray(spacing));

      this._imageData.setDirection(direction);

      (_this$_imageData3 = this._imageData).setOrigin.apply(_this$_imageData3, _toConsumableArray(origin)); // 3. Update the pixel data in the vtkImageData object with the pixelData
      //    from the loaded Cornerstone image


      var pixelData = image.getPixelData();

      var scalars = this._imageData.getPointData().getScalars();

      var scalarData = scalars.getData(); // Handle cases where Cornerstone is providing an RGBA array, but we need RGB
      // for VTK.
      // TODO: This conversion from Cornerstone to VTK may take many forms?
      //       We need to nail down the types for Cornerstone Images

      if (image.color) {
        // RGB case
        var j = 0;

        for (var i = 0; i < pixelData.length; i += 4) {
          scalarData[j] = pixelData[i];
          scalarData[j + 1] = pixelData[i + 1];
          scalarData[j + 2] = pixelData[i + 2];
          j += 3;
        }
      } else {
        // In the general case, just set the VTK Image Data TypedArray data
        // from the pixel data array provided from the Cornerstone Image
        // TODO: What about Rescale Slope and Intercept?
        // TODO: What about SUV computation?
        scalarData.set(pixelData);
      } // Set origin, direction, spacing, etc...
      // Trigger modified on the VTK Object so the texture is updated
      // TODO: evaluate directly changing things with texSubImage3D later


      this._imageData.modified();
    }
  }, {
    key: "_loadImage",
    value: function _loadImage(imageId, imageIdIndex) {
      // 1. Load the image using the Image Loader
      function successCallback(image, imageIdIndex, imageId) {
        var eventData = {
          image: image,
          imageId: imageId
        };
        triggerEvent(src_eventTarget, events.STACK_NEW_IMAGE, eventData);

        this._updateActorToDisplayImageId(image); // Todo: trigger an event to allow applications to hook into END of loading state
        // Currently we use loadHandlerManagers for this
        // Perform this check after the image has finished loading
        // in case the user has already scrolled away to another image.
        // In that case, do not render this image.


        if (this.currentImageIdIndex !== imageIdIndex) {
          return;
        } // Trigger the image to be drawn on the next animation frame


        this.render(); // Update the viewport's currentImageIdIndex to reflect the newly
        // rendered image

        this.currentImageIdIndex = imageIdIndex;
      }

      function errorCallback(error, imageIdIndex, imageId) {
        var eventData = {
          error: error,
          imageIdIndex: imageIdIndex,
          imageId: imageId
        };
        triggerEvent(src_eventTarget, errorCodes.IMAGE_LOAD_ERROR, eventData);
      }

      function sendRequest(imageId, imageIdIndex, options) {
        var _this2 = this;

        return loadAndCacheImage(imageId, options).then(function (image) {
          successCallback.call(_this2, image, imageIdIndex, imageId);
        }, function (error) {
          errorCallback.call(_this2, error, imageIdIndex, imageId);
        });
      }

      var priority = -5;
      var requestType = 'interaction';
      var additionalDetails = {
        imageId: imageId
      };
      var options = {};
      requestPool_requestPoolManager.addRequest(sendRequest.bind(this, imageId, imageIdIndex, options), requestType, additionalDetails, priority);
    }
  }, {
    key: "_updateActorToDisplayImageId",
    value: function _updateActorToDisplayImageId(image) {
      // This function should do the following:
      // - Get the existing actor's vtkImageData that is being used to render the current image and check if we can reuse the vtkImageData that is in place (i.e. do the image dimensions and data type match?)
      // - If we can reuse it, replace the scalar data under the hood
      // - If we cannot reuse it, create a new actor, remove the old one, and reset the camera
      // 2. Check if we can reuse the existing vtkImageData object, if one is present.
      var sameImageData = this._checkVTKImageDataMatchesCornerstoneImage(image, this._imageData);

      var activeCamera = this.getRenderer().getActiveCamera();

      if (sameImageData) {
        // 3a. If we can reuse it, replace the scalar data under the hood
        this._updateVTKImageDataFromCornerstoneImage(image); // Adjusting the camera based on slice axis. this is required if stack
        // contains various image orientations (axial ct, sagittal xray)


        var _direction = this._imageData.getDirection();

        var _this$_getCameraOrien = this._getCameraOrientation(_direction),
            _viewPlaneNormal = _this$_getCameraOrien.viewPlaneNormal,
            _viewUp = _this$_getCameraOrien.viewUp;

        this.setCamera({
          viewUp: _viewUp,
          viewPlaneNormal: _viewPlaneNormal
        }); // Since the 3D location of the imageData is changing as we scroll, we need
        // to modify the camera position to render this properly. However, resetting
        // causes problem related to zoom and pan tools: upon rendering of a new slice
        // the pan and zoom will get reset. To solve this, 1) we store the camera
        // properties related to pan and zoom 2) reset the camera to correctly place
        // it in the space 3) restore the pan, zoom props.

        var cameraProps = this.getCamera(); // Reset the camera to point to the new slice location, reset camera doesn't
        // modify the direction of projection and viewUp

        this.resetCamera(); // This is necessary to initialize the clipping range and it is not related
        // to our custom slabThickness.

        activeCamera.setThicknessFromFocalPoint(0.1);
        activeCamera.setFreezeFocalPoint(true); // We shouldn't restore the focalPoint, position and parallelScale after reset
        // if it is the first render or we have completely re-created the vtkImageData

        this._restoreCameraProps(cameraProps);

        return;
      } // 3b. If we cannot reuse the vtkImageData object (either the first render
      // or the size has changed), create a new one


      this._imageData = this._createVTKImageData(image); // Set the scalar data of the vtkImageData object from the Cornerstone
      // Image's pixel data

      this._updateVTKImageDataFromCornerstoneImage(image); // Create a VTK Volume actor to display the vtkImageData object


      var stackActor = this.createActorMapper(this._imageData);
      this.setActors([{
        uid: this.uid,
        volumeActor: stackActor
      }]); // Adjusting the camera based on slice axis. this is required if stack
      // contains various image orientations (axial ct, sagittal xray)

      var direction = this._imageData.getDirection();

      var _this$_getCameraOrien2 = this._getCameraOrientation(direction),
          viewPlaneNormal = _this$_getCameraOrien2.viewPlaneNormal,
          viewUp = _this$_getCameraOrien2.viewUp;

      this.setCamera({
        viewUp: viewUp,
        viewPlaneNormal: viewPlaneNormal
      }); // Reset the camera to point to the new slice location, reset camera doesn't
      // modify the direction of projection and viewUp

      this.resetCamera(); // This is necessary to initialize the clipping range and it is not related
      // to our custom slabThickness.

      activeCamera.setThicknessFromFocalPoint(0.1);
      activeCamera.setFreezeFocalPoint(true);
    }
  }, {
    key: "_setImageIdIndex",
    value: function _setImageIdIndex(imageIdIndex) {
      if (imageIdIndex >= this.imageIds.length) {
        throw new Error("ImageIdIndex provided ".concat(imageIdIndex, " is invalid, the stack only has ").concat(this.imageIds.length, " elements"));
      } // Update the state of the viewport to the new imageIdIndex;


      this.currentImageIdIndex = imageIdIndex; // Get the imageId from the stack

      var imageId = this.imageIds[imageIdIndex]; // Todo: trigger an event to allow applications to hook into START of loading state
      // Currently we use loadHandlerManagers for this

      this._loadImage(imageId, imageIdIndex);
    }
  }, {
    key: "setImageIdIndex",
    value: function setImageIdIndex(imageIdIndex) {
      // If we are already on this imageId index, stop here
      if (this.currentImageIdIndex === imageIdIndex) {
        return;
      } // Otherwise, get the imageId and attempt to display it


      this._setImageIdIndex(imageIdIndex);
    }
  }, {
    key: "_restoreCameraProps",
    value: function _restoreCameraProps(_ref) {
      var prevFocal = _ref.focalPoint,
          prevPos = _ref.position,
          prevScale = _ref.parallelScale;
      var renderer = this.getRenderer(); // get the focalPoint and position after the reset

      var _this$getCamera = this.getCamera(),
          position = _this$getCamera.position,
          focalPoint = _this$getCamera.focalPoint; // Restoring previous state x,y and scale, keeping the new z


      this.setCamera({
        parallelScale: prevScale,
        position: [prevPos[0], prevPos[1], position[2]],
        focalPoint: [prevFocal[0], prevFocal[1], focalPoint[2]]
      }); // Invoking render

      var RESET_CAMERA_EVENT = {
        type: 'ResetCameraEvent',
        renderer: renderer
      };
      renderer.invokeEvent(RESET_CAMERA_EVENT);
    }
    /**
     * canvasToWorld Returns the world coordinates of the given `canvasPos`
     * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
     * and the direction of projection.
     *
     * @param canvasPos The position in canvas coordinates.
     * @returns The corresponding world coordinates.
     * @public
     */

  }]);

  return StackViewport;
}(RenderingEngine_Viewport);

/* harmony default export */ var RenderingEngine_StackViewport = (StackViewport);
;// CONCATENATED MODULE: ../../node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }

  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}

function _asyncToGenerator(fn) {
  return function () {
    var self = this,
        args = arguments;
    return new Promise(function (resolve, reject) {
      var gen = fn.apply(self, args);

      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }

      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }

      _next(undefined);
    });
  };
}
// EXTERNAL MODULE: ../../node_modules/@babel/runtime/regenerator/index.js
var regenerator = __webpack_require__(7162);
var regenerator_default = /*#__PURE__*/__webpack_require__.n(regenerator);
;// CONCATENATED MODULE: ./src/volumeLoader.ts







function createInternalVTKRepresentation(_ref) {
  var dimensions = _ref.dimensions,
      metadata = _ref.metadata,
      spacing = _ref.spacing,
      direction = _ref.direction,
      origin = _ref.origin,
      scalarData = _ref.scalarData;
  var PhotometricInterpretation = metadata.PhotometricInterpretation;
  var numComponents = 1;

  if (PhotometricInterpretation === 'RGB') {
    numComponents = 3;
  }

  var scalarArray = DataArray_default().newInstance({
    name: 'Pixels',
    numberOfComponents: numComponents,
    values: scalarData
  });
  var imageData = ImageData_default().newInstance();
  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);
  return imageData;
}
/**
 * This module deals with VolumeLoaders and loading volumes
 * @module VolumeLoader
 */


var volumeLoaders = {};
var unknownVolumeLoader;
/**
 * Load a volume using a registered Cornerstone Volume Loader.
 *
 * The volume loader that is used will be
 * determined by the volume loader scheme matching against the volumeId.
 *
 * @param {String} volumeId A Cornerstone Volume Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader. Options
 * contain the ImageIds that is passed to the loader
 *
 * @returns {Types.VolumeLoadObject} An Object which can be used to act after a volume is loaded or loading fails
 *
 */

function loadVolumeFromVolumeLoader(volumeId, options) {
  var colonIndex = volumeId.indexOf(':');
  var scheme = volumeId.substring(0, colonIndex);
  var loader = volumeLoaders[scheme];

  if (loader === undefined || loader === null) {
    if (unknownVolumeLoader !== undefined) {
      return unknownVolumeLoader(volumeId, options);
    }

    throw new Error('loadVolumeFromVolumeLoader: no volume loader for volumeId');
  }

  var volumeLoadObject = loader(volumeId, options); // Broadcast a volume loaded event once the image is loaded

  volumeLoadObject.promise.then(function (volume) {
    triggerEvent(src_eventTarget, events.IMAGE_LOADED, {
      volume: volume
    });
  }, function (error) {
    var errorObject = {
      volumeId: volumeId,
      error: error
    };
    triggerEvent(src_eventTarget, events.IMAGE_LOAD_FAILED, errorObject);
  });
  return volumeLoadObject;
}
/**
 * Loads a volume given a volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred.  The loaded image is not stored in the cache.
 *
 * @param {String} volumeId A Cornerstone Image Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {Types.VolumeLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @category VolumeLoader
 */


function loadVolume(volumeId) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
    imageIds: []
  };

  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined');
  }

  var volumeLoadObject = src_cache_cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options);
  return volumeLoadObject.promise.then(function (volume) {
    volume.vtkImageData = createInternalVTKRepresentation(volume);
    return volume;
  });
}
/**
 * Loads an image given an volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred. The image is stored in the cache.
 *
 * @param {String} volumeId A Cornerstone Image Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {Types.VolumeLoadObject} Volume Loader Object
 * @category VolumeLoader
 */

function createAndCacheVolume(volumeId, options) {
  if (volumeId === undefined) {
    throw new Error('createAndCacheVolume: parameter volumeId must not be undefined');
  }

  var volumeLoadObject = src_cache_cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options);
  volumeLoadObject.promise.then(function (volume) {
    volume.vtkImageData = createInternalVTKRepresentation(volume);
  });
  src_cache_cache.putVolumeLoadObject(volumeId, volumeLoadObject).catch(function (err) {
    throw err;
  });
  return volumeLoadObject.promise;
}
/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this volume loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} volumeLoader A Cornerstone Volume Loader function
 * @returns {void}
 * @category VolumeLoader
 */

function registerVolumeLoader(scheme, volumeLoader) {
  volumeLoaders[scheme] = volumeLoader;
}
/**
 * Registers a new unknownVolumeLoader and returns the previous one
 *
 * @param {Function} volumeLoader A Cornerstone Volume Loader
 *
 * @returns {Function|Undefined} The previous Unknown Volume Loader
 * @category VolumeLoader
 */

function registerUnknownVolumeLoader(volumeLoader) {
  var oldVolumeLoader = unknownVolumeLoader;
  unknownVolumeLoader = volumeLoader;
  return oldVolumeLoader;
}
;// CONCATENATED MODULE: ./src/RenderingEngine/helpers/createVolumeMapper.ts

function createVolumeMapper(vtkImageData, vtkOpenGLTexture) {
  var volumeMapper = vtkClasses_vtkSharedVolumeMapper.newInstance();
  volumeMapper.setInputData(vtkImageData);
  var spacing = vtkImageData.getSpacing(); // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
  // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344

  var sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6; // This is to allow for good pixel level image quality.

  volumeMapper.setMaximumSamplesPerRay(4000);
  volumeMapper.setSampleDistance(sampleDistance);
  volumeMapper.setScalarTexture(vtkOpenGLTexture);
  return volumeMapper;
}
;// CONCATENATED MODULE: ./src/RenderingEngine/helpers/createVolumeActor.ts



 //@ts-ignore



function createVolumeActor(_x) {
  return _createVolumeActor.apply(this, arguments);
}

function _createVolumeActor() {
  _createVolumeActor = _asyncToGenerator( /*#__PURE__*/regenerator_default().mark(function _callee(props) {
    var volumeUID, callback, blendMode, imageVolume, vtkImageData, vtkOpenGLTexture, volumeMapper, volumeActor;
    return regenerator_default().wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            volumeUID = props.volumeUID, callback = props.callback, blendMode = props.blendMode;
            _context.next = 3;
            return loadVolume(volumeUID);

          case 3:
            imageVolume = _context.sent;

            if (imageVolume) {
              _context.next = 6;
              break;
            }

            throw new Error("imageVolume with uid: ".concat(imageVolume.uid, " does not exist"));

          case 6:
            vtkImageData = imageVolume.vtkImageData, vtkOpenGLTexture = imageVolume.vtkOpenGLTexture;
            volumeMapper = createVolumeMapper(vtkImageData, vtkOpenGLTexture);

            if (blendMode) {
              volumeMapper.setBlendMode(blendMode);
            }

            volumeActor = Core_Volume_default().newInstance();
            volumeActor.setMapper(volumeMapper);

            if (callback) {
              callback({
                volumeActor: volumeActor,
                volumeUID: volumeUID
              });
            }

            return _context.abrupt("return", volumeActor);

          case 13:
          case "end":
            return _context.stop();
        }
      }
    }, _callee);
  }));
  return _createVolumeActor.apply(this, arguments);
}

/* harmony default export */ var helpers_createVolumeActor = (createVolumeActor);
;// CONCATENATED MODULE: ./src/RenderingEngine/helpers/index.js


;// CONCATENATED MODULE: ./src/RenderingEngine/Scene.ts










/**
 * @class Scene - Describes a scene which defined a world space containing actors.
 * A scene may have different viewports which may be different views of this same data.
 */
var Scene = /*#__PURE__*/function () {
  function Scene(uid, renderingEngineUID) {
    _classCallCheck(this, Scene);

    _defineProperty(this, "uid", void 0);

    _defineProperty(this, "renderingEngineUID", void 0);

    _defineProperty(this, "_sceneViewports", void 0);

    _defineProperty(this, "_FrameOfReferenceUID", void 0);

    _defineProperty(this, "_internalScene", void 0);

    this.renderingEngineUID = renderingEngineUID;
    this._sceneViewports = [];
    this._internalScene = !uid;
    this.uid = uid ? uid : uuidv4();
  }

  _createClass(Scene, [{
    key: "getFrameOfReferenceUID",
    value: function getFrameOfReferenceUID() {
      return this._FrameOfReferenceUID;
    }
  }, {
    key: "getIsInternalScene",
    value: function getIsInternalScene() {
      return this._internalScene;
    }
    /**
     * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
     *
     * @returns {RenderingEngine} The RenderingEngine instance.
     */

  }, {
    key: "getRenderingEngine",
    value: function getRenderingEngine() {
      return RenderingEngine_renderingEngineCache.get(this.renderingEngineUID);
    }
    /**
     * @method getViewports Returns the viewports on the scene.
     *
     * @returns {Array<VolumeViewport>} The viewports.
     */

  }, {
    key: "getViewports",
    value: function getViewports() {
      var renderingEngine = this.getRenderingEngine();
      return this._sceneViewports.map(function (uid) {
        return renderingEngine.getViewport(uid);
      });
    }
    /**
     * @method getViewport - Returns a `Viewport` from the `Scene` by its `uid`.
     * @param {string } viewportUID The UID of the viewport to get.
     */

  }, {
    key: "getViewport",
    value: function getViewport(viewportUID) {
      var renderingEngine = this.getRenderingEngine();

      var index = this._sceneViewports.indexOf(viewportUID);

      if (index > -1) {
        return renderingEngine.getViewport(viewportUID);
      }

      throw new Error("Requested ".concat(viewportUID, " does not belong to ").concat(this.uid, " scene"));
    }
    /**
     * @method setVolumes Creates volume actors for all volumes defined in the `volumeInputArray`.
     * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
     * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
     * `VolumeMapper`.
     *
     * @param {Array<VolumeInput>} volumeInputArray The array of `VolumeInput`s which define the volumes to add.
     * @param {boolean} [immediate=false] Whether the `Scene` should be rendered as soon as volumes are added.
     */

  }, {
    key: "setVolumes",
    value: function () {
      var _setVolumes = _asyncToGenerator( /*#__PURE__*/regenerator_default().mark(function _callee(volumeInputArray) {
        var _this = this;

        var immediate,
            firstImageVolume,
            FrameOfReferenceUID,
            numVolumes,
            i,
            volumeInput,
            imageVolume,
            slabThicknessValues,
            volumeActors,
            _i,
            _volumeInputArray$_i,
            volumeUID,
            slabThickness,
            volumeActor,
            _args = arguments;

        return regenerator_default().wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                immediate = _args.length > 1 && _args[1] !== undefined ? _args[1] : false;
                _context.next = 3;
                return loadVolume(volumeInputArray[0].volumeUID);

              case 3:
                firstImageVolume = _context.sent;

                if (firstImageVolume) {
                  _context.next = 6;
                  break;
                }

                throw new Error("imageVolume with uid: ".concat(firstImageVolume.uid, " does not exist"));

              case 6:
                FrameOfReferenceUID = firstImageVolume.metadata.FrameOfReferenceUID;
                numVolumes = volumeInputArray.length; // Check all other volumes exist and have the same FrameOfReference

                i = 1;

              case 9:
                if (!(i < numVolumes)) {
                  _context.next = 21;
                  break;
                }

                volumeInput = volumeInputArray[i];
                _context.next = 13;
                return loadVolume(volumeInput.volumeUID);

              case 13:
                imageVolume = _context.sent;

                if (imageVolume) {
                  _context.next = 16;
                  break;
                }

                throw new Error("imageVolume with uid: ".concat(imageVolume.uid, " does not exist"));

              case 16:
                if (!(FrameOfReferenceUID !== imageVolume.metadata.FrameOfReferenceUID)) {
                  _context.next = 18;
                  break;
                }

                throw new Error("Volumes being added to scene ".concat(this.uid, " do not share the same FrameOfReferenceUID. This is not yet supported"));

              case 18:
                i++;
                _context.next = 9;
                break;

              case 21:
                this._FrameOfReferenceUID = FrameOfReferenceUID;
                slabThicknessValues = [];
                volumeActors = []; // One actor per volume

                _i = 0;

              case 25:
                if (!(_i < volumeInputArray.length)) {
                  _context.next = 35;
                  break;
                }

                _volumeInputArray$_i = volumeInputArray[_i], volumeUID = _volumeInputArray$_i.volumeUID, slabThickness = _volumeInputArray$_i.slabThickness;
                _context.next = 29;
                return helpers_createVolumeActor(volumeInputArray[_i]);

              case 29:
                volumeActor = _context.sent;
                volumeActors.push({
                  uid: volumeUID,
                  volumeActor: volumeActor,
                  slabThickness: slabThickness
                });

                if (slabThickness !== undefined && !slabThicknessValues.includes(slabThickness)) {
                  slabThicknessValues.push(slabThickness);
                }

              case 32:
                _i++;
                _context.next = 25;
                break;

              case 35:
                if (slabThicknessValues.length > 1) {
                  console.warn('Currently slab thickness for intensity projections is tied to the camera, not per volume, using the largest of the two volumes for this scene.');
                }

                this._sceneViewports.forEach(function (uid) {
                  var viewport = _this.getViewport(uid);

                  viewport._setVolumeActors(volumeActors);
                });

                if (immediate) {
                  this.render();
                }

              case 38:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function setVolumes(_x) {
        return _setVolumes.apply(this, arguments);
      }

      return setVolumes;
    }()
    /**
     * @method render Renders all `Viewport`s in the `Scene` using the `Scene`'s `RenderingEngine`.
     */

  }, {
    key: "render",
    value: function render() {
      var renderingEngine = this.getRenderingEngine();
      renderingEngine.renderScene(this.uid);
    }
  }, {
    key: "addViewportByUID",
    value: function addViewportByUID(viewportUID) {
      if (this._sceneViewports.indexOf(viewportUID) < 0) {
        this._sceneViewports.push(viewportUID);
      }
    }
  }, {
    key: "removeViewportByUID",
    value: function removeViewportByUID(viewportUID) {
      var index = this._sceneViewports.indexOf(viewportUID);

      if (index > -1) {
        this._sceneViewports.splice(index, 1);
      }
    }
  }, {
    key: "getViewportUIDs",
    value: function getViewportUIDs() {
      return this._sceneViewports;
    }
  }, {
    key: "addVolumeActors",
    value: function addVolumeActors(viewportUID) {
      var volumeActor = this.getVolumeActors();
      var viewport = this.getViewport(viewportUID);

      viewport._setVolumeActors(volumeActor);
    }
    /**
     * @method getVolumeActor Gets a volume actor on the scene by its `uid`.
     *
     * @param {string } uid The UID of the volumeActor to fetch.
     * @returns {object} The volume actor.
     */

  }, {
    key: "getVolumeActor",
    value: function getVolumeActor(uid) {
      var viewports = this.getViewports();
      var volumeActorEntry = viewports[0].getActor(uid);

      if (volumeActorEntry) {
        return volumeActorEntry.volumeActor;
      }
    }
    /**
     * @method getVolumeActors Gets the array of `VolumeActorEntry`s.
     *
     * @returns {Array<ActorEntry>} The array of volume actors.
     */

  }, {
    key: "getVolumeActors",
    value: function getVolumeActors() {
      var viewports = this.getViewports();
      return viewports[0].getActors();
    }
  }]);

  return Scene;
}();

/* harmony default export */ var RenderingEngine_Scene = (Scene);
// EXTERNAL MODULE: ../../node_modules/lodash.isequal/index.js
var lodash_isequal = __webpack_require__(3958);
var lodash_isequal_default = /*#__PURE__*/__webpack_require__.n(lodash_isequal);
;// CONCATENATED MODULE: ./src/RenderingEngine/RenderingEngine.ts















/**
 * A RenderingEngine takes care of the full pipeline of creating viewports and rendering
 * them on a large offscreen canvas and transmitting this data back to the screen. This allows us
 * to leverage the power of vtk.js whilst only using one WebGL context for the processing, and allowing
 * us to share texture memory across on-screen viewports that show the same data.
 *
 * @example
 * Instantiating a rendering engine:
 * ```
 * const renderingEngine = new RenderingEngine('pet-ct-rendering-engine');
 * ```
 *
 * @public
 */
var RenderingEngine = /*#__PURE__*/function () {
  /**
   * A hook into VTK's `vtkOffscreenMultiRenderWindow`
   * @member {any}
   */
  // WebGL

  /**
   *
   * @param uid - Unique identifier for RenderingEngine
   */
  function RenderingEngine(uid) {
    var _this = this;

    _classCallCheck(this, RenderingEngine);

    _defineProperty(this, "uid", void 0);

    _defineProperty(this, "hasBeenDestroyed", void 0);

    _defineProperty(this, "offscreenMultiRenderWindow", void 0);

    _defineProperty(this, "offScreenCanvasContainer", void 0);

    _defineProperty(this, "_scenes", void 0);

    _defineProperty(this, "_viewports", void 0);

    _defineProperty(this, "_needsRender", new Set());

    _defineProperty(this, "_animationFrameSet", false);

    _defineProperty(this, "_animationFrameHandle", null);

    _defineProperty(this, "_renderFlaggedViewports", function () {
      _this._throwIfDestroyed();

      var offscreenMultiRenderWindow = _this.offscreenMultiRenderWindow;
      var renderWindow = offscreenMultiRenderWindow.getRenderWindow();
      var renderers = offscreenMultiRenderWindow.getRenderers();

      for (var i = 0; i < renderers.length; i++) {
        renderers[i].renderer.setDraw(true);
      }

      renderWindow.render();
      var openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
      var context = openGLRenderWindow.get3DContext();
      var offScreenCanvas = context.canvas;

      var viewports = _this._getViewportsAsArray();

      for (var _i = 0; _i < viewports.length; _i++) {
        var viewport = viewports[_i];

        if (_this._needsRender.has(viewport.uid)) {
          _this._renderViewportToCanvas(viewport, offScreenCanvas); // This viewport has been rendered, we can remove it from the set


          _this._needsRender.delete(viewport.uid); // If there is nothing left that is flagged for rendering, stop here
          // and allow RAF to be called again


          if (_this._needsRender.size === 0) {
            _this._animationFrameSet = false;
            _this._animationFrameHandle = null;
            return;
          }
        }
      }
    });

    _defineProperty(this, "renderFrameOfReference", function (FrameOfReferenceUID) {
      var viewports = _this._getViewportsAsArray();

      var viewportUidsWithSameFrameOfReferenceUID = viewports.map(function (vp) {
        if (vp.getFrameOfReferenceUID() === FrameOfReferenceUID) {
          return vp.uid;
        }
      });
      return _this.renderViewports(viewportUidsWithSameFrameOfReferenceUID);
    });

    this.uid = uid ? uid : uuidv4();
    RenderingEngine_renderingEngineCache.set(this);
    this.offscreenMultiRenderWindow = vtkClasses_vtkOffscreenMultiRenderWindow.newInstance();
    this.offScreenCanvasContainer = document.createElement('div');
    this.offscreenMultiRenderWindow.setContainer(this.offScreenCanvasContainer);
    this._scenes = new Map();
    this._viewports = new Map();
    this.hasBeenDestroyed = false;
  }
  /**
   * Enables the requested viewport and add it to the viewports. It will
   * properly create the Stack viewport or Volume viewport:
   *
   * 1) Checks if the viewport is defined already, if yes, remove it first
   * 2) Calculates a new offScreen canvas with the new requested viewport
   * 3) Adds the viewport
   * 4) If a sceneUID is provided for the viewportInputEntry it will create
   * a Scene for the viewport and add it to the list of scene viewports.
   * 5) If there is an already created scene, it will add the volumeActors
   * to the requested viewport. OffScreen canvas is resized properly based
   *  on the size of the new viewport.
   *
   *
   * @param {Object} viewportInputEntry viewport specifications
   *
   * @returns {void}
   * @memberof RenderingEngine
   */


  _createClass(RenderingEngine, [{
    key: "enableElement",
    value: function enableElement(viewportInputEntry) {
      this._throwIfDestroyed();

      var canvas = viewportInputEntry.canvas,
          viewportUID = viewportInputEntry.viewportUID,
          sceneUID = viewportInputEntry.sceneUID; // Throw error if no canvas

      if (!canvas) {
        throw new Error('No canvases provided');
      } // 1. Get the viewport from the list of available viewports.


      var viewport = this.getViewport(viewportUID); // 1.a) If there is a found viewport, and the scene Id has changed, we
      // remove the viewport and create a new viewport

      if (viewport) {
        this.disableElement(viewportUID); // todo: if only removing the viewport, make sure resize also happens
        // this._removeViewport(viewportUID)
      } // 2. Retrieving the list of viewports for calculation of the new size for
      // offScreen canvas.


      var viewports = this._getViewportsAsArray();

      var canvases = viewports.map(function (vp) {
        return vp.canvas;
      });
      canvases.push(viewportInputEntry.canvas); // 2.a Calculating the new size for offScreen Canvas

      var _this$_resizeOffScree = this._resizeOffScreenCanvas(canvases),
          offScreenCanvasWidth = _this$_resizeOffScree.offScreenCanvasWidth,
          offScreenCanvasHeight = _this$_resizeOffScree.offScreenCanvasHeight; // 2.b Re-position previous viewports on the offScreen Canvas based on the new
      // offScreen canvas size


      var _xOffset = this._resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight); // 3 Add the requested viewport to rendering Engine


      this._addViewport(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset); // 4. Check if the viewport is part of a scene, if yes, add the available
      // volume Actors to the viewport too


      viewport = this.getViewport(viewportUID); // 4.a Only volumeViewports have scenes

      if (viewport instanceof RenderingEngine_VolumeViewport) {
        var scene = viewport.getScene();
        var volActors = scene.getVolumeActors();
        var viewportActors = viewport.getActors(); // add the volume actor if not the same as the viewport actor

        if (!lodash_isequal_default()(volActors, viewportActors)) {
          scene.addVolumeActors(viewportUID);
        }
      } // 5. Add the new viewport to the queue to be rendered


      this._setViewportsToBeRenderedNextFrame([viewportInputEntry.viewportUID]);
    }
    /**
     * Disables the requested viewportUID from the rendering engine:
     * 1) It removes the viewport from the the list of viewports
     * 2) remove the renderer from the offScreen render window
     * 3) resetting the viewport to remove the canvas attributes and canvas data
     * 4) resize the offScreen appropriately
     *
     * @param {string} viewportUID viewport UID
     *
     * @returns {void}
     * @memberof RenderingEngine
     */

  }, {
    key: "disableElement",
    value: function disableElement(viewportUID) {
      this._throwIfDestroyed(); // 1. Getting the viewport to remove it


      var viewport = this.getViewport(viewportUID); // 1.a To throw if there is no viewport stored in rendering engine

      if (!viewport) {
        console.warn("viewport ".concat(viewportUID, " does not exist"));
        return;
      } // 1.b Remove the requested viewport from the rendering engine


      this._removeViewport(viewportUID); // 2. Remove the related renderer from the offScreenMultiRenderWindow


      this.offscreenMultiRenderWindow.removeRenderer(viewportUID); // 3. Reset the viewport to remove attributes, and reset the canvas

      this._resetViewport(viewport); // 4. Resize the offScreen canvas to accommodate for the new size (after removal)


      this.resize();
    }
    /**
     * Disables the requested viewportUID from the rendering engine:
     * 1) It removes the viewport from the the list of viewports
     * 2) remove the renderer from the offScreen render window
     * 3) resetting the viewport to remove the canvas attributes and canvas data
     * 4) resize the offScreen appropriately
     *
     * @param {string} viewportUID viewport UID
     *
     * @returns {void}
     * @memberof RenderingEngine
     */

  }, {
    key: "_removeViewport",
    value: function _removeViewport(viewportUID) {
      // 1. Get the viewport
      var viewport = this.getViewport(viewportUID);

      if (!viewport) {
        console.warn("viewport ".concat(viewportUID, " does not exist"));
        return;
      } // 2. Delete the viewports from the the viewports


      this._viewports.delete(viewportUID); // 3. Remove viewport from scene if scene exists


      if (viewport instanceof RenderingEngine_VolumeViewport) {
        var scene = viewport.getScene();

        if (scene) {
          // 3.a Remove the viewport UID from the scene
          scene.removeViewportByUID(viewportUID); // 3.b If scene doesn't have any more viewports after this removal delete it

          if (!scene.getViewportUIDs().length) {
            this.removeScene(scene.uid);
          }
        }
      }
    }
    /**
     * Add viewport at the correct position on the offScreenCanvas
     *
     * @param {Object} viewportInputEntry viewport definition to construct the viewport
     * @param {number} offScreenCanvasWidth offScreen width
     * @param {number} offScreenCanvasHeight offScreen height
     * @param {number} _xOffset offset from left of offScreen canvas to place the viewport
     *
     * @returns {void}
     * @memberof RenderingEngine
     */

  }, {
    key: "_addViewport",
    value: function _addViewport(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset) {
      var canvas = viewportInputEntry.canvas,
          sceneUID = viewportInputEntry.sceneUID,
          viewportUID = viewportInputEntry.viewportUID,
          type = viewportInputEntry.type,
          defaultOptions = viewportInputEntry.defaultOptions; // 1. Calculate the size of location of the viewport on the offScreen canvas

      var _this$_getViewportCoo = this._getViewportCoordsOnOffScreenCanvas(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset),
          sxStartDisplayCoords = _this$_getViewportCoo.sxStartDisplayCoords,
          syStartDisplayCoords = _this$_getViewportCoo.syStartDisplayCoords,
          sxEndDisplayCoords = _this$_getViewportCoo.sxEndDisplayCoords,
          syEndDisplayCoords = _this$_getViewportCoo.syEndDisplayCoords,
          sx = _this$_getViewportCoo.sx,
          sy = _this$_getViewportCoo.sy,
          sWidth = _this$_getViewportCoo.sWidth,
          sHeight = _this$_getViewportCoo.sHeight; // 2. Add a renderer to the offScreenMultiRenderWindow


      this.offscreenMultiRenderWindow.addRenderer({
        viewport: [sxStartDisplayCoords, syStartDisplayCoords, sxEndDisplayCoords, syEndDisplayCoords],
        uid: viewportUID,
        background: defaultOptions.background ? defaultOptions.background : [0, 0, 0]
      }); // 3. ViewportInput to be passed to a stack/volume viewport

      var viewportInput = {
        uid: viewportUID,
        renderingEngineUID: this.uid,
        type: type,
        canvas: canvas,
        sx: sx,
        sy: sy,
        sWidth: sWidth,
        sHeight: sHeight,
        defaultOptions: defaultOptions || {}
      }; // 4. Create a proper viewport based on the type of the viewport

      var viewport;

      if (type === viewportType.STACK) {
        // 4.a Create stack viewport
        viewport = new RenderingEngine_StackViewport(viewportInput);
      } else if (type === viewportType.ORTHOGRAPHIC) {
        // 4.a Create volume viewport
        // 4.b Check if the provided scene already exists
        var scene = this.getScene(sceneUID); // 4.b Create a scene if does not exists and add to scenes
        // Note: A scene will ALWAYS be created for a volume viewport.
        // If a sceneUID is provided, it will get used for creating a scene.
        // if the sceneUID is not provided, we create an internal scene by
        // generating a random UID. However, the getScene API will not return
        // internal scenes.

        if (!scene) {
          scene = new RenderingEngine_Scene(sceneUID, this.uid);

          this._scenes.set(sceneUID, scene);
        } // 4.b Create a scene if does not exists and add to scenes


        viewportInput.sceneUID = scene.uid; // 4.b Create a volume viewport and adds it to the scene

        viewport = new RenderingEngine_VolumeViewport(viewportInput);
        scene.addViewportByUID(viewportUID);
      } else {
        throw new Error("Viewport Type ".concat(type, " is not supported"));
      } // 5. Storing the viewports


      this._viewports.set(viewportUID, viewport);

      var eventData = {
        canvas: canvas,
        viewportUID: viewportUID,
        sceneUID: sceneUID,
        renderingEngineUID: this.uid
      };
      triggerEvent(src_eventTarget, events.ELEMENT_ENABLED, eventData);
    }
    /**
     * Creates `Scene`s containing `Viewport`s and sets up the offscreen render
     * window to allow offscreen rendering and transmission back to the target
     * canvas in each viewport.
     *
     * @param viewportInputEntries An array of viewport definitions to construct the rendering engine
     * /todo: if don't want scene don't' give uid
     */

  }, {
    key: "setViewports",
    value: function setViewports(viewportInputEntries) {
      this._throwIfDestroyed();

      this._reset(); // 1. Getting all the canvases from viewports calculation of the new offScreen size


      var canvases = viewportInputEntries.map(function (vp) {
        return vp.canvas;
      }); // 2. Set canvas size based on height and sum of widths

      var _this$_resizeOffScree2 = this._resizeOffScreenCanvas(canvases),
          offScreenCanvasWidth = _this$_resizeOffScree2.offScreenCanvasWidth,
          offScreenCanvasHeight = _this$_resizeOffScree2.offScreenCanvasHeight;
      /*
      TODO: Commenting this out until we can mock the Canvas usage in the tests (or use jsdom?)
      if (!offScreenCanvasWidth || !offScreenCanvasHeight) {
        throw new Error('Invalid offscreen canvas width or height')
      }*/
      // 3. Adding the viewports based on the viewportInputEntry definition to the
      // rendering engine.


      var _xOffset = 0;

      for (var i = 0; i < viewportInputEntries.length; i++) {
        var viewportInputEntry = viewportInputEntries[i];
        var canvas = viewportInputEntry.canvas;

        this._addViewport(viewportInputEntry, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset); // Incrementing the xOffset which provides the horizontal location of each
        // viewport on the offScreen canvas


        _xOffset += canvas.clientWidth;
      }
    }
    /**
     * Resizes the offscreen canvas based on the provided canvases
     *
     * @param canvases An array of HTML Canvas
     */

  }, {
    key: "_resizeOffScreenCanvas",
    value: function _resizeOffScreenCanvas(canvases) {
      var offScreenCanvasContainer = this.offScreenCanvasContainer,
          offscreenMultiRenderWindow = this.offscreenMultiRenderWindow; // 1. Calculated the height of the offScreen canvas to be the maximum height
      // between canvases

      var offScreenCanvasHeight = Math.max.apply(Math, _toConsumableArray(canvases.map(function (canvas) {
        return canvas.clientHeight;
      }))); // 2. Calculating the width of the offScreen canvas to be the sum of all

      var offScreenCanvasWidth = 0;
      canvases.forEach(function (canvas) {
        offScreenCanvasWidth += canvas.clientWidth;
      });
      offScreenCanvasContainer.width = offScreenCanvasWidth;
      offScreenCanvasContainer.height = offScreenCanvasHeight; // 3. Resize command

      offscreenMultiRenderWindow.resize();
      return {
        offScreenCanvasWidth: offScreenCanvasWidth,
        offScreenCanvasHeight: offScreenCanvasHeight
      };
    }
    /**
     * Recalculates and updates the viewports location on the offScreen canvas upon its resize
     *
     * @param viewports An array of viewports
     * @param offScreenCanvasWidth new offScreen canvas width
     * @param offScreenCanvasHeight new offScreen canvas height
     *
     * @returns {number} _xOffset the final offset which will be used for the next viewport
     */

  }, {
    key: "_resize",
    value: function _resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight) {
      // Redefine viewport properties
      var _xOffset = 0;

      for (var i = 0; i < viewports.length; i++) {
        var viewport = viewports[i];

        var _this$_getViewportCoo2 = this._getViewportCoordsOnOffScreenCanvas(viewport, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset),
            sxStartDisplayCoords = _this$_getViewportCoo2.sxStartDisplayCoords,
            syStartDisplayCoords = _this$_getViewportCoo2.syStartDisplayCoords,
            sxEndDisplayCoords = _this$_getViewportCoo2.sxEndDisplayCoords,
            syEndDisplayCoords = _this$_getViewportCoo2.syEndDisplayCoords,
            sx = _this$_getViewportCoo2.sx,
            sy = _this$_getViewportCoo2.sy,
            sWidth = _this$_getViewportCoo2.sWidth,
            sHeight = _this$_getViewportCoo2.sHeight;

        _xOffset += viewport.canvas.clientWidth;
        viewport.sx = sx;
        viewport.sy = sy;
        viewport.sWidth = sWidth;
        viewport.sHeight = sHeight; // Updating the renderer for the viewport

        var renderer = this.offscreenMultiRenderWindow.getRenderer(viewport.uid);
        renderer.setViewport([sxStartDisplayCoords, syStartDisplayCoords, sxEndDisplayCoords, syEndDisplayCoords]);
      } // Returns the final xOffset


      return _xOffset;
    }
    /**
     * @method resize Resizes the offscreen viewport and recalculates translations to on screen canvases.
     * It is up to the parent app to call the size of the on-screen canvas changes.
     * This is left as an app level concern as one might want to debounce the changes, or the like.
     */

  }, {
    key: "resize",
    value: function resize() {
      this._throwIfDestroyed(); // 1. Get the viewports' canvases


      var viewports = this._getViewportsAsArray();

      var canvases = viewports.map(function (vp) {
        return vp.canvas;
      }); // 2. Recalculate and resize the offscreen canvas size

      var _this$_resizeOffScree3 = this._resizeOffScreenCanvas(canvases),
          offScreenCanvasWidth = _this$_resizeOffScree3.offScreenCanvasWidth,
          offScreenCanvasHeight = _this$_resizeOffScree3.offScreenCanvasHeight; // 3. Recalculate the viewports location on the off screen canvas


      this._resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight); // 4. Render all


      this.render();
    }
    /**
     * Calculates the location of the provided viewport on the offScreenCanvas
     *
     * @param viewports An array of viewports
     * @param offScreenCanvasWidth new offScreen canvas width
     * @param offScreenCanvasHeight new offScreen canvas height
     * @param _xOffset xOffSet to draw
     */

  }, {
    key: "_getViewportCoordsOnOffScreenCanvas",
    value: function _getViewportCoordsOnOffScreenCanvas(viewport, offScreenCanvasWidth, offScreenCanvasHeight, _xOffset) {
      var canvas = viewport.canvas;
      var clientWidth = canvas.clientWidth,
          clientHeight = canvas.clientHeight; // Set the canvas to be same resolution as the client.

      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
      } // Update the canvas drawImage offsets.


      var sx = _xOffset;
      var sy = 0;
      var sWidth = clientWidth;
      var sHeight = clientHeight;
      var sxStartDisplayCoords = sx / offScreenCanvasWidth; // Need to offset y if it not max height

      var syStartDisplayCoords = sy + (offScreenCanvasHeight - clientHeight) / offScreenCanvasHeight;
      var sWidthDisplayCoords = sWidth / offScreenCanvasWidth;
      var sHeightDisplayCoords = sHeight / offScreenCanvasHeight;
      return {
        sxStartDisplayCoords: sxStartDisplayCoords,
        syStartDisplayCoords: syStartDisplayCoords,
        sxEndDisplayCoords: sxStartDisplayCoords + sWidthDisplayCoords,
        syEndDisplayCoords: syStartDisplayCoords + sHeightDisplayCoords,
        sx: sx,
        sy: sy,
        sWidth: sWidth,
        sHeight: sHeight
      };
    }
    /**
     * @method getScene Returns the scene, only scenes with SceneUID (not internal)
     * are returned
     * @param {string} sceneUID The UID of the scene to fetch.
     *
     * @returns {Scene} The scene object.
     */

  }, {
    key: "getScene",
    value: function getScene(sceneUID) {
      this._throwIfDestroyed(); // Todo: should the volume be decached?


      return this._scenes.get(sceneUID);
    }
    /**
     * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
     *
     * @returns {Scene} The scene object.
     */

  }, {
    key: "getScenes",
    value: function getScenes() {
      this._throwIfDestroyed();

      return Array.from(this._scenes.values()).filter(function (s) {
        // Do not return Scenes not explicitly created by the user
        return s.getIsInternalScene() === false;
      });
    }
    /**
     * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
     *
     * @returns {Scene} The scene object.
     */

  }, {
    key: "removeScene",
    value: function removeScene(sceneUID) {
      this._throwIfDestroyed();

      this._scenes.delete(sceneUID);
    }
    /**
     * @method _getViewportsAsArray Returns an array of all viewports
     *
     * @returns {Array} Array of viewports.
     */

  }, {
    key: "_getViewportsAsArray",
    value: function _getViewportsAsArray() {
      return Array.from(this._viewports.values());
    }
    /**
     * @method getViewport Returns the viewport by UID
     *
     * @returns {StackViewport | VolumeViewport} viewport
     */

  }, {
    key: "getViewport",
    value: function getViewport(uid) {
      return this._viewports.get(uid);
    }
    /**
     * @method getViewportsContainingVolumeUID Returns the viewport containing the volumeUID
     *
     * @returns {VolumeViewport} viewports
     */

  }, {
    key: "getViewportsContainingVolumeUID",
    value: function getViewportsContainingVolumeUID(uid) {
      var viewports = this._getViewportsAsArray();

      return viewports.filter(function (vp) {
        var volActors = vp.getDefaultActor();
        return volActors.volumeActor && volActors.uid === uid;
      });
    }
    /**
     * @method getScenesContainingVolume Returns the scenes containing the volumeUID
     *
     * @returns {Scene} scenes
     */

  }, {
    key: "getScenesContainingVolume",
    value: function getScenesContainingVolume(uid) {
      var scenes = this.getScenes();
      return scenes.filter(function (scene) {
        var volumeActors = scene.getVolumeActors();
        var firstActor = volumeActors[0];
        return firstActor.volumeActor && firstActor.uid === uid;
      });
    }
    /**
     * @method getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
     *
     * @returns {Viewport} The scene object.
     */

  }, {
    key: "getViewports",
    value: function getViewports() {
      this._throwIfDestroyed();

      return this._getViewportsAsArray();
    }
  }, {
    key: "_setViewportsToBeRenderedNextFrame",
    value: function _setViewportsToBeRenderedNextFrame(viewportUIDs) {
      var _this2 = this;

      // Add the viewports to the set of flagged viewports
      viewportUIDs.forEach(function (viewportUID) {
        _this2._needsRender.add(viewportUID);
      }); // Render any flagged viewports

      this._render();
    }
    /**
     * @method render Renders all viewports on the next animation frame.
     */

  }, {
    key: "render",
    value: function render() {
      var viewports = this.getViewports();
      var viewportUIDs = viewports.map(function (vp) {
        return vp.uid;
      });

      this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
    /**
     * @method _render Sets up animation frame if necessary
     */

  }, {
    key: "_render",
    value: function _render() {
      // If we have viewports that need rendering and we have not already
      // set the RAF callback to run on the next frame.
      if (this._needsRender.size > 0 && this._animationFrameSet === false) {
        this._animationFrameHandle = window.requestAnimationFrame(this._renderFlaggedViewports); // Set the flag that we have already set up the next RAF call.

        this._animationFrameSet = true;
      }
    }
    /**
     * @method _renderFlaggedViewports Renders all viewports.
     */

  }, {
    key: "renderScene",
    value:
    /**
     * @method renderScene Renders only a specific `Scene` on the next animation frame.
     *
     * @param {string} sceneUID The UID of the scene to render.
     */
    function renderScene(sceneUID) {
      var scene = this.getScene(sceneUID);
      var viewportUIDs = scene.getViewportUIDs();

      this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
  }, {
    key: "renderScenes",
    value:
    /**
     * @method renderScenes Renders the provided Scene UIDs.
     *
     * @returns{void}
     */
    function renderScenes(sceneUIDs) {
      var _this3 = this;

      var scenes = sceneUIDs.map(function (sUid) {
        return _this3.getScene(sUid);
      });

      this._renderScenes(scenes);
    }
    /**
     * @method renderViewports Renders the provided Viewport UIDs.
     *
     * @returns{void}
     */

  }, {
    key: "renderViewports",
    value: function renderViewports(viewportUIDs) {
      this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
    /**
     * @method _renderScenes setup for rendering the provided Scene UIDs.
     *
     * @returns{void}
     */

  }, {
    key: "_renderScenes",
    value: function _renderScenes(scenes) {
      this._throwIfDestroyed();

      var viewportUIDs = [];

      for (var i = 0; i < scenes.length; i++) {
        var scene = scenes[i];
        var sceneViewportUIDs = scene.getViewportUIDs();
        viewportUIDs.push.apply(viewportUIDs, _toConsumableArray(sceneViewportUIDs));
      }

      this._setViewportsToBeRenderedNextFrame(viewportUIDs);
    }
    /**
     * @method renderViewport Renders only a specific `Viewport` on the next animation frame.
     *
     * @param {string} viewportUID The UID of the viewport.
     */

  }, {
    key: "renderViewport",
    value: function renderViewport(viewportUID) {
      this._setViewportsToBeRenderedNextFrame([viewportUID]);
    }
    /**
     * @method _renderViewportToCanvas Renders a particular `Viewport`'s on screen canvas.
     * @param {Viewport} viewport The `Viewport` to render.
     * @param {object} offScreenCanvas The offscreen canvas to render from.
     */

  }, {
    key: "_renderViewportToCanvas",
    value: function _renderViewportToCanvas(viewport, offScreenCanvas) {
      var sx = viewport.sx,
          sy = viewport.sy,
          sWidth = viewport.sWidth,
          sHeight = viewport.sHeight,
          uid = viewport.uid,
          sceneUID = viewport.sceneUID,
          renderingEngineUID = viewport.renderingEngineUID;
      var canvas = viewport.canvas;
      var dWidth = canvas.width,
          dHeight = canvas.height;
      var onScreenContext = canvas.getContext('2d');
      onScreenContext.drawImage(offScreenCanvas, sx, sy, sWidth, sHeight, 0, //dx
      0, // dy
      dWidth, dHeight);
      var eventData = {
        canvas: canvas,
        viewportUID: uid,
        sceneUID: sceneUID,
        renderingEngineUID: renderingEngineUID
      };
      triggerEvent(canvas, events.IMAGE_RENDERED, eventData);
    }
    /**
     * @method _resetViewport Reset the viewport by removing the data attributes
     * and clearing the context of draw. It also emits an element disabled event
     *
     * @param {Viewport} viewport The `Viewport` to render.
     * @returns{void}
     */

  }, {
    key: "_resetViewport",
    value: function _resetViewport(viewport) {
      var renderingEngineUID = this.uid;
      var canvas = viewport.canvas,
          viewportUID = viewport.uid;
      var eventData = {
        canvas: canvas,
        viewportUID: viewportUID,
        //sceneUID, // todo: where to get this now?
        renderingEngineUID: renderingEngineUID
      };
      canvas.removeAttribute('data-viewport-uid');
      canvas.removeAttribute('data-scene-uid');
      canvas.removeAttribute('data-rendering-engine-uid'); // todo: remove svg layer
      // clear drawing

      var context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      triggerEvent(src_eventTarget, events.ELEMENT_DISABLED, eventData);
    }
    /**
     * @method _reset Resets the `RenderingEngine`
     */

  }, {
    key: "_reset",
    value: function _reset() {
      var _this4 = this;

      var viewports = this._getViewportsAsArray();

      viewports.forEach(function (viewport) {
        _this4._resetViewport(viewport);
      });
      window.cancelAnimationFrame(this._animationFrameHandle);

      this._needsRender.clear();

      this._animationFrameSet = false;
      this._animationFrameHandle = null;
      this._viewports = new Map();
      this._scenes = new Map();
    }
    /**
     * @method destroy the rendering engine
     */

  }, {
    key: "destroy",
    value: function destroy() {
      if (this.hasBeenDestroyed) {
        return;
      }

      this._reset(); // Free up WebGL resources


      this.offscreenMultiRenderWindow.delete();
      RenderingEngine_renderingEngineCache.delete(this.uid); // Make sure all references go stale and are garbage collected.

      delete this.offscreenMultiRenderWindow;
      this.hasBeenDestroyed = true;
    }
    /**
     * @method _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
     * instance after its `destroy` method has been called.
     */

  }, {
    key: "_throwIfDestroyed",
    value: function _throwIfDestroyed() {
      if (this.hasBeenDestroyed) {
        throw new Error('this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.');
      }
    } // debugging utils for offScreen canvas

  }, {
    key: "_downloadOffScreenCanvas",
    value: function _downloadOffScreenCanvas() {
      var dataURL = this._debugRender();

      _TEMPDownloadURI(dataURL);
    } // debugging utils for offScreen canvas

  }, {
    key: "_debugRender",
    value: function _debugRender() {
      // Renders all scenes
      var offscreenMultiRenderWindow = this.offscreenMultiRenderWindow;
      var renderWindow = offscreenMultiRenderWindow.getRenderWindow();
      var renderers = offscreenMultiRenderWindow.getRenderers();

      for (var i = 0; i < renderers.length; i++) {
        renderers[i].renderer.setDraw(true);
      }

      renderWindow.render();
      var openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
      var context = openGLRenderWindow.get3DContext();
      var offScreenCanvas = context.canvas;
      var dataURL = offScreenCanvas.toDataURL();

      this._getViewportsAsArray().forEach(function (viewport) {
        var sx = viewport.sx,
            sy = viewport.sy,
            sWidth = viewport.sWidth,
            sHeight = viewport.sHeight;
        var canvas = viewport.canvas;
        var dWidth = canvas.width,
            dHeight = canvas.height;
        var onScreenContext = canvas.getContext('2d'); //sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight

        onScreenContext.drawImage(offScreenCanvas, sx, sy, sWidth, sHeight, 0, //dx
        0, // dy
        dWidth, dHeight);
      });

      return dataURL;
    }
  }]);

  return RenderingEngine;
}();

/* harmony default export */ var RenderingEngine_RenderingEngine = (RenderingEngine); // debugging utils for offScreen canvas

function _TEMPDownloadURI(uri) {
  var link = document.createElement('a');
  link.download = 'viewport.png';
  link.href = uri;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
;// CONCATENATED MODULE: ./src/RenderingEngine/getRenderingEngine.ts


/**
 * Method to retrieve a RenderingEngine by its unique identifier.
 *
 * @example
 * How to get a RenderingEngine that was created earlier:
 * ```
 * import { RenderingEngine, getRenderingEngine } from 'vtkjs-viewport';
 *
 * const renderingEngine = new RenderingEngine('my-engine');
 *
 * // getting reference to rendering engine later...
 * const renderingEngine = getRenderingEngine('my-engine');
 * ```
 *
 * @param uid The unique identifer that was used to create the RenderingEngine
 * @returns the matching RenderingEngine, or `undefined` if there is no match
 * @public
 */
function getRenderingEngine(uid) {
  // if (!uid) {
  //   return renderingEngineCache.getAll()
  // }
  return RenderingEngine_renderingEngineCache.get(uid);
}
function getRenderingEngines() {
  return RenderingEngine_renderingEngineCache.getAll();
}
/* harmony default export */ var RenderingEngine_getRenderingEngine = (getRenderingEngine);
;// CONCATENATED MODULE: ./src/RenderingEngine/index.ts



/* harmony default export */ var src_RenderingEngine = (RenderingEngine_RenderingEngine);
;// CONCATENATED MODULE: ./src/cache/classes/ImageVolume.ts



var ImageVolume = // Seems weird to pass this in? Why not grab it from scalarData.byteLength
// No good way of referencing vtk classes as they aren't classes.
function ImageVolume(props) {
  _classCallCheck(this, ImageVolume);

  _defineProperty(this, "uid", void 0);

  _defineProperty(this, "dimensions", void 0);

  _defineProperty(this, "direction", void 0);

  _defineProperty(this, "metadata", void 0);

  _defineProperty(this, "origin", void 0);

  _defineProperty(this, "scalarData", void 0);

  _defineProperty(this, "scaling", void 0);

  _defineProperty(this, "sizeInBytes", void 0);

  _defineProperty(this, "spacing", void 0);

  _defineProperty(this, "numVoxels", void 0);

  _defineProperty(this, "vtkImageData", void 0);

  _defineProperty(this, "vtkOpenGLTexture", void 0);

  _defineProperty(this, "loadStatus", void 0);

  _defineProperty(this, "imageIds", void 0);

  this.uid = props.uid;
  this.metadata = props.metadata;
  this.dimensions = props.dimensions;
  this.spacing = props.spacing;
  this.origin = props.origin;
  this.direction = props.direction;
  this.vtkImageData = props.vtkImageData;
  this.scalarData = props.scalarData;
  this.sizeInBytes = props.sizeInBytes;
  this.vtkOpenGLTexture = vtkClasses_vtkStreamingOpenGLTexture.newInstance();
  this.numVoxels = this.dimensions[0] * this.dimensions[1] * this.dimensions[2];

  if (props.scaling) {
    this.scaling = props.scaling;
  }
};
/* harmony default export */ var classes_ImageVolume = ((/* unused pure expression or super */ null && (ImageVolume)));
;// CONCATENATED MODULE: ./src/cache/index.ts



/* harmony default export */ var src_cache = (src_cache_cache);
;// CONCATENATED MODULE: ./src/getEnabledElement.ts


/**
 * A convenience method to find an EnabledElement given a reference to its
 * associated canvas element. Commonly used in code that's handling a custom
 * event emitted by this library.
 *
 * @example
 * Using the renderingEngine to find the enabled element:
 * ```
 * const canvas = getRenderingEngine(renderingEngineUID)
 *    .getScene(sceneUID)
 *    .getViewport(viewportUID)
 *    .getCanvas()
 *
 * const enabledElement = getEnabledElement(canvas)
 * ```
 *
 * @example
 * Using a cornerstone event's "element"
 * ```
 * // Our "cornerstone events" contain the source element, which is
 * // raised on the viewport's canvas element
 * const { element: canvas } = evt.detail
 * const enabledElement = getEnabledElement(canvas)
 * ```
 *
 * @param canvas a reference to an EnabledElement/Viewport's canvas element
 * @returns the associated EnabledElement, or undefined if no matching EnabledElement
 * can be found
 */
function getEnabledElement(canvas) {
  if (!canvas) {
    return;
  }

  var _canvas$dataset = canvas.dataset,
      viewportUID = _canvas$dataset.viewportUid,
      sceneUID = _canvas$dataset.sceneUid,
      renderingEngineUID = _canvas$dataset.renderingEngineUid;

  if (!renderingEngineUID || !viewportUID) {
    return;
  }

  var renderingEngine = RenderingEngine_getRenderingEngine(renderingEngineUID);

  if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
    return;
  }

  var scene = renderingEngine.getScene(sceneUID);
  var viewport = renderingEngine.getViewport(viewportUID);
  var FrameOfReferenceUID = viewport.getFrameOfReferenceUID();
  return {
    viewport: viewport,
    scene: scene,
    renderingEngine: renderingEngine,
    viewportUID: viewportUID,
    sceneUID: sceneUID,
    renderingEngineUID: renderingEngineUID,
    FrameOfReferenceUID: FrameOfReferenceUID
  };
}
;// CONCATENATED MODULE: ./src/configuration.ts
var _configuration = {
  autoRenderOnLoad: true,
  autoRenderPercentage: 2
};
/**
 * Configuration used by the library that impacts behavior. Supports updating
 * one or more configuration value at a time.
 */

var configuration = {
  /**
   * Returns the Library Configuration's current values
   *
   * @example
   * Retrieving a library configuration value:
   * ```
   * const { autoRenderOnLoad } = configuration.get();
   * ```
   */
  get: function get() {
    return JSON.parse(JSON.stringify(_configuration));
  },

  /**
   * Set one or more library configuration values
   *
   * @param newConfiguration key/value pairs to update
   * @example
   * Update a single configuration field's value:
   * ```
   * // => { autoRenderOnLoad: true, autoRenderPercentage: 2 }
   * configuration.set({ autoRenderOnLoad: false });
   * // => { autoRenderOnLoad: false, autoRenderPercentage: 2 }
   * ```
   * @example
   * Update multiple configuration field values:
   * ```
   * // => { autoRenderOnLoad: true, autoRenderPercentage: 2 }
   * configuration.set({ autoRenderOnLoad: false, autoRenderPercentage: 10 });
   * // => { autoRenderOnLoad: false, autoRenderPercentage: 10 }
   * ```
   */
  set: function set(newConfiguration) {
    Object.assign(_configuration, newConfiguration);
  }
};
/* harmony default export */ var src_configuration = (configuration);
;// CONCATENATED MODULE: ./src/Settings.ts




/*
 * Constants
 */
var DEFAULT_SETTINGS = Symbol('DefaultSettings');
var RUNTIME_SETTINGS = Symbol('RuntimeSettings');
var OBJECT_SETTINGS_MAP = Symbol('ObjectSettingsMap');
var DICTIONARY = Symbol('Dictionary');
/**
 * @class Settings
 */

var Settings = /*#__PURE__*/function () {
  function Settings(base) {
    _classCallCheck(this, Settings);

    var dictionary = Object.create(base instanceof Settings && DICTIONARY in base ? base[DICTIONARY] : null);
    Object.seal(Object.defineProperty(this, DICTIONARY, {
      value: dictionary
    }));
  }

  _createClass(Settings, [{
    key: "set",
    value: function set(key, value) {
      return _set(this[DICTIONARY], key, value, null);
    }
  }, {
    key: "get",
    value: function get(key) {
      return _get(this[DICTIONARY], key);
    }
    /**
     * Unset a specific key or a set of keys within a namespace when the key ends with a dot (ASCII #46).
     * If the key is ".", all keys will be removed and this command works as a reset.
     * @param {object} dictionary The dictionary on which to unset a key.
     * @param {string} name The key to be unset or a namespace.
     * @returns boolean
     */

  }, {
    key: "unset",
    value: function unset(key) {
      return _unset(this[DICTIONARY], key + '');
    }
  }, {
    key: "forEach",
    value: function forEach(callback) {
      iterate(this[DICTIONARY], callback);
    }
  }, {
    key: "extend",
    value: function extend() {
      return new Settings(this);
    }
  }], [{
    key: "assert",
    value: function assert(subject) {
      return subject instanceof Settings ? subject : Settings.getRuntimeSettings();
    }
  }, {
    key: "getDefaultSettings",
    value: function getDefaultSettings() {
      var defaultSettings = Settings[DEFAULT_SETTINGS];

      if (!(defaultSettings instanceof Settings)) {
        defaultSettings = new Settings();
        Settings[DEFAULT_SETTINGS] = defaultSettings;
      }

      return defaultSettings;
    }
  }, {
    key: "getRuntimeSettings",
    value: function getRuntimeSettings() {
      var runtimeSettings = Settings[RUNTIME_SETTINGS];

      if (!(runtimeSettings instanceof Settings)) {
        runtimeSettings = new Settings(Settings.getDefaultSettings());
        Settings[RUNTIME_SETTINGS] = runtimeSettings;
      }

      return runtimeSettings;
    }
  }, {
    key: "getObjectSettings",
    value: function getObjectSettings(subject, from) {
      var settings = null;

      if (subject instanceof Settings) {
        settings = subject;
      } else if (_typeof(subject) === 'object' && subject !== null) {
        var objectSettingsMap = Settings[OBJECT_SETTINGS_MAP];

        if (!(objectSettingsMap instanceof WeakMap)) {
          objectSettingsMap = new WeakMap();
          Settings[OBJECT_SETTINGS_MAP] = objectSettingsMap;
        }

        settings = objectSettingsMap.get(subject);

        if (!(settings instanceof Settings)) {
          settings = new Settings(Settings.assert(Settings.getObjectSettings(from)));
          objectSettingsMap.set(subject, settings);
        }
      }

      return settings;
    }
  }, {
    key: "extendRuntimeSettings",
    value: function extendRuntimeSettings() {
      return Settings.getRuntimeSettings().extend();
    }
  }]);

  return Settings;
}();
/*
 * Local Helpers
 */




function _unset(dictionary, name) {
  if (name.endsWith('.')) {
    var deleteCount = 0;
    var namespace = name;
    var base = namespace.slice(0, -1);
    var deleteAll = base.length === 0;

    for (var _key in dictionary) {
      if (Object.prototype.hasOwnProperty.call(dictionary, _key) && (deleteAll || _key.startsWith(namespace) || _key === base)) {
        delete dictionary[_key];
        ++deleteCount;
      }
    }

    return deleteCount > 0;
  }

  return delete dictionary[name];
}

function iterate(dictionary, callback) {
  for (var _key2 in dictionary) {
    callback(_key2, dictionary[_key2]);
  }
}

function setAll(dictionary, prefix, record, references) {
  var failCount;

  if (references.has(record)) {
    return _set(dictionary, prefix, null, references);
  }

  references.add(record);
  failCount = 0;

  for (var field in record) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      var _key3 = field.length === 0 ? prefix : "".concat(prefix, ".").concat(field);

      if (!_set(dictionary, _key3, record[field], references)) {
        ++failCount;
      }
    }
  }

  references.delete(record);
  return failCount === 0;
}
/**
 * Set the key-value pair on a given dictionary. If the given value is a
 * plain javascript object, every property of that object will also be set.
 * @param dictionary {Record<string, unknown>} The target dictionary
 * @param key {string} The given key
 * @param value {unknown} The given value
 * @param references {WeakSet<Record<string, unknown>>} references is a WeakSet
 *  instance used to keep track of which objects have already been iterated
 *  through preventing thus possible stack overflows caused by cyclic references
 * @returns {boolean} Returns true if every given key-value pair has been
 * successfully set
 */


function _set(dictionary, key, value, references) {
  if (isValidKey(key)) {
    if (isPlainObject(value)) {
      return setAll(dictionary, key, value, references instanceof WeakSet ? references : new WeakSet());
    }

    dictionary[key] = value;
    return true;
  }

  return false;
}

function _get(dictionary, key) {
  return dictionary[key];
}
/**
 * Make sure the -provided key correctly formatted.
 * e.g.:
 *  "my.cool.property" (valid)
 *  "my.cool.property." (invalid)
 *  ".my.cool.property" (invalid)
 *  "my.cool..property" (invalid)
 * @param key {string} The property name to be used as key within the internal
 *  dictionary
 * @returns {boolean} True on success, false otherwise
 */


function isValidKey(key) {
  var last, current, previous;
  if (typeof key !== 'string' || (last = key.length - 1) < 0) return false;
  previous = -1;

  while ((current = key.indexOf('.', previous + 1)) >= 0) {
    if (current - previous < 2 || current === last) return false;
    previous = current;
  }

  return true;
}

function isPlainObject(subject) {
  if (_typeof(subject) === 'object' && subject !== null) {
    var prototype = Object.getPrototypeOf(subject);

    if (prototype === Object.prototype || prototype === null) {
      return true;
    }
  }

  return false;
}
// EXTERNAL MODULE: ./src/types/ICamera.ts
var ICamera = __webpack_require__(469);
var ICamera_default = /*#__PURE__*/__webpack_require__.n(ICamera);
// EXTERNAL MODULE: ./src/types/IEnabledElement.ts
var IEnabledElement = __webpack_require__(3648);
var IEnabledElement_default = /*#__PURE__*/__webpack_require__.n(IEnabledElement);
// EXTERNAL MODULE: ./src/types/ICache.ts
var ICache = __webpack_require__(2919);
var ICache_default = /*#__PURE__*/__webpack_require__.n(ICache);
// EXTERNAL MODULE: ./src/types/IVolume.ts
var IVolume = __webpack_require__(3374);
var IVolume_default = /*#__PURE__*/__webpack_require__.n(IVolume);
// EXTERNAL MODULE: ./src/types/voi.ts
var voi = __webpack_require__(8967);
var voi_default = /*#__PURE__*/__webpack_require__.n(voi);
// EXTERNAL MODULE: ./src/types/ImageLoaderFn.ts
var ImageLoaderFn = __webpack_require__(2320);
var ImageLoaderFn_default = /*#__PURE__*/__webpack_require__.n(ImageLoaderFn);
// EXTERNAL MODULE: ./src/types/IImageVolume.ts
var IImageVolume = __webpack_require__(9572);
var IImageVolume_default = /*#__PURE__*/__webpack_require__.n(IImageVolume);
// EXTERNAL MODULE: ./src/types/VolumeLoaderFn.ts
var VolumeLoaderFn = __webpack_require__(9778);
var VolumeLoaderFn_default = /*#__PURE__*/__webpack_require__.n(VolumeLoaderFn);
// EXTERNAL MODULE: ./src/types/IRegisterImageLoader.ts
var IRegisterImageLoader = __webpack_require__(4373);
var IRegisterImageLoader_default = /*#__PURE__*/__webpack_require__.n(IRegisterImageLoader);
// EXTERNAL MODULE: ./src/types/IStreamingVolume.ts
var IStreamingVolume = __webpack_require__(1543);
var IStreamingVolume_default = /*#__PURE__*/__webpack_require__.n(IStreamingVolume);
// EXTERNAL MODULE: ./src/types/IViewport.ts
var IViewport = __webpack_require__(8627);
var IViewport_default = /*#__PURE__*/__webpack_require__.n(IViewport);
// EXTERNAL MODULE: ./src/types/IActor.ts
var IActor = __webpack_require__(3182);
// EXTERNAL MODULE: ./src/types/ILoadObject.ts
var ILoadObject = __webpack_require__(607);
// EXTERNAL MODULE: ./src/types/LibraryConfiguration.ts
var LibraryConfiguration = __webpack_require__(9162);
var LibraryConfiguration_default = /*#__PURE__*/__webpack_require__.n(LibraryConfiguration);
// EXTERNAL MODULE: ./src/types/Metadata.ts
var Metadata = __webpack_require__(1578);
var Metadata_default = /*#__PURE__*/__webpack_require__.n(Metadata);
// EXTERNAL MODULE: ./src/types/Orientation.ts
var Orientation = __webpack_require__(6824);
var Orientation_default = /*#__PURE__*/__webpack_require__.n(Orientation);
// EXTERNAL MODULE: ./src/types/Point2.ts
var Point2 = __webpack_require__(5339);
var Point2_default = /*#__PURE__*/__webpack_require__.n(Point2);
// EXTERNAL MODULE: ./src/types/Point3.ts
var Point3 = __webpack_require__(3062);
var Point3_default = /*#__PURE__*/__webpack_require__.n(Point3);
// EXTERNAL MODULE: ./src/types/IStreamingImageVolume.ts
var IStreamingImageVolume = __webpack_require__(2729);
var IStreamingImageVolume_default = /*#__PURE__*/__webpack_require__.n(IStreamingImageVolume);
// EXTERNAL MODULE: ./src/types/ViewportInputOptions.ts
var ViewportInputOptions = __webpack_require__(626);
var ViewportInputOptions_default = /*#__PURE__*/__webpack_require__.n(ViewportInputOptions);
// EXTERNAL MODULE: ./src/types/IImage.ts
var IImage = __webpack_require__(7599);
var IImage_default = /*#__PURE__*/__webpack_require__.n(IImage);
;// CONCATENATED MODULE: ./src/types/index.ts






















;// CONCATENATED MODULE: ./src/index.ts

 //


 //















 // Classes

 // Namespaces




var getVolume = src_cache.getVolume;

}();
/******/ 	return __webpack_exports__;
/******/ })()
;
});