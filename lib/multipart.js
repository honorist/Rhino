'use strict';
/**
 * @file multipart/form-data — parser nativo (sem dependências) + validação de
 * imagem por magic-bytes. Compartilhado por TODOS os uploads do sistema
 * (fotos e assinaturas de RDO, arquivos de documentos de recurso, anexos de
 * proposta, logos de case). Centraliza as defesas de segurança A-05/A-06:
 *   - A-05: rejeita conteúdo cujo magic-number não bate com o tipo declarado.
 *   - A-06: extensão derivada do MIME validado, nunca do filename do cliente.
 */

/**
 * Parser multipart/form-data simples. Recebe o corpo bruto (Buffer) e o boundary
 * e devolve as partes como objetos.
 *
 * @param {Buffer} buffer  corpo bruto da requisição
 * @param {string} boundary  boundary extraído do Content-Type
 * @returns {Array<{name:string, filename:(string|null), contentType:(string|null), data:Buffer}>}
 */
function parseMultipart(buffer, boundary) {
  const boundaryBytes = Buffer.from('--' + boundary);
  const parts = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(boundaryBytes, offset);
    if (start === -1) break;
    const end = buffer.indexOf(boundaryBytes, start + boundaryBytes.length);
    if (end === -1) break;
    const section = buffer.slice(start + boundaryBytes.length, end);
    // section começa com \r\n headers \r\n\r\n content \r\n
    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd === -1) { offset = end; continue; }
    const headersRaw = section.slice(2, headerEnd).toString('utf8');
    const content = section.slice(headerEnd + 4, section.length - 2);
    // Extrai name e filename com regexes separados (evita confusão de backtracking)
    const nameMatch = headersRaw.match(/\bname="([^"]*)"/i);
    const fileMatch = headersRaw.match(/\bfilename="([^"]*)"/i);
    const typeMatch = headersRaw.match(/Content-Type:\s*([^\r\n]+)/i);
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: fileMatch ? fileMatch[1] : null,
        contentType: typeMatch ? typeMatch[1].trim() : null,
        data: content,
      });
    }
    offset = end;
  }
  return parts;
}

/** MIMEs de imagem aceitos em qualquer upload de imagem do sistema. */
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Content-Type → extensão segura. Evita que a extensão venha do nome de arquivo
 * do cliente (ex: `foto.jpg.svg` resultaria em SVG XSS). Fixes A-05 e A-06.
 */
const IMAGE_EXT_FROM_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Verifica que os primeiros bytes de um Buffer correspondem a um magic-number de
 * imagem aceito (JPEG `FF D8`, PNG `89 50 4E 47`, RIFF/WEBP). Defesa contra
 * payloads disfarçados de imagem (ex: PHP/HTML com extensão e header forjados).
 *
 * @param {Buffer} buf
 * @returns {boolean}
 */
function isAllowedImageMagic(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xFF && buf[1] === 0xD8) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
  // RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  return false;
}

module.exports = { parseMultipart, isAllowedImageMagic, IMAGE_MIMES, IMAGE_EXT_FROM_MIME };
