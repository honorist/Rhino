# CLAUDE.md — Rhino

## Changelog obrigatório a cada bump de versão

Sempre que houver bump de versão (via `node scripts/bump-version.js` ou manualmente), **antes do commit**:

1. Escrever uma entrada no topo de `changelog.json["entries"]`:
   ```json
   {
     "version": "X.Y.Z",
     "date": "YYYY-MM-DD",
     "summary": "Uma linha em linguagem de usuário final (máx ~80 chars)",
     "changes": ["Mudança 1 visível para o usuário", "Mudança 2..."]
   }
   ```
2. Texto em **linguagem de usuário final** — o que o usuário vê/ganha, não detalhes técnicos.
3. De 1 a 5 itens em `changes`. Agrupar mudanças relacionadas.
4. `package.json["version"]` e a entrada mais recente do changelog devem ter o mesmo número.

O `bump-version.js` atualizado já faz isso automaticamente:
```bash
node scripts/bump-version.js patch "Resumo em linguagem leiga"
```

> Regra: sem changelog atualizado = não commitar o bump.
