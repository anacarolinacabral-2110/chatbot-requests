# Chatbot de Demandas Machine — Backend

Substitui a versão em artifact do Claude por um site próprio, hospedável no
seu domínio, que **não exige login no Claude** e **não depende do Monday MCP**.

## O que mudou em relação ao artifact

| | Artifact (Claude.ai) | Este backend |
|---|---|---|
| Hospedagem | Link do Claude.ai | Seu domínio/Vercel |
| Login do cliente | Sessão do Claude | Nenhum |
| Chamada à Anthropic | Direto do navegador, sem chave | Via seu servidor, com `ANTHROPIC_API_KEY` |
| Ação no Monday | Modelo decide E executa via MCP | Modelo só **decide** (JSON pequeno); o **código** executa via API do Monday |
| Senha do modo de ensino | Hardcoded no HTML (visível) | Validada no servidor, nunca enviada ao navegador |
| Custo de KB por mensagem | Reenviada inteira sempre | Prompt caching — só paga cheio na 1ª vez |

A separação "IA decide, código executa" no registro elimina o risco de falso
positivo que tivemos no artifact (o modelo dizer que criou algo sem de fato
ter chamado a ferramenta) — aqui a criação no Monday é uma chamada de API
comum, não uma decisão do modelo.

## Passo a passo de deploy (Vercel)

1. **Clonar/subir este projeto** para um repositório GitHub (pode reusar o
   repo `chatbot-demandas` que você já tinha, limpando o conteúdo antigo).
2. **Conectar o repo à Vercel** (vercel.com → New Project → importar do GitHub).
3. **Variáveis de ambiente** (Vercel → seu projeto → Settings → Environment Variables):
   - `ANTHROPIC_API_KEY` — gere em console.anthropic.com
   - `MONDAY_API_TOKEN` — gere em monday.com → avatar → Administração → API
     (precisa de permissão de leitura/escrita nos 5 boards)
   - `ADMIN_PASSWORD` — defina uma senha só do time (não é mais a do artifact)
4. **(Recomendado) Vercel KV**, para o modo de ensino persistir de verdade:
   - Vercel → seu projeto → Storage → Create Database → KV → conectar ao projeto
   - Isso preenche `KV_REST_API_URL`/`KV_REST_API_TOKEN` automaticamente
   - Sem isso, as correções funcionam mas podem ser perdidas quando a função
     "esfria" (comportamento normal de servidor sem estado)
5. **Deploy.** A Vercel detecta `/api/*.js` automaticamente como funções
   serverless e serve `/public` como site estático — não precisa de
   configuração extra.
6. **Embutir no produto:** um `<iframe src="https://seu-dominio.vercel.app">`
   na área logada do cliente, ou um link direto, como preferir.

## Configuração necessária nos boards do Monday (confirmar antes de ir ao ar)

Cada um dos 5 boards (Entregas, Condutores, Gestores, Passageiros, Pagamentos) precisa ter:
- Um **grupo chamado exatamente "Triagem"** (é onde itens novos entram)
- Colunas com título contendo: **"central"**, **"motivo"**, **"opera"** (de
  Operação) e **"situa"** (de Situação) — o código busca por esses pedaços de
  texto no título da coluna, então "Código da central", "Operação da
  demanda" etc. funcionam, mas renomear pra algo sem essas palavras quebra
  o preenchimento automático (vai logar um aviso no console, não trava o fluxo)

## Por que o custo de tokens fica sob controle

1. **Prompt caching** (`cache_control: ephemeral` no bloco de sistema) — a
   base de conhecimento (~40KB) só é cobrada em cheio na primeira chamada
   dentro da janela de cache; chamadas seguintes saem a uma fração do preço.
   Ver: https://docs.claude.com/en/docs/build-with-claude/prompt-caching
2. **Modelo econômico pra conversa** (`claude-haiku-4-5-20251001`) — só a
   etapa de comparação de duplicidade usa um modelo melhor
   (`claude-sonnet-5`), e isso roda **uma única vez por pedido finalizado**,
   não a cada mensagem.
3. **Pré-filtro de candidatos** (`lib/candidates.js`) — em vez de mandar
   todos os itens do board pro Claude comparar, um filtro leve por
   sobreposição de palavras-chave seleciona só os ~8 mais prováveis. Em
   boards grandes isso reduz bastante o tamanho da chamada de classificação.
4. **Execução determinística** — criar item/subitem no Monday é uma chamada
   de API direta no código (`lib/monday.js`), não uma tool call do modelo.
   Mais barato, mais rápido, mais previsível.

### Se ainda assim o custo for um problema
- Reduza `MAX_CANDIDATES` em `api/registrar.js` (hoje 8)
- Troque `MATCH_MODEL` para `claude-haiku-4-5-20251001` também (perde um
  pouco de precisão no "sinônimo difícil", ganha custo)
- Configure um teto de gasto mensal em console.anthropic.com → Settings → Billing

## Modo de ensino (admin)

Mesma sintaxe de antes, só que agora a senha nunca sai do servidor:
```
/ensinar <senha> <correção>
/listar <senha>
/esquecer <senha> <número>
```

## Limitações conhecidas / próximos ajustes possíveis

- **Paginação do Monday:** `getBoardItemsSummary` busca até 500 itens por
  board. Se algum board passar disso, implementar paginação via `cursor`
  (hoje só loga um aviso no console).
- **Tipos de coluna:** o código assume que "Operação" e "Situação" são
  colunas do tipo status ou dropdown (usa `{label: valor}`/`{labels: [valor]}`).
  Se forem de outro tipo, ajuste `formatColumnValue` em `lib/monday.js`.
- **Pré-filtro por palavra-chave** pode, em casos raros, deixar de fora um
  item verdadeiramente equivalente se não houver NENHUMA palavra em comum
  (ex. duas formas de dizer a mesma coisa sem nenhum substantivo
  compartilhado). Se isso acontecer com frequência, aumente `MAX_CANDIDATES`
  ou remova o filtro para boards pequenos.
- **IDs de board/mapa de áreas** estão hardcoded em `api/registrar.js`
  (`BOARD_IDS`) — se a Machine criar um 6º squad, adicionar aqui e também
  nas 5 opções do prompt de coleta em `lib/prompts.js`.
