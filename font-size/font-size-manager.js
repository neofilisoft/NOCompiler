'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULTS = Object.freeze(require('./font-size-defaults.json'));
const INTER_FONT_FILES = Object.freeze([
  { family: 'Inter', fileName: 'InterVariable.ttf', style: 'normal', weight: '100 900', format: 'truetype' },
  { family: 'Inter', fileName: 'InterVariable-Italic.ttf', style: 'italic', weight: '100 900', format: 'truetype' },
]);

function resolveFontSizeDir(baseDir = __dirname) {
  const candidates = [
    __dirname,
    path.resolve(baseDir, 'font-size'),
    path.resolve(baseDir, '..', 'font-size'),
    path.resolve(baseDir, '..', '..', 'font-size'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function resolveExistingFontFiles(baseDir = __dirname) {
  const fontDir = resolveFontSizeDir(baseDir);
  if (!fontDir) return [];
  return INTER_FONT_FILES
    .map((entry) => ({ ...entry, absolutePath: path.join(fontDir, entry.fileName) }))
    .filter((entry) => fs.existsSync(entry.absolutePath));
}

function buildInterFontFaceCss(baseDir = __dirname) {
  return resolveExistingFontFiles(baseDir)
    .map((entry) => {
      const href = pathToFileURL(entry.absolutePath).href;
      return [
        '@font-face {',
        `  font-family: '${entry.family}';`,
        `  src: url('${href}') format('${entry.format}');`,
        `  font-style: ${entry.style};`,
        `  font-weight: ${entry.weight};`,
        '  font-display: swap;',
        '}',
      ].join('\n');
    })
    .join('\n');
}

module.exports = {
  DEFAULTS,
  INTER_FONT_FILES,
  resolveFontSizeDir,
  resolveExistingFontFiles,
  buildInterFontFaceCss,
};
