'use strict';

// Minimal stand-in for the Homey SDK module, which only exists inside the Homey runtime.
// Driver code only needs the base classes to exist; tests attach the methods they use.

class SimpleClass {}
class Device extends SimpleClass {}
class Driver extends SimpleClass {}
class App extends SimpleClass {}

module.exports = {
  SimpleClass,
  Device,
  Driver,
  App,
};
