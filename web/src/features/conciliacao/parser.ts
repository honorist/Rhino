/**
 * Parsers de extrato bancário — OFX e CSV. Lógica pura, porte de
 * `_parseOFX` / `_parseCSV` de js/views/Conciliacao.js.
 */
import type { BankTransaction } from './types';

/** Decide se o conteúdo é OFX pelo nome do arquivo ou por marcadores. */
export function isOfxContent(fileName: string, text: string): boolean {
  const name = fileName.toLowerCase();
  return (
    name.endsWith('.ofx') ||
    text.includes('<OFX') ||
    text.includes('<STMTTRN') ||
    text.includes('<ofx') ||
    text.includes('<stmttrn')
  );
}

/** Extrai um campo OFX de um bloco de transação. */
function ofxField(block: string, field: string): string | null {
  const re = new RegExp(`<${field}>([^\\r\\n<]*)`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** Converte data OFX (20240115120000[-3:BRT]) para YYYY-MM-DD. */
function ofxDateToISO(raw: string): string {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return raw || '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** Faz o parse de um extrato OFX. */
export function parseOFX(text: string): BankTransaction[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const results: BankTransaction[] = [];
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRe.exec(normalized)) !== null) {
    const block = blockMatch[1];
    const fitid = ofxField(block, 'FITID') || `tx-${results.length}`;
    const memo =
      ofxField(block, 'MEMO') || ofxField(block, 'NAME') || '';
    const dtRaw = ofxField(block, 'DTPOSTED') || '';
    const amtRaw = ofxField(block, 'TRNAMT') || '0';
    const amount = Number.parseFloat(amtRaw.replace(',', '.')) || 0;

    results.push({
      id: `ofx-${fitid}`,
      date: ofxDateToISO(dtRaw),
      value: Math.abs(amount),
      type: amount < 0 ? 'saida' : 'entrada',
      description: memo.trim(),
    });
  }
  return results;
}

const DATE_DDMM = /^\d{2}\/\d{2}\/\d{4}$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Tenta converter um número em formato brasileiro; retorna NaN se inválido. */
function parseBrNumber(cell: string): number {
  return Number.parseFloat(cell.replace(/\./g, '').replace(',', '.'));
}

/** Faz o parse de um extrato CSV (separador `;` ou `,`, número BR). */
export function parseCSV(text: string): BankTransaction[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const sep =
    lines[0].includes(';') || !lines[0].includes(',') ? ';' : ',';

  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const col0 = (lines[i].split(sep)[0] || '').trim().replace(/"/g, '');
    if (DATE_DDMM.test(col0) || DATE_ISO.test(col0)) {
      dataStart = i;
      break;
    }
  }
  if (dataStart === -1) dataStart = lines.length > 1 ? 1 : 0;

  const results: BankTransaction[] = [];
  for (let j = dataStart; j < lines.length; j++) {
    const parts = lines[j]
      .split(sep)
      .map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) continue;

    const rawDate = parts[0];
    let dateStr: string;
    if (DATE_DDMM.test(rawDate)) {
      const [d, m, y] = rawDate.split('/');
      dateStr = `${y}-${m}-${d}`;
    } else if (DATE_ISO.test(rawDate)) {
      dateStr = rawDate;
    } else {
      continue;
    }

    let amount = 0;
    let description = '';
    let foundValue = false;
    for (let k = 1; k < parts.length; k++) {
      const cell = parts[k];
      const n = parseBrNumber(cell);
      if (!Number.isNaN(n) && cell !== '' && !foundValue) {
        amount = n;
        foundValue = true;
      } else if (cell !== '' && Number.isNaN(parseBrNumber(cell))) {
        if (!description) description = cell;
      }
    }
    if (!foundValue) continue;

    results.push({
      id: `csv-${j}-${dateStr}`,
      date: dateStr,
      value: Math.abs(amount),
      type: amount < 0 ? 'saida' : 'entrada',
      description,
    });
  }
  return results;
}

/** Faz o parse de um extrato detectando OFX ou CSV pelo conteúdo. */
export function parseExtrato(fileName: string, text: string): BankTransaction[] {
  return isOfxContent(fileName, text) ? parseOFX(text) : parseCSV(text);
}
