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

test('Flow titles contain no parentheses ("Do not use parantheses in Flow titles")', () => {
  const titled = flowCards().flatMap(card => [card.title, card.titleFormatted].filter(Boolean)
    .flatMap(title => Object.entries(title).filter(([, text]) => /[()]/.test(text)).map(([language, text]) => `${card.id} ${language}: ${text}`)));
  assert.deepEqual(titled, []);
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

test('icons use a 960 x 960 canvas ("The canvas size should be 960x960px")', () => {
  const icons = [path.join(ROOT, 'assets', 'icon.svg'), ...DRIVERS.map(id => path.join(ROOT, 'drivers', id, 'assets', 'icon.svg'))]
    .filter(file => fs.existsSync(file));
  const otherCanvas = icons.filter(file => !/viewBox="0 0 960 960"/.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(ROOT, file));
  assert.deepEqual(otherCanvas, []);
});

test('driver images have a white background, not a transparent one', () => {
  const transparent = DRIVERS.flatMap(id => ['small', 'large', 'xlarge']
    .map(size => path.join(ROOT, 'drivers', id, 'assets', 'images', `${size}.png`)))
    .filter(file => fs.existsSync(file) && hasTransparency(file))
    .map(file => path.relative(ROOT, file));
  assert.deepEqual(transparent, []);
});

test('the readme is a short plain-text summary in every language', () => {
  for (const language of LANGUAGES) {
    const file = path.join(ROOT, language === 'en' ? 'README.txt' : `README.${language}.txt`);
    const text = fs.readFileSync(file, 'utf8').trim();
    const paragraphs = text.split(/\n\s*\n/);
    assert.ok(paragraphs.length <= 2, `${language}: ${paragraphs.length} paragraphs, "one to two paragraphs tops"`);
    assert.doesNotMatch(text, /https?:\/\//, `${language}: no URLs`);
    assert.doesNotMatch(text, /^\s*[-*#]/m, `${language}: plain text, no lists or headers`);
  }
});

test('the description does not repeat the app name', () => {
  const app = require('../.homeycompose/app.json');
  for (const language of LANGUAGES) {
    assert.ok(app.description[language], `${language}: description`);
    assert.doesNotMatch(app.description[language], new RegExp(app.name.en, 'i'), language);
  }
});
