import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { socialHtml, caHtml, recordsHtml, publicRecords } from '../../src/js/register.js';
import { ICON } from '../../src/js/icons.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readTokens() {
  const css = fs.readFileSync(path.join(ROOT, 'src/css/tokens.css'), 'utf8');
  const tokens = {};
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});\s*\/\*\s*([^@]+?)\s*@\s*(\d+),(\d+)\s*\*\//g)) {
    tokens[m[1]] = { hex: m[2].toLowerCase(), file: m[3], x: +m[4], y: +m[5] };
  }
  return tokens;
}

export function loadRegister() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src/register.json'), 'utf8'));
}

// Pure: register in, html out. Used by the build and by the mutation gates.
export function renderIndex(register) {
  const records = register.records;
  const tokens = readTokens();
  let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const json = JSON.stringify({ records: publicRecords(records) }).replace(/</g, '\\u003c');
  const map = {
    '{{REGISTER_JSON}}': json,
    '{{SOCIAL}}': socialHtml(records),
    '{{CA}}': caHtml(records),
    '{{RECORDS}}': recordsHtml(records),
    '{{COLOR_BG}}': tokens.bg.hex,
  };
  for (const [k, v] of Object.entries(map)) html = html.split(k).join(v);
  html = html.replace(/\{\{ICON_([a-z]+)\}\}/g, (_, n) => ICON[n] || '');
  return html;
}
