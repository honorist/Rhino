// Editor de texto rico compartilhado (Objetivo/Saudação/Observações/itens de
// Escopo/Obrigações da Proposta) — wrapper fino sobre o Jodit (vendorizado em
// js/lib/vendor/jodit.fat.min.js, carregado sob demanda via RhinoLazy).
window.RhinoRichText = (function () {
  const TOOLBAR = [
    'bold', 'italic', 'underline', 'brush', '|',
    'ul', 'ol', '|',
    'table', 'image', '|',
    'undo', 'redo',
  ];

  // mount(el, opts) → Promise<{getValue, setValue, destroy}>
  //   opts.value          — HTML inicial
  //   opts.onChange(html) — chamado a cada edição
  //   opts.onBlur(html)   — chamado ao perder foco (flush imediato — usado por
  //                         listas que fazem debounce próprio e precisam
  //                         garantir que a digitação não se perca se o usuário
  //                         clicar em outro botão logo em seguida)
  //   opts.placeholder
  //   opts.uploadUrl      — endpoint de upload (POST multipart), ex. /api/propostas/:id/anexos
  //   opts.uploadFields    — campos extras do form (ex. {tipo:'imagem', secao:'inline'})
  //   opts.buildImageUrl(anexoId) — monta a URL final da imagem a partir do id devolvido pelo upload
  async function mount(el, opts = {}) {
    const {
      value = '',
      onChange,
      onBlur,
      placeholder = '',
      uploadUrl,
      uploadFields = {},
      buildImageUrl,
    } = opts;

    await RhinoLazy.ensure('jodit');

    const config = {
      language: 'pt_br',
      toolbarAdaptive: false,
      height: 220,
      placeholder,
      buttons: TOOLBAR,
    };

    if (uploadUrl && buildImageUrl) {
      config.uploader = {
        url: uploadUrl,
        filesVariableName: () => 'file',
        prepareData(formData) {
          Object.entries(uploadFields).forEach(([k, v]) => formData.append(k, v));
          return formData;
        },
        isSuccess: (resp) => !!(resp && resp.anexoId),
        process: (resp) => resp,
        defaultHandlerSuccess(resp) {
          if (resp && resp.anexoId) {
            this.selection.insertImage(buildImageUrl(resp.anexoId), null, 300);
          }
        },
        error(e) {
          if (window.showToast) window.showToast('Erro ao enviar imagem: ' + (e?.message || ''), 'error');
        },
      };
    }

    const editor = Jodit.make(el, config);
    editor.value = value;
    if (onChange) {
      editor.events.on('change', () => onChange(editor.value));
    }
    if (onBlur) {
      editor.events.on('blur', () => onBlur(editor.value));
    }

    return {
      getValue: () => editor.value,
      setValue: (html) => { editor.value = html || ''; },
      destroy: () => editor.destruct(),
    };
  }

  return { mount };
})();
