'use strict';

// Resolve require('homey') to the local stand-in so driver modules can be loaded outside Homey
const Module = require('module');
const path = require('path');

const STUB_PATH = path.join(__dirname, 'homey-module.js');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, ...rest) {
  if (request === 'homey') return STUB_PATH;
  return originalResolveFilename.call(this, request, ...rest);
};
