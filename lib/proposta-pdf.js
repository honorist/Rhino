/**
 * @file Gerador de PDF da proposta — converte HTML (proposta-html.js) via puppeteer.
 *
 * Puppeteer puxa Chromium ao instalar (npm install puppeteer). Para servidores
 * com limite de disco, pode-se usar puppeteer-core + chrome instalado no sistema.
 *
 * Imagens via `<img src="/api/...">` precisam de origin absoluta — quando rodando
 * em servidor o handler injeta um <base href> dinâmico antes de page.setContent.
 */
let puppeteerLib = null;
try { puppeteerLib = require('puppeteer'); } catch { /* lib não instalada */ }

const { renderHtml } = require('./proposta-html');

function isPdfAvailable() { return !!puppeteerLib; }

/**
 * Gera Buffer PDF a partir da proposta.
 *
 * Para que <img src="/api/propostas/.../anexos/..."> resolva sem depender de
 * servidor HTTP, fazemos inline-replace dessas URLs por data: URIs antes da
 * renderização (passamos a propria proposta com `.anexos[].data` já carregado).
 *
 * @param {object} proposta  Proposta com anexos COM data binário (Buffer).
 * @returns {Promise<Buffer>}
 */
async function gerarPdf(proposta) {
  if (!puppeteerLib) throw new Error('Lib `puppeteer` não instalada. Rode `npm install puppeteer` no servidor.');

  // Embeda imagens inline (data: URI) substituindo as URLs no HTML
  let html = renderHtml(proposta);
  if (Array.isArray(proposta.anexos)) {
    for (const a of proposta.anexos) {
      if (a.tipo === 'imagem' && a.data) {
        const uri = `/api/propostas/${proposta.id}/anexos/${a.id}`;
        const dataUri = `data:${a.mimeType || 'image/jpeg'};base64,${a.data.toString('base64')}`;
        html = html.split(uri).join(dataUri);
      }
    }
  }

  const browser = await puppeteerLib.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = { gerarPdf, isPdfAvailable };
