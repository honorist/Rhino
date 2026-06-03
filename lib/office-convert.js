'use strict';
/**
 * @file Converte um .xlsx (Buffer) em PDF usando LibreOffice headless.
 * Usado para gerar o RDO idêntico ao formulário oficial Passarelli: o template
 * é preenchido por lib/rdo-xlsx.js e renderizado aqui pelo LibreOffice (mesmo
 * motor do Excel), garantindo fidelidade total ao modelo.
 *
 * Cada conversão usa um diretório temporário próprio + um UserInstallation
 * exclusivo, o que permite conversões concorrentes sem o erro "another instance".
 */
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SOFFICE_BIN = process.env.SOFFICE_BIN || 'soffice';
const CONVERT_TIMEOUT_MS = 60 * 1000;

let _available = null;
/** True se o LibreOffice está instalado (cacheado). */
function isAvailable() {
  if (_available != null) return _available;
  try { execFileSync(SOFFICE_BIN, ['--version'], { timeout: 15000, stdio: 'ignore' }); _available = true; }
  catch { _available = false; }
  return _available;
}

function rmrf(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignora */ } }

/**
 * @param {Buffer} xlsxBuf
 * @returns {Promise<Buffer>} PDF
 */
function xlsxToPdf(xlsxBuf) {
  return new Promise((resolve, reject) => {
    const dir = path.join(os.tmpdir(), 'rdo-conv-' + crypto.randomBytes(8).toString('hex'));
    const profile = path.join(dir, 'profile');
    const xlsxPath = path.join(dir, 'rdo.xlsx');
    const pdfPath = path.join(dir, 'rdo.pdf');
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(xlsxPath, xlsxBuf);
    } catch (e) { rmrf(dir); return reject(e); }

    const args = [
      '--headless', '--norestore', '--nolockcheck', '--nodefault',
      '-env:UserInstallation=file://' + profile,
      '--convert-to', 'pdf:calc_pdf_Export', '--outdir', dir, xlsxPath,
    ];
    execFile(SOFFICE_BIN, args, { timeout: CONVERT_TIMEOUT_MS }, (err) => {
      try {
        if (!fs.existsSync(pdfPath)) {
          rmrf(dir);
          return reject(new Error('LibreOffice não gerou o PDF' + (err ? ': ' + err.message : '')));
        }
        const buf = fs.readFileSync(pdfPath);
        rmrf(dir);
        resolve(buf);
      } catch (e) { rmrf(dir); reject(e); }
    });
  });
}

module.exports = { isAvailable, xlsxToPdf, SOFFICE_BIN };
