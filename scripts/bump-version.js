#!/usr/bin/env node
// Uso: node scripts/bump-version.js [patch|minor|major] "Resumo da versão"
// Incrementa version em package.json e prepende entrada em changelog.json.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

const bump = process.argv[2] || 'patch';
const msg  = process.argv[3] || '';

const current = pkg.version || '1.0.0';
const parts = current.split('.').map(Number);

if (bump === 'major')      { parts[0]++; parts[1] = 0; parts[2] = 0; }
else if (bump === 'minor') { parts[1]++; parts[2] = 0; }
else                       { parts[2] = (parts[2] || 0) + 1; }

const next = parts.join('.');
pkg.version = next;

fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`Versao: ${current} -> ${next}`);

// Escreve entrada no changelog.json
const clPath = path.join(ROOT, 'changelog.json');
const cl = JSON.parse(fs.readFileSync(clPath, 'utf8'));

const entry = {
  version: next,
  date: new Date().toISOString().slice(0, 10),
  summary: msg || `v${next}`,
  changes: msg ? [msg] : [`Versao ${next}.`]
};

cl.entries.unshift(entry);
fs.writeFileSync(clPath, JSON.stringify(cl, null, 2) + '\n');
console.log(`Changelog: entrada v${next} adicionada.`);
