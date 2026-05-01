#!/usr/bin/env node
// Incrementa a versão do package.json em +0.001 (ex: 1.001 → 1.002)
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const current = parseFloat(pkg.version) || 1.0;
const next = (current + 0.001).toFixed(3);
pkg.version = next;

fs.writeFileSync(path.join(__dirname, '../package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`Versão: ${current.toFixed(3)} → ${next}`);
