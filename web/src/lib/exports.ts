/**
 * Barrel das funções de export — espelha window.RhinoExport do antigo.
 * Mantém a superfície aproximada (csv/tablePdf/fmtBRL/fmtDate) mas reusa
 * helpers já existentes em lib/.
 */
export { downloadCsv } from './downloadCsv';
export { formatBRL as fmtBRL } from './format';
export { formatDateBR as fmtDate } from './formatDate';
export {
  buildTablePdfBody,
  exportTablePdf,
  type TablePdfColumn,
  type TablePdfOptions,
} from './exportTablePdf';
