"use strict";

var files = [];

function add(file) {
  var fileIndex =  files.push(file);
  return 'dicomfile:' + (fileIndex - 1);
}

function get(index) {
  return files[index];
}

function remove(index) {
  files[index] = undefined;
}

function purge() {
  files = [];
}

export default {
  add : add,
  get : get,
  remove:remove,
  purge: purge
};
