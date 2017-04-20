"use strict";

var imageIds = [];

function add(imageId, metadata) {
  imageIds[imageId] = metadata;
}

function get(imageId) {
  return imageIds[imageId];
}

function remove(imageId) {
  imageIds[imageId] = undefined;
}

function purge() {
  imageIds = [];
}

export default {
  add : add,
  get : get,
  remove:remove,
  purge: purge
};
