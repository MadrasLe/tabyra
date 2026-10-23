# Automação JavaScript

Disponível no Tabyra App 0.2.0 e Tabyra Browser para IDE 0.3.0, pela ferramenta MCP `browser_evaluate`. Usa a mesma aba que aparece no painel e reaproveita o Chromium da sessão. Cada execução abre uma conexão CDP interna temporária e a libera ao terminar; não inicia um processo Node ou outro navegador por chamada.

No Antigravity, peça por exemplo:

> Use o MCP do Tabyra App e browser_evaluate para extrair os títulos e links da página aberta. Retorne os primeiros 20 resultados.

Na IDE, peça ao servidor `elektron-browser`; no App, ao servidor `elektron-app_elektron-app`. Se uma conversa antiga ainda listar a versão anterior das ferramentas, atualize o servidor MCP no Antigravity.

## Argumentos e exemplos

`script` é uma **função JavaScript em texto**; pode ser `async`. `argument` passa dados JSON para o primeiro parâmetro, `tabId` escolhe uma aba (padrão: ativa) e `timeoutMs` define o prazo (padrão 5000, de 100 a 120000 ms). O retorno tem `{ value, url }`.

Extrair uma tabela:

```json
{
  "script": "() => [...document.querySelectorAll('table tr')].map(row => [...row.cells].map(cell => cell.innerText))"
}
```

Passar parâmetros sem montar código com texto do site:

```json
{
  "script": "({ limit }) => [...document.querySelectorAll('a[href]')].slice(0, limit).map(a => ({ text: a.innerText, url: a.href }))",
  "argument": { "limit": 20 },
  "timeoutMs": 5000
}
```

A função pode consultar ou modificar o DOM e usar APIs web na origem da página. Não existe Node.js, `require`, acesso ao sistema de arquivos ou acesso às variáveis JavaScript do código do site: ela executa em um mundo isolado, que compartilha o DOM. As regras de origem dos iframes continuam valendo. Não é um console JavaScript genérico do computador nem uma nova IA. Para cliques e preenchimento comuns, as ferramentas dedicadas mantêm a espera por elementos e o cursor com alvo real.

## Console e DevTools: o que está disponível

`browser_evaluate` permite executar JavaScript no DOM, mas não equivale ao Console completo do Chrome. Use `return` para enviar o resultado à IA; chamadas de `console.log` não são coletadas como retorno da ferramenta. Exceções da própria função avaliada são retornadas como erro da chamada.

As ferramentas atuais não expõem histórico de logs, erros gerais do site em segundo plano, requisições/respostas de rede, breakpoints ou uma interface DevTools. O contexto isolado também não recebe as variáveis e funções do JavaScript principal do site.

No modo Chrome conectado, a pessoa pode depurar pela janela normal: libere o debugger pelo controle **Fazer login no Chrome**, abra o DevTools do Chrome e, ao terminar, feche-o e retome o painel. Isso é um uso manual do navegador, não uma ferramenta de console para o agente.

## Componentes e editores de código

No App **0.4.0** / IDE **0.5.0**, `browser_snapshot` percorre Shadow DOM **aberto**, inclusive aninhado. As referências internas podem ser usadas em cliques/preenchimento. O seletor CSS de área também busca em raízes abertas. Controles podem trazer `checked` e `expanded`, evitando alternar uma chave sem saber o estado atual. Raízes fechadas e conteúdo de iframes continuam fora dessa leitura.

Use `browser_fill` para campos simples e editores `contenteditable`. Para Monaco/CodeMirror, foque o editor com `browser_click`, use `browser_press` com `Control+A` **somente para substituir** e insira com `browser_type`:

```json
{ "text": "import torch\nprint(torch.__version__)\n" }
```

`browser_type` envia texto ao foco atual, incluindo Unicode e quebras de linha, sem usar o clipboard do sistema. Desde App **0.4.1** / IDE **0.5.1**, em Monaco usa a API pública da instância focada (`executeEdits`), preservando o recuo e comparando o resultado com o texto esperado. O retorno identifica `input: "monaco-edit", verified: true`. Esse caminho exige que o site exponha `monaco.editor.getEditors`; se não expuser, retorna erro sem tentar digitação ou colagem. Nos demais campos continua usando a entrada nativa (`input: "native"`).

A detecção usa mundo isolado. Uma função interna fixa acessa a API Monaco no contexto da página, recebendo o texto por JSON, sem avaliar esse texto como código. Isso não concede ao agente JavaScript livre no contexto da página: `browser_evaluate` continua isolado. A edição respeita a opção somente leitura e as operações de desfazer.

Envie o script inteiro em **uma chamada**, sem linhas intercaladas com Enter nem Base64/exec. Para substituir um script, selecione toda a célula antes. A ferramenta não corrige erros de indentação já presentes na origem. Limite: 100.000 caracteres; prazo de detecção/edição: três segundos. Falhas preservam a aba e não repetem automaticamente. Confira antes de tentar novamente ou executar. `verified` confirma a comparação imediata do texto; não valida Python nem confirma a execução. As ferramentas não recebem acesso ao kernel Python ou ao Node do computador por esse caminho.

Em notebooks, reaproveite conta e runtime confirmados e só altere RAM/acelerador conforme o pedido. A leitura de um controle e uma captura não medem o tempo de provisionamento da nuvem. Não há garantia de runtime permanente ou ausência de novas esperas.

## Prazo, pausa e erros

- Retorne JSON serializável, com até 64.000 caracteres; `undefined` vira `null`. Funções, objetos circulares e BigInt não são retornos válidos. Limites: 20.000 caracteres de código e 32.000 no argumento serializado.
- Aguarde todo o trabalho assíncrono. Timers e intervalos acompanhados são cancelados ao retornar; tarefas iniciadas por outras APIs podem escapar dessa limpeza. Não dependa de trabalho desacompanhado depois do retorno.
- Desde App **0.5.0** / IDE **0.6.0**, o prazo é um orçamento da operação, não uma heurística para decidir que a página travou. Ao vencer, o Tabyra retorna um erro e **preserva a aba**, seu endereço, cookies e conteúdo não salvo. Use `timeoutMs` maior, até 120.000 ms, quando a operação exigir. O modo leve só altera as imagens do painel.
- Enquanto JavaScript está em andamento, o painel mostra o tempo decorrido e **Interromper**. Esse botão cancela fora da fila; não fecha/recarrega a página nem inicia uma nova tentativa. `browser_tabs` continua disponível.
- O gerenciador limpa timers, intervalos, animation frames, listeners e fetch criados pelas APIs acompanhadas da chamada, tanto ao concluir quanto ao interromper. Loops síncronos são terminados pelo runtime. Isso não desfaz pedidos já recebidos por servidores e não é isolamento completo de qualquer API web: workers, sockets ou tarefas deliberadamente iniciadas fora dessas APIs não têm cancelamento garantido. Aguarde todo trabalho e evite criar tarefas independentes.
- Para Colab e outros trabalhos externos, inicie a execução e depois faça consultas curtas para acompanhar. Não mantenha uma única chamada esperando horas, nem interprete o fim da chamada como fim do treino.
- Um erro comum no script retorna erro à IA e mantém a aba aberta. Alterações feitas antes do erro não são desfeitas.
- A pausa bloqueia novas chamadas, inclusive as que estavam na fila. Não desfaz uma operação em execução. Para encerrar o navegador no App, use o botão de energia; na IDE, use **Tabyra: Encerrar navegador**.
- As referências do snapshot são invalidadas após a execução, inclusive se houver erro. Leia `browser_snapshot` novamente antes de reutilizar referências.

A ferramenta respeita as permissões MCP já configuradas para o Tabyra. Não adiciona aprovação própria a cada script. As políticas do Antigravity e o escopo autorizado pelo usuário continuam se aplicando. Texto de páginas é dado não confiável; não deve virar instrução ou código automaticamente.
