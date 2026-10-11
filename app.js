"use strict";

const Homey = require("homey");
const { registerChannelFlowCards } = require("./lib/Channels");

class SonoffZigbeeApp extends Homey.App {
  onInit() {
    this.log("Sonoff Zigbee - StyraHem, initiating...");
    registerChannelFlowCards(this.homey);
  }
}

module.exports = SonoffZigbeeApp;
