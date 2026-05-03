window.Conciliacao = {
  _transactions: [],
  _decisions: {},

  // ─── Entry Point ─────────────────────────────────────────────────────────────

  async render() {
    var app = document.getElementById('app');
    if (!app) return;

    try {
      await Store.loadAll();
    } catch (e) {
      console.error('Conciliacao: Store.loadAll failed', e);
    }

    if (this._transactions.length === 0) {
      app.innerHTML = this._renderUploadScreen();
      this._bindUploadEvents();
    } else {
      app.innerHTML = this._renderMatchingScreen();
      this._bindMatchingEvents();
    }
  },

  // ─── Upload Screen ────────────────────────────────────────────────────────────

  _renderUploadScreen: function() {
    return (
      '<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;padding:var(--sp-lg);">' +
        '<div class="card" style="max-width:520px;width:100%;padding:var(--sp-xl);">' +
          '<div class="page-header" style="margin-bottom:var(--sp-lg);padding-bottom:0;border-bottom:none;">' +
            '<div>' +
              '<h1 class="page-title">Conciliação Bancária</h1>' +
              '<p class="page-subtitle">Importe seu extrato bancário e reconcilie com contas a pagar</p>' +
            '</div>' +
          '</div>' +
          '<div id="dropZone" style="' +
            'border:2.5px dashed var(--color-border);' +
            'border-radius:12px;' +
            'padding:var(--sp-xl) var(--sp-lg);' +
            'text-align:center;' +
            'cursor:pointer;' +
            'transition:border-color .18s,background .18s;' +
            'background:var(--color-bg);' +
          '">' +
            '<div style="font-size:42px;margin-bottom:var(--sp-md);">🏦</div>' +
            '<p style="font-size:16px;font-weight:600;margin-bottom:var(--sp-sm);color:var(--color-text-muted);">Arraste seu extrato aqui</p>' +
            '<p style="font-size:13px;color:var(--color-text-muted);margin-bottom:var(--sp-md);">ou clique para selecionar</p>' +
            '<p style="font-size:12px;color:var(--color-text-muted);opacity:.7;">Aceita: .ofx · .csv · .txt</p>' +
            '<input type="file" id="fileInput" accept=".ofx,.csv,.txt,.OFX,.CSV,.TXT" style="display:none;">' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  },

  _bindUploadEvents: function() {
    var self = this;
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', function() {
      fileInput.click();
    });

    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--color-primary)';
      dropZone.style.background = 'var(--color-surface)';
    });

    dropZone.addEventListener('dragleave', function() {
      dropZone.style.borderColor = 'var(--color-border)';
      dropZone.style.background = 'var(--color-bg)';
    });

    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--color-border)';
      dropZone.style.background = 'var(--color-bg)';
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) self._processFile(file);
    });

    fileInput.addEventListener('change', function() {
      var file = fileInput.files && fileInput.files[0];
      if (file) self._processFile(file);
    });
  },

  // ─── File Processing ──────────────────────────────────────────────────────────

  _processFile: function(file) {
    var self = this;
    var reader = new FileReader();

    reader.onload = function(e) {
      var text = e.target.result;
      var transactions;

      var name = (file.name || '').toLowerCase();
      var isOfx = name.endsWith('.ofx') ||
                  text.indexOf('<OFX') !== -1 ||
                  text.indexOf('<STMTTRN') !== -1 ||
                  text.indexOf('<ofx') !== -1 ||
                  text.indexOf('<stmttrn') !== -1;

      try {
        transactions = isOfx ? self._parseOFX(text) : self._parseCSV(text);
      } catch (err) {
        showToast('Erro ao processar arquivo: ' + err.message, 'error');
        return;
      }

      if (!transactions || transactions.length === 0) {
        showToast('Nenhuma transação encontrada no arquivo.', 'warning');
        return;
      }

      self._transactions = transactions;

      // Initialize decisions and run auto-matching
      self._decisions = {};
      for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var matches = self._findMatches(tx);
        self._decisions[tx.id] = {
          action: 'pending',
          contaPagarId: null,
          topMatch: matches.length > 0 ? matches[0] : null,
          allMatches: matches
        };
      }

      showToast(transactions.length + ' transação(ões) encontrada(s).', 'success');
      self.render();
    };

    reader.onerror = function() {
      showToast('Erro ao ler o arquivo.', 'error');
    };

    reader.readAsText(file, 'UTF-8');
  },

  // ─── OFX Parser ──────────────────────────────────────────────────────────────

  _parseOFX: function(text) {
    var results = [];
    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Extract all STMTTRN blocks (case-insensitive)
    var blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    var blockMatch;

    while ((blockMatch = blockRe.exec(text)) !== null) {
      var block = blockMatch[1];

      var fitid  = this._ofxField(block, 'FITID')  || ('tx-' + results.length);
      var memo   = this._ofxField(block, 'MEMO')   || this._ofxField(block, 'NAME') || '';
      var dtRaw  = this._ofxField(block, 'DTPOSTED') || '';
      var amtRaw = this._ofxField(block, 'TRNAMT')  || '0';

      var dateStr = this._ofxDateToISO(dtRaw);
      var amount  = parseFloat(amtRaw.replace(',', '.')) || 0;

      results.push({
        id:          'ofx-' + fitid,
        date:        dateStr,
        value:       Math.abs(amount),
        type:        amount < 0 ? 'saida' : 'entrada',
        description: memo.trim()
      });
    }

    return results;
  },

  _ofxField: function(block, field) {
    var re = new RegExp('<' + field + '>([^\\r\\n<]*)', 'i');
    var m = block.match(re);
    return m ? m[1].trim() : null;
  },

  _ofxDateToISO: function(raw) {
    // Format: 20240115120000[-3:BRT] — take first 8 chars
    var digits = (raw || '').replace(/[^0-9]/g, '');
    if (digits.length < 8) return raw || '';
    var yyyy = digits.slice(0, 4);
    var mm   = digits.slice(4, 6);
    var dd   = digits.slice(6, 8);
    return yyyy + '-' + mm + '-' + dd;
  },

  // ─── CSV Parser ──────────────────────────────────────────────────────────────

  _parseCSV: function(text) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });

    if (lines.length === 0) return [];

    // Detect separator
    var sep = ';';
    var firstLine = lines[0];
    if (firstLine.indexOf(';') === -1 && firstLine.indexOf(',') !== -1) sep = ',';

    // Find first data line (where col 0 looks like a date)
    var dateDDMM  = /^\d{2}\/\d{2}\/\d{4}$/;
    var dateISO   = /^\d{4}-\d{2}-\d{2}$/;
    var dataStart = -1;

    for (var i = 0; i < lines.length; i++) {
      var cols = lines[i].split(sep);
      var col0 = (cols[0] || '').trim().replace(/"/g, '');
      if (dateDDMM.test(col0) || dateISO.test(col0)) {
        dataStart = i;
        break;
      }
    }

    if (dataStart === -1) {
      // Fallback: skip one header line
      dataStart = lines.length > 1 ? 1 : 0;
    }

    var results = [];
    for (var j = dataStart; j < lines.length; j++) {
      var parts = lines[j].split(sep).map(function(p) { return p.trim().replace(/^"|"$/g, ''); });
      if (parts.length < 2) continue;

      var rawDate = parts[0];
      var dateStr = '';
      if (dateDDMM.test(rawDate)) {
        // DD/MM/YYYY -> YYYY-MM-DD
        var dp = rawDate.split('/');
        dateStr = dp[2] + '-' + dp[1] + '-' + dp[0];
      } else if (dateISO.test(rawDate)) {
        dateStr = rawDate;
      } else {
        continue; // skip non-date rows
      }

      // Find the numeric value column and description column
      var amount = 0;
      var description = '';
      var foundValue = false;

      for (var k = 1; k < parts.length; k++) {
        var cell = parts[k];
        // Brazilian number: may use comma as decimal, period as thousands
        var numStr = cell.replace(/\./g, '').replace(',', '.');
        var num = parseFloat(numStr);
        if (!isNaN(num) && cell !== '' && !foundValue) {
          amount = num;
          foundValue = true;
        } else if (cell !== '' && isNaN(parseFloat(cell.replace(/\./g, '').replace(',', '.')))) {
          // Non-numeric, non-empty — treat as description (take first such column)
          if (!description) description = cell;
        }
      }

      if (!foundValue) continue;

      results.push({
        id:          'csv-' + j + '-' + dateStr,
        date:        dateStr,
        value:       Math.abs(amount),
        type:        amount < 0 ? 'saida' : 'entrada',
        description: description
      });
    }

    return results;
  },

  // ─── Matching Logic ───────────────────────────────────────────────────────────

  _findMatches: function(tx) {
    var contas = (Store.state.contas_pagar || []).filter(function(c) {
      return c.status !== 'paga' && c.status !== 'pago';
    });

    var scored = [];

    for (var i = 0; i < contas.length; i++) {
      var conta = contas[i];
      var score = 0;

      // Value scoring
      var contaValor = parseFloat(conta.valor) || 0;
      var txValue    = parseFloat(tx.value)    || 0;
      var diff       = Math.abs(txValue - contaValor);
      var pct        = contaValor > 0 ? diff / contaValor : 1;

      if (diff < 0.02) {
        score += 55;
      } else if (pct <= 0.02) {
        score += 35;
      } else if (pct <= 0.10) {
        score += 10;
      } else {
        // Value too far off — skip
        continue;
      }

      // Date scoring
      if (tx.date && conta.dataVencimento) {
        var txMs    = new Date(tx.date + 'T12:00:00').getTime();
        var contaMs = new Date(conta.dataVencimento + 'T12:00:00').getTime();
        var daysDiff = Math.abs(Math.round((txMs - contaMs) / 86400000));

        if (daysDiff === 0)      score += 25;
        else if (daysDiff <= 3)  score += 18;
        else if (daysDiff <= 7)  score += 10;
        else if (daysDiff <= 15) score += 5;
      }

      // Description fuzzy scoring
      var txTokens    = this._tokenize(tx.description || '');
      var contaTokens = this._tokenize(conta.descricao || conta.description || conta.nome || '');
      var matchCount  = 0;

      for (var ti = 0; ti < txTokens.length; ti++) {
        for (var ci = 0; ci < contaTokens.length; ci++) {
          if (txTokens[ti] === contaTokens[ci]) {
            matchCount++;
            break;
          }
        }
      }

      score += Math.min(matchCount * 8, 20);

      scored.push({ item: conta, score: score, type: 'conta_pagar' });
    }

    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, 3);
  },

  _tokenize: function(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9À-ÿ\s]/g, ' ')
      .split(/\s+/)
      .filter(function(t) { return t.length > 3; });
  },

  // ─── Matching Screen ──────────────────────────────────────────────────────────

  _renderMatchingScreen: function() {
    var self      = this;
    var total     = this._transactions.length;
    var confirmed = 0;
    var skipped   = 0;
    var pending   = 0;

    for (var id in this._decisions) {
      if (!Object.prototype.hasOwnProperty.call(this._decisions, id)) continue;
      var a = this._decisions[id].action;
      if (a === 'confirm') confirmed++;
      else if (a === 'skip') skipped++;
      else pending++;
    }

    var rows = '';
    for (var i = 0; i < this._transactions.length; i++) {
      rows += this._renderTxRow(this._transactions[i]);
    }

    return (
      '<div class="page-header">' +
        '<div>' +
          '<h1 class="page-title">Conciliação Bancária</h1>' +
          '<p class="page-subtitle">' +
            total + ' transaç' + (total === 1 ? 'ão' : 'ões') +
            ' · ' + confirmed + ' confirmada' + (confirmed === 1 ? '' : 's') +
          '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn btn-secondary btn-sm" id="btnNovoArquivo">&#8592; Novo arquivo</button>' +
          '<button class="btn btn-primary" id="btnLancarConfirmados"' + (confirmed === 0 ? ' disabled' : '') + '>' +
            '&#10003; Lancar ' + confirmed + ' confirmado' + (confirmed === 1 ? '' : 's') +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div style="display:flex;gap:var(--sp-md);flex-wrap:wrap;margin-bottom:var(--sp-lg);">' +
        this._statPill('Total', total, 'var(--color-text-muted)') +
        this._statPill('Confirmadas', confirmed, 'var(--color-success)') +
        this._statPill('Pendentes', pending, 'var(--color-warning)') +
        this._statPill('Ignoradas', skipped, 'var(--color-text-muted)') +
      '</div>' +

      '<div id="txListContainer">' +
        rows +
      '</div>'
    );
  },

  _statPill: function(label, count, color) {
    return (
      '<div class="card" style="padding:var(--sp-sm) var(--sp-md);display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:18px;font-weight:700;color:' + color + ';">' + count + '</span>' +
        '<span style="font-size:13px;color:var(--color-text-muted);">' + escapeHtml(label) + '</span>' +
      '</div>'
    );
  },

  _renderTxRow: function(tx) {
    var decision  = this._decisions[tx.id] || { action: 'pending', contaPagarId: null, allMatches: [] };
    var action    = decision.action;
    var matches   = decision.allMatches || [];

    // Border color by state
    var borderColor;
    if (action === 'confirm')         borderColor = 'var(--color-success)';
    else if (action === 'skip')       borderColor = 'var(--color-text-muted)';
    else if (matches.length > 0)      borderColor = 'var(--color-warning)';
    else                              borderColor = 'var(--color-border)';

    var valueColor = tx.type === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)';
    var valueSign  = tx.type === 'entrada' ? '+' : '-';

    var dateFormatted = tx.date
      ? tx.date.split('-').reverse().join('/')
      : '';

    // Left panel
    var leftPanel = (
      '<div style="min-width:180px;max-width:220px;">' +
        '<div style="font-size:13px;color:var(--color-text-muted);margin-bottom:2px;">' + escapeHtml(dateFormatted) + '</div>' +
        '<div style="font-size:17px;font-weight:700;color:' + valueColor + ';margin-bottom:4px;">' +
          valueSign + Store.formatBRL(tx.value) +
        '</div>' +
        '<div style="font-size:13px;color:var(--color-text-muted);word-break:break-word;">' + escapeHtml(tx.description || '') + '</div>' +
      '</div>'
    );

    // Center panel: matches
    var centerPanel;
    if (action === 'confirm' && decision.contaPagarId) {
      var linkedConta = (Store.state.contas_pagar || []).find(function(c) {
        return c.id === decision.contaPagarId;
      });
      centerPanel = (
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--color-success);margin-bottom:4px;">&#10003; Vinculada</div>' +
          (linkedConta
            ? '<div style="font-size:13px;color:var(--color-text-muted);">' +
                escapeHtml(linkedConta.descricao || linkedConta.nome || '') + ' · ' +
                Store.formatBRL(linkedConta.valor) +
              '</div>'
            : '<div style="font-size:13px;color:var(--color-text-muted);">Lançar sem vincular</div>'
          ) +
        '</div>'
      );
    } else if (action === 'confirm') {
      centerPanel = (
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--color-success);margin-bottom:4px;">&#10003; Confirmada (sem vinculo)</div>' +
        '</div>'
      );
    } else if (action === 'skip') {
      centerPanel = (
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;color:var(--color-text-muted);">Ignorada</div>' +
        '</div>'
      );
    } else if (matches.length === 0) {
      centerPanel = (
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;color:var(--color-text-muted);margin-bottom:6px;">Nenhuma conta correspondente</div>' +
          '<button class="btn btn-secondary btn-sm" data-tx-action="nolink" data-tx-id="' + escapeHtml(tx.id) + '">' +
            'Lancar sem vincular' +
          '</button>' +
        '</div>'
      );
    } else {
      var matchItems = '';
      for (var m = 0; m < matches.length; m++) {
        var match     = matches[m];
        var conta     = match.item;
        var scoreVal  = Math.min(100, match.score);
        var vcto      = conta.dataVencimento
          ? conta.dataVencimento.split('-').reverse().join('/')
          : '';

        matchItems += (
          '<div style="' +
            'border:1px solid var(--color-border);' +
            'border-radius:8px;' +
            'padding:var(--sp-sm) var(--sp-md);' +
            'margin-bottom:6px;' +
            'background:var(--color-bg);' +
          '">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:13px;font-weight:600;margin-bottom:2px;">' + escapeHtml(conta.descricao || conta.nome || '') + '</div>' +
                '<div style="font-size:12px;color:var(--color-text-muted);">' +
                  'Vcto: ' + escapeHtml(vcto) +
                  ' · ' + Store.formatBRL(parseFloat(conta.valor) || 0) +
                  ' · <span style="color:var(--color-primary);font-weight:600;">' + scoreVal + '%</span>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;gap:6px;flex-shrink:0;">' +
                '<button class="btn btn-primary btn-sm" ' +
                  'data-tx-action="confirm" ' +
                  'data-tx-id="' + escapeHtml(tx.id) + '" ' +
                  'data-conta-id="' + escapeHtml(String(conta.id)) + '">' +
                  '&#10003; Confirmar' +
                '</button>' +
                '<button class="btn btn-secondary btn-sm" ' +
                  'data-tx-action="nolink" ' +
                  'data-tx-id="' + escapeHtml(tx.id) + '">' +
                  'Sem vinculo' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }

      centerPanel = '<div style="flex:1;min-width:0;">' + matchItems + '</div>';
    }

    // Right panel
    var rightPanel;
    if (action === 'pending') {
      rightPanel = (
        '<div style="text-align:right;flex-shrink:0;">' +
          '<button class="btn btn-secondary btn-sm" data-tx-action="skip" data-tx-id="' + escapeHtml(tx.id) + '">' +
            '&#9197; Ignorar' +
          '</button>' +
        '</div>'
      );
    } else {
      rightPanel = (
        '<div style="text-align:right;flex-shrink:0;">' +
          '<button class="btn btn-secondary btn-sm" data-tx-action="undo" data-tx-id="' + escapeHtml(tx.id) + '">' +
            '&#8617; Desfazer' +
          '</button>' +
        '</div>'
      );
    }

    return (
      '<div id="txrow-' + escapeHtml(tx.id) + '" style="' +
        'border-left:4px solid ' + borderColor + ';' +
        'background:var(--color-surface);' +
        'border-radius:0 8px 8px 0;' +
        'padding:var(--sp-md);' +
        'margin-bottom:var(--sp-md);' +
        'display:flex;' +
        'gap:var(--sp-md);' +
        'align-items:flex-start;' +
        'flex-wrap:wrap;' +
        'transition:border-color .18s;' +
      '">' +
        leftPanel +
        centerPanel +
        rightPanel +
      '</div>'
    );
  },

  // ─── Matching Event Delegation ────────────────────────────────────────────────

  _bindMatchingEvents: function() {
    var self = this;

    var btnNovo = document.getElementById('btnNovoArquivo');
    if (btnNovo) {
      btnNovo.addEventListener('click', function() {
        self._transactions = [];
        self._decisions    = {};
        self.render();
      });
    }

    var btnLancar = document.getElementById('btnLancarConfirmados');
    if (btnLancar) {
      btnLancar.addEventListener('click', function() {
        self._confirmAll();
      });
    }

    var container = document.getElementById('txListContainer');
    if (container) {
      container.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-tx-action]');
        if (!btn) return;

        var action  = btn.getAttribute('data-tx-action');
        var txId    = btn.getAttribute('data-tx-id');
        var contaId = btn.getAttribute('data-conta-id') || null;

        if (!txId || !self._decisions[txId]) return;

        if (action === 'confirm') {
          self._decisions[txId].action      = 'confirm';
          self._decisions[txId].contaPagarId = contaId;
        } else if (action === 'nolink') {
          self._decisions[txId].action      = 'confirm';
          self._decisions[txId].contaPagarId = null;
        } else if (action === 'skip') {
          self._decisions[txId].action      = 'skip';
          self._decisions[txId].contaPagarId = null;
        } else if (action === 'undo') {
          self._decisions[txId].action      = 'pending';
          self._decisions[txId].contaPagarId = null;
        }

        self._updateRow(txId);
        self._updateHeader();
      });
    }
  },

  _updateRow: function(txId) {
    var tx = null;
    for (var i = 0; i < this._transactions.length; i++) {
      if (this._transactions[i].id === txId) {
        tx = this._transactions[i];
        break;
      }
    }
    if (!tx) return;

    var rowEl = document.getElementById('txrow-' + txId);
    if (!rowEl) return;

    var newHtml = this._renderTxRow(tx);
    var tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    var newRow = tmp.firstChild;
    if (newRow) rowEl.parentNode.replaceChild(newRow, rowEl);
  },

  _updateHeader: function() {
    var total     = this._transactions.length;
    var confirmed = 0;
    var skipped   = 0;
    var pending   = 0;

    for (var id in this._decisions) {
      if (!Object.prototype.hasOwnProperty.call(this._decisions, id)) continue;
      var a = this._decisions[id].action;
      if (a === 'confirm') confirmed++;
      else if (a === 'skip') skipped++;
      else pending++;
    }

    var subtitle = document.querySelector('.page-subtitle');
    if (subtitle) {
      subtitle.textContent =
        total + ' transaç' + (total === 1 ? 'ão' : 'ões') +
        ' · ' + confirmed + ' confirmada' + (confirmed === 1 ? '' : 's');
    }

    var btnLancar = document.getElementById('btnLancarConfirmados');
    if (btnLancar) {
      btnLancar.disabled = confirmed === 0;
      btnLancar.textContent =
        '✓ Lancar ' + confirmed + ' confirmado' + (confirmed === 1 ? '' : 's');
    }

    // Update stat pills
    var pills = document.querySelectorAll('.card span[style*="font-size:18px"]');
    var pillLabels = document.querySelectorAll('.card span[style*="font-size:13px"]');
    // Simpler: re-render stat bar in place
    var statBar = document.querySelector('#txListContainer');
    if (!statBar) return;

    var pillRow = statBar.previousElementSibling;
    if (pillRow && pillRow.style && pillRow.style.display === 'flex') {
      pillRow.innerHTML =
        this._statPill('Total', total, 'var(--color-text-muted)') +
        this._statPill('Confirmadas', confirmed, 'var(--color-success)') +
        this._statPill('Pendentes', pending, 'var(--color-warning)') +
        this._statPill('Ignoradas', skipped, 'var(--color-text-muted)');
    }
  },

  // ─── Confirm All ─────────────────────────────────────────────────────────────

  _confirmAll: async function() {
    var self       = this;
    var toProcess  = [];

    for (var txId in this._decisions) {
      if (!Object.prototype.hasOwnProperty.call(this._decisions, txId)) continue;
      if (this._decisions[txId].action === 'confirm') {
        toProcess.push(txId);
      }
    }

    if (toProcess.length === 0) return;

    var btnLancar = document.getElementById('btnLancarConfirmados');
    if (btnLancar) {
      btnLancar.disabled     = true;
      btnLancar.textContent  = 'Processando...';
    }

    var okCount  = 0;
    var errCount = 0;

    for (var i = 0; i < toProcess.length; i++) {
      var txId    = toProcess[i];
      var decision = this._decisions[txId];

      var tx = null;
      for (var j = 0; j < this._transactions.length; j++) {
        if (this._transactions[j].id === txId) {
          tx = this._transactions[j];
          break;
        }
      }
      if (!tx) continue;

      // Create caixa entry
      try {
        await Store.createCaixaEntry({
          type:        tx.type === 'entrada' ? 'entrada' : 'saida',
          description: tx.description || 'Conciliacao',
          value:       tx.value,
          date:        tx.date,
          category:    'conciliacao',
          notes:       'Conciliacao bancaria'
        });
        okCount++;
      } catch (err) {
        console.error('Conciliacao: createCaixaEntry failed for', txId, err);
        errCount++;
        continue;
      }

      // Link to conta a pagar if chosen
      if (decision.contaPagarId) {
        try {
          await Store.pagarConta(decision.contaPagarId, {
            dataPagamento:  tx.date,
            valorPago:      tx.value,
            formaPagamento: 'transferencia'
          });
        } catch (err) {
          console.error('Conciliacao: pagarConta failed for conta', decision.contaPagarId, err);
          // Non-fatal: caixa entry already created
        }
      }
    }

    if (okCount > 0) {
      showToast(okCount + ' lancamento(s) registrado(s) com sucesso.', 'success');
    }
    if (errCount > 0) {
      showToast(errCount + ' lancamento(s) falharam. Verifique o console.', 'error');
    }

    if (okCount > 0) {
      // Remove processed transactions from state
      var remainingTxIds = [];
      for (var k = 0; k < this._transactions.length; k++) {
        var id = this._transactions[k].id;
        if (this._decisions[id] && this._decisions[id].action !== 'confirm') {
          remainingTxIds.push(this._transactions[k]);
        }
      }

      if (remainingTxIds.length === 0) {
        this._transactions = [];
        this._decisions    = {};
      } else {
        // Keep non-confirmed
        var newDecisions = {};
        for (var n = 0; n < remainingTxIds.length; n++) {
          newDecisions[remainingTxIds[n].id] = this._decisions[remainingTxIds[n].id];
        }
        this._transactions = remainingTxIds;
        this._decisions    = newDecisions;
      }

      try { await Store.loadAll(); } catch (e) { /* silent */ }
      this.render();
    } else {
      if (btnLancar) {
        btnLancar.disabled    = false;
        btnLancar.textContent = '✓ Lancar ' + toProcess.length + ' confirmado' + (toProcess.length === 1 ? '' : 's');
      }
    }
  }
};
