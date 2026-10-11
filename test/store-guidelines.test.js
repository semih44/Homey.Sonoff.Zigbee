'use strict';

// Checks against the Homey App Store guidelines (apps.developer.homey.app/app-store/guidelines)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANGUAGES = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko'];

function jsonFiles(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) return ['assets', 'node_modules'].includes(name) ? [] : jsonFiles(file);
    return file.endsWith('.json') ? [file] : [];
  });
}
const COMPOSE_FILES = [...jsonFiles(path.join(ROOT, 'drivers')), ...jsonFiles(path.join(ROOT, '.homeycompose'))];
const DRIVERS = fs.readdirSync(path.join(ROOT, 'drivers'))
  .filter(id => fs.existsSync(path.join(ROOT, 'drivers', id, 'driver.compose.json')));

// All translation objects ({ en: ... }) in a parsed manifest
function translations(node) {
  if (Array.isArray(node)) return node.flatMap(translations);
  if (!node || typeof node !== 'object') return [];
  if (typeof node.en === 'string') return [node];
  return Object.values(node).flatMap(translations);
}

function flowCards() {
  const files = COMPOSE_FILES.filter(file => file.endsWith('driver.flow.compose.json'));
  const fromDrivers = files.flatMap(file => Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).flat());
  const fromApp = COMPOSE_FILES.filter(file => file.includes(`${path.sep}.homeycompose${path.sep}flow${path.sep}`))
    .map(file => ({ id: path.basename(file, '.json'), ...JSON.parse(fs.readFileSync(file, 'utf8')) }));
  return [...fromDrivers, ...fromApp];
}

// PNG colour type (IHDR byte 25): 4 and 6 carry an alpha channel; a tRNS chunk makes others transparent
function hasTransparency(file) {
  const png = fs.readFileSync(file);
  return [4, 6].includes(png[25]) || png.includes(Buffer.from('tRNS'));
}

test('every text is translated into all 12 languages', () => {
  const incomplete = COMPOSE_FILES.flatMap(file => translations(JSON.parse(fs.readFileSync(file, 'utf8')))
    .filter(text => LANGUAGES.some(language => typeof text[language] !== 'string'))
    .map(text => `${path.relative(ROOT, file)}: ${text.en}`));
  assert.deepEqual(incomplete, []);
});

test('every locale holds the same texts', () => {
  const keys = locale => {
    const flatten = (node, prefix) => Object.entries(node).flatMap(([key, value]) => (typeof value === 'object'
      ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]));
    return flatten(JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${locale}.json`), 'utf8')), '').sort();
  };
  for (const language of LANGUAGES) assert.deepEqual(keys(language), keys('en'), language);
});

test('English texts spell "approx." correctly', () => {
  const typos = COMPOSE_FILES.flatMap(file => translations(JSON.parse(fs.readFileSync(file, 'utf8'))))
    .filter(text => /\baprox\b/.test(text.en)).map(text => text.en);
  assert.deepEqual(typos, []);
});

test('the measured values of the MINI-ZBDIM are not marked as estimated', () => {
  const options = require('../drivers/MINI-ZBDIM/driver.compose.json').capabilitiesOptions || {};
  const approximated = Object.entries(options).filter(([, option]) => option.approximated).map(([id]) => id);
  assert.deepEqual(approximated, []);
});

test('the child lock of the TRVZB starts off', () => {
  const settings = require('../drivers/TRVZB/driver.settings.compose.json');
  const walk = list => list.flatMap(setting => (setting.children ? walk(setting.children) : [setting]));
  assert.equal(walk(settings).find(setting => setting.id === 'child_lock').value, false);
});
