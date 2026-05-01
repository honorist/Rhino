#!/usr/bin/env node
// Incrementa a versão do package.json em +0.001 (ex: 1.001 → 1.002)
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const current = pkg.version || '1.0.0';
const parts = current.split('.').map(Number);
parts[2] = (parts[2] || 0) + 1;
const next = parts.join('.');
pkg.version = next;

fs.writeFileSync(path.join(__dirname, '../package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`Versão: ${current} → ${next}`);
