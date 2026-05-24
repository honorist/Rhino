/**
 * Gera e baixa um arquivo CSV no navegador. Porte do helper `_downloadCsv`
 * espalhado pelas views do app antigo.
 *
 * - Separador `;` (padrão pt-BR para o Excel).
 * - Células com `"`, `;`, `,` ou quebra de linha são escapadas entre aspas.
 * - Prefixo BOM (U+FEFF) para o Excel reconhecer UTF-8.
 */
const BOM = String.fromCharCode(0xfeff);

export function downloadCsv(
  filename: string,
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): void {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          return /[",;\n]/.test(text)
            ? `"${text.replace(/"/g, '""')}"`
            : text;
        })
        .join(';'),
    )
    .join('\r\n');

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
