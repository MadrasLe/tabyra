# Tabyra security update — Browser 0.7.1 / App 0.6.1 / Connect 0.3.0

- Keep Chromium's process sandbox enabled on Windows and macOS as well as Linux.
- Reject malformed and oversized unauthenticated Chrome handshakes without crashing; bound pending handshakes and refuse foreign WebSocket Host headers.
- Never follow redirects from the authenticated local MCP bridge; enforce its loopback Host as well as its token and Origin checks.
- Ignore panel state messages from unrelated origins while preserving the IDE's same-origin frame messages. Validate App SDK theme messages before the host preload handles them, while retaining normal host themes.
- Send no referrer from App pages. Preserve all 16 MCP tools, arbitrary page JavaScript, automation deadlines and existing approval settings.

# Tabyra beta — Browser 0.7.0 / App 0.6.0 / Connect 0.3.0

- Public brand renamed from Elektron to Tabyra, with a new icon set and consistent panel/helper labels. Original extension, MCP and data identifiers remain stable for in-place updates and existing profiles.
- Portable App installer is included in the release; no source checkout or developer-specific paths are required. Existing permission rules are preserved. Automatic MCP approval is an explicit `--allow-tools` choice, with Ask/Deny conflicts respected.
- MCP configuration and connection guidance now match VS Code or Antigravity. Added public privacy, security, support and migration documentation, dependency license collection and release archive checks.
- Beta distribution consists of an IDE VSIX, App ZIP with bundled installer and Chrome helper ZIP, plus SHA-256 checksums. Windows is the validated platform; store listings are independent submissions.

# Elektron App 0.5.0 / IDE 0.6.0 / Chrome 0.2.0

- Conectar Chrome abre um pareamento local com chave de uso único válida por dois minutos; a extensão guarda a credencial de reconexão neste perfil. Sem copiar JSON no fluxo principal. Reabrir a janela e reiniciar o backend reaproveitam o pareamento. O código manual permanece em compatibilidade avançada.
- Painel de conexão com estado claro, ação principal, login separado e instalação recolhida. Popup da extensão reaproveita a conexão salva. Guia de primeira instalação/atualização explica o recarregamento único da auxiliar 0.2.0.
- JavaScript deixa de fechar abas por timeout. Orçamento de 5 s ajustável até 120 s, limpeza dos recursos assíncronos acompanhados e Interromper imediato fora da fila. Painel mostra tempo decorrido; status segue disponível. Prazo não é diagnóstico de travamento nem limita um trabalho externo no Colab.

# Elektron App 0.4.1 / IDE 0.5.1

- Corrigida autoindentação cumulativa reproduzida no Monaco com Python e blocos aninhados. `browser_type` detecta o editor focado e usa a API pública da instância, com comparação do texto inserido e sem clipboard do sistema; demais campos preservam entrada nativa. Colagem multilinha pelo painel humano usa a mesma proteção.
- Detecção em mundo isolado e edição por função interna fixa no contexto da página, prazo total de três segundos e preservação da aba. Não aceita JavaScript livre neste caminho. Sem repetição por digitação se a API não estiver exposta. O retorno informa `monaco-edit` com `verified: true`, ou `native` para outros campos.
- Teste anterior em plaintext foi substituído por Python real com autoindentação e blocos aninhados; cobertura de Chrome conectado, modos EditContext, edição indisponível/recusada, atraso de resposta e pausa. Instruções orientam enviar o script inteiro e conferir a indentação sem Base64/exec.

# Elektron App 0.4.0 / IDE 0.5.0

- Snapshot percorre Shadow DOM aberto, inclusive aninhado, com referências utilizáveis pelos cliques nativos e seleção de área dentro das raízes. Inclui estados checked/expanded e alvos de editores de código; mantém os limites de duração, elementos e texto.
- Nova ferramenta MCP `browser_type`: entrada nativa de texto multilinha/Unicode no editor focado, sem clipboard do sistema ou novo processo. Respeita pausa e limite de 100.000 caracteres. Não executa o código.
- Instruções MCP e skill orientam foco/inserção/conferência em Monaco/CodeMirror, reaproveitamento de conta/runtime e menos capturas repetidas de estados sem mudança. Configuração eager passa a 16 ferramentas. Extensão Chrome auxiliar permanece 0.1.0.

# Elektron App 0.3.3 / IDE 0.4.2

- Snapshot em mundo isolado com limite total de três segundos, área CSS opcional, limites de elementos/texto e prazo de leitura no Chromium. Falha de leitura mantém as abas e libera a fila.
- Lista de abas responde fora da fila de ações e informa a operação em andamento. As proteções de pausa permanecem aplicadas.
- Cursor visual não acrescenta uma segunda espera de estabilidade/rolagem. Ações nativas preparam a janela compartilhada para operação em segundo plano; abas já ativas não são reativadas a cada leitura.
- Prazos menores na ponte Chrome e instruções MCP para usar preenchimento nativo em editores ricos, limitar recuperação e conferir envios antes de repetir. A extensão Chrome auxiliar permanece 0.1.0.

# Elektron App 0.3.2

- Corrigido processo órfão no Windows: o App observa tanto o processo intermediário quanto o endpoint local do language server que o iniciou. A queda do host encerra a sessão e libera a trava mesmo quando agy-node.cmd continua vivo.
- Nova inicialização aguarda até oito segundos pela liberação coordenada da instância anterior. Uma instância saudável continua protegida contra duplicação.
- Teste de reinício usa o runtime Electron instalado do Antigravity com o Sidecar SDK real, derruba o host mantendo o pai vivo e confirma a substituição no mesmo perfil, preferências preservadas e remoção da descoberta ao encerrar.

# Elektron App 0.3.1 / IDE 0.4.1

- Abertura do Chrome solicita uma janela visível no último perfil existente (Chrome/Edge nos locais padrão do Windows), evitando o seletor de perfis inicial. Remove configurações de runtime e credenciais herdadas do Antigravity/Electron na abertura externa.
- Repetir a abertura durante um pedido reutiliza a mesma inicialização. Falhas de criação/saída imediata são retornadas ao painel, com orientação manual.
- Guia informa abertura solicitada sem afirmar conexão ou renderização. Permite tentar novamente após erro. App aguardando a extensão não mostra mais a mensagem incorreta de navegador encerrado.

# Elektron App 0.3.0 / IDE 0.4.0 / Chrome 0.1.0

- Novo modo Chrome conectado: extensão Manifest V3 controla apenas uma janela compartilhada do Chrome normal, com o perfil escolhido pelo usuário, mantendo as mesmas 15 ferramentas e o painel do Elektron.
- Botão Chrome ao lado das abas, escolha persistente do modo, guia de instalação/pareamento e conexão local autenticada. Reconexão reutiliza a janela existente sem criar outra ao fechá-la.
- Fazer login no Chrome pausa a IA, libera o depurador e permite concluir a autenticação no navegador. Retomar painel reconecta às mesmas abas; desconectar não encerra o Chrome.
- Navegador normal testado sem flags de automação, sem headless e sem porta de depuração. A página informou webdriver falso e User-Agent normal, sem mascaramento. Login Google continua dependendo de validação do usuário.
- Testes com extensão real, MCP, painel App, captura, JavaScript e cookies de teste. Ponte recusa pareamento inválido, origens web e CDP não autenticado.

# Elektron App 0.2.0 / IDE 0.3.0

- Inicializações concorrentes e capturas reaproveitadas; títulos em cache e atualizações do painel somente quando há mudança de estado.
- Encerramento aguarda saída do processo auxiliar da IDE; fallback Windows limitado à árvore criada pela sessão. Fechamento durante inicialização e desconexão do processo pai têm limpeza coordenada.
- Trava de instância única por diretório de dados do App, liberada pelo sistema operacional. Descoberta MCP é escrita atomicamente e removida somente pelo proprietário correspondente.
- App encerra Chromium ao fechar a última aba e libera sessões em branco sem painel/atividade após 60 segundos. Não fecha páginas com trabalho por simples inatividade. Botão de energia interrompe a fila manual antiga.
- Nova ferramenta `browser_evaluate`, com JavaScript no DOM da aba existente, mundo isolado, limite de resultado e prazo de 5 segundos (máximo 15). Não cria processo Node por execução. Timeout encerra apenas a aba afetada para cancelar continuações assíncronas.
- Pausa imediata para chamadas ainda na fila, incluindo JavaScript. Guia de automação, metadados e configuração eager atualizados para 15 ferramentas.

# Elektron App 0.1.0

- Nova edição independente para Antigravity App 2.22+, usando UI Extensions e Sidecar SDK para abrir o navegador ao lado da conversa, sem a IDE.
- MCP próprio, 14 ferramentas com carregamento direto e instrução `/elektron`. O servidor recebe o namespace `elektron-app_elektron-app` no aplicativo.
- Chromium inicia ao abrir o painel ou usar uma ferramenta. Modo leve ligado por padrão; capturas somente sob demanda do painel visível.
- Perfil persistente próprio, compartilhado entre projetos. Pausa persistente e botão para encerrar Chromium sem apagar logins.
- Empacotador e instalador com backup das preferências, preservação da edição IDE e permissão específica do MCP do plugin.
- Quatro testes de integração específicos, somados aos nove da edição IDE. Painel e registro MCP conferidos no aplicativo instalado.

# 0.2.0

- Ícone de globo na barra lateral, com comandos rápidos e lista de abas. Botão Elektron na barra inferior e globo na barra do editor; atalho Ctrl+Alt+B / Cmd+Alt+B.
- Tela inicial com pesquisa, atalhos Google e localhost, ícones consistentes e adaptação aos temas claro/escuro.
- Guia de conexão dentro do painel e confirmação da cópia da configuração.
- Botões explícitos Pausar IA / Retomar IA e indicação de acesso detectado pela ponte.
- Cursor visual no elemento alvo das chamadas MCP de clique/preenchimento, com indicação das outras ações do agente.
- Modo leve persistente; imagens iguais não são reenviadas; movimentos do mouse não disparam capturas extras.
- Nove testes de integração e teste do host Antigravity, incluindo launcher, abas, pausa e MCP.

# 0.1.1

- A configuração MCP copiada inclui `eager: true` para cada uma das 14 ferramentas, conforme o schema do Antigravity IDE instalado. Isso permite solicitar carregamento direto das ferramentas sem depender da descoberta lazy.
- O teste do host verifica que a configuração gerada contém todas as ferramentas marcadas para carregamento direto.
- Diagnóstico com `node scripts/check-configured-mcp.cjs` valida o servidor configurado por um cliente MCP real, sem imprimir tokens nem conteúdo das páginas.

A chamada do modelo Gemini dentro de uma conversa precisa ser conferida após atualizar os servidores e iniciar uma conversa nova. O teste do protocolo MCP não comprova o catálogo de ferramentas enviado pela IDE ao modelo.
