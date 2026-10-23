# Tabyra Browser

**Navegue com sua IA. Acompanhe tudo na mesma página.**

O Tabyra coloca um navegador compartilhado dentro do **VS Code e do Antigravity IDE**. Abra um site ou sua aplicação local, peça a um agente compatível com MCP para inspecionar e interagir com a página e acompanhe as mesmas abas no editor. Você também pode clicar, digitar e assumir o controle.

Escolha um Chromium com perfil separado ou conecte seu **Chrome normal, com as contas disponíveis nesse perfil**, pela auxiliar Tabyra Connect. Há também uma edição para o **painel de conversa do Antigravity App**, que funciona com a IDE fechada.

[Instalar pelo Open VSX](https://open-vsx.org/extension/gabrielyogi/elektron-browser) · [Baixar o pacote da IDE](https://github.com/MadrasLe/tabyra/releases/tag/v0.7.2-beta.1) · [English](README.md)

![Tabyra compartilhando uma página entre pessoa e agente de IA](https://raw.githubusercontent.com/MadrasLe/tabyra/main/store-assets/screenshots/browser.png)

*Captura real do painel em uma página local de demonstração.*

## O que você pode fazer

- **Trabalhar ao lado do código:** abrir seu servidor local, conferir a interface, preencher um formulário e verificar o resultado.
- **Dar ferramentas de navegação à IA:** gerenciar abas, navegar, ler a estrutura da página, clicar, preencher campos, pressionar teclas, rolar e capturar imagens por 16 ferramentas MCP.
- **Usar suas contas no Chrome:** compartilhar uma janela dedicada do perfil normal. O pareamento salvo simplifica as próximas conexões.
- **Automatizar com JavaScript:** extrair tabelas e links, inspecionar DOM/CSS e processar dados da página em lote, retornando resultados estruturados.
- **Trabalhar com editores ricos:** campos comuns e contenteditable recebem entrada nativa. Instâncias Monaco compatíveis recebem o bloco inteiro com recuos preservados e comparação imediata do texto inserido.
- **Acompanhar e intervir:** o cursor visual marca alvos quando disponíveis. **Pausar IA** bloqueia as próximas chamadas; **Interromper** cancela o JavaScript em execução.
- **Reduzir o trabalho de captura:** o modo leve diminui frequência e qualidade das imagens. Os processos do navegador são reaproveitados; o Chrome conectado permanece aberto ao desconectar.

**O agente, o modelo e a conta de IA vêm do seu cliente MCP.** O Tabyra fornece o navegador e suas ferramentas; a instalação sozinha não configura uma IA nem inclui uma assinatura.

## Escolha o modo do navegador

| | Chromium integrado | Chrome conectado |
| --- | --- | --- |
| Perfil | Separado e persistente | Seu perfil normal do Chrome |
| Contas | Logins salvos no perfil do Tabyra | Contas disponíveis no perfil conectado |
| Configuração | Detecta Chrome/Edge instalado | Instalação única da auxiliar e pareamento pelo painel |
| Visualização | Painel do Tabyra | Painel e janela dedicada do Chrome |
| Ao encerrar o Tabyra | Fecha o navegador integrado | Desconecta o controle e mantém o Chrome aberto |

![Controles de conexão do Tabyra](https://raw.githubusercontent.com/MadrasLe/tabyra/main/store-assets/screenshots/connect.png)

*Controles reais do painel. O pareamento usual não exige copiar JSON.*

## Comece na IDE

1. Instale **Tabyra Browser** pelo [Open VSX](https://open-vsx.org/extension/gabrielyogi/elektron-browser) ou baixe `tabyra-browser-0.7.2.vsix` e use **Extensões → Instalar do VSIX…**.
2. Execute **Tabyra: Abrir navegador**, clique em Tabyra na barra de status ou use **Ctrl+Alt+B** (**Cmd+Alt+B** no macOS).
3. Em **Conectar IA → Copiar configuração**, copie a entrada gerada e mescle nas configurações MCP do cliente. Inicie ou atualize o servidor.
4. Peça à IA para usar as ferramentas do Tabyra e mantenha o painel da IDE aberto durante o trabalho.

| Cliente | Onde configurar |
| --- | --- |
| Antigravity IDE | `mcpServers.elektron-browser`, em **Manage MCP Servers → View raw config**. A entrada inclui descoberta antecipada das ferramentas. |
| VS Code | `servers.elektron-browser`, em `.vscode/mcp.json`. Inicie por **MCP: List Servers** e habilite as ferramentas no agente compatível com MCP. |
| Outros clientes MCP | Use comando, argumentos e ambiente do JSON gerado. A configuração depende do cliente. |

Essa configuração é inicial; revise se o cliente mudar o caminho salvo da instalação. O JSON contém caminhos locais, não o token da sessão. As regras de aprovação do cliente continuam valendo.

**Exemplos de pedidos:**

> Use o Tabyra para abrir http://localhost:3000, inspecionar o formulário e verificar a validação com dados de exemplo.

> Leia a tabela da aba ativa e devolva as primeiras 20 linhas em JSON.

> Abra estas duas páginas em abas diferentes e compare as informações visíveis.

## Conecte o Chrome com suas contas

Instale [Tabyra Connect](CHROME.md) no perfil desejado. Na beta, extraia o [ZIP da auxiliar](https://github.com/MadrasLe/tabyra/releases/download/v0.7.1-beta.1/tabyra-connect-0.3.0.zip) para uma pasta permanente e carregue-a sem compactação em `chrome://extensions`, com o modo de desenvolvedor ativo. No Tabyra, selecione **Chrome conectado · suas contas** e clique **Conectar Chrome**. A página local faz o pareamento e a auxiliar guarda a credencial de reconexão.

Para entrar em outra conta, use **Fazer login no Chrome**, conclua na janela normal e retome o painel. O controle fica na janela compartilhada, sem incluir as outras janelas. Esse escopo não isola o perfil das próprias contas. Sites ainda podem pedir CAPTCHA, expirar sessões ou recusar o navegador.

## JavaScript e console de desenvolvedor

**A execução de JavaScript está disponível; o console DevTools completo ainda não.** A IA usa `browser_evaluate` para executar uma função em um **contexto JavaScript isolado que compartilha o DOM da página**. Pode consultar elementos, estilos calculados e links, modificar o DOM e retornar JSON. Não recebe as variáveis JavaScript internas do site nem APIs de Node.js ou de arquivos locais.

Exemplo de argumentos da ferramenta:

```json
{
  "script": "() => ({ titulo: document.title, titulos: [...document.querySelectorAll('h1, h2')].map(el => el.innerText) })"
}
```

Use `return` para devolver dados: a saída de `console.log` não é coletada como resultado. Erros lançados pela função executada são devolvidos à IA. **Histórico do console, erros gerais do site em segundo plano, inspeção de requisições/respostas de rede, breakpoints e uma interface DevTools no painel ainda não são ferramentas do Tabyra.**

Para depuração manual no Chrome conectado, libere o debugger pelo controle **Fazer login no Chrome**, use o DevTools da janela normal, feche o DevTools e retome o painel. Isso não dá ao agente acesso ao DevTools. [Guia de automação e editores](AUTOMATION.md).

## Edição para o Antigravity App

Para usar o navegador dentro da conversa, com a IDE fechada, baixe [Tabyra App 0.6.1](https://github.com/MadrasLe/tabyra/releases/download/v0.7.1-beta.1/tabyra-app-0.6.1.zip), extraia e execute `node install.mjs`. Reabra o App, habilite/abra Tabyra em **Customizations** e peça ao agente para usar o MCP do plugin.

Essa edição exige o Sidecar SDK fornecido pelo Antigravity e Node.js 20+. Preserva as regras de aprovação, inicia o navegador sob demanda e usa modo leve por padrão. [Guia do App](APP.md).

## Ferramentas MCP

| Finalidade | Ferramentas |
| --- | --- |
| Abas e navegação | `browser_tabs`, `browser_new_tab`, `browser_switch_tab`, `browser_close_tab`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload` |
| Leitura | `browser_snapshot`, `browser_screenshot` |
| Interação | `browser_click`, `browser_fill`, `browser_type`, `browser_press`, `browser_scroll` |
| JavaScript | `browser_evaluate` |

## Compatibilidade e limites

- **Beta validada no Windows.** macOS/Linux são experimentais. A extensão exige API desktop VS Code 1.90+ e Chrome/Edge instalado; não funciona no vscode.dev. A auxiliar exige Chrome 125+.
- **O painel exibe capturas e encaminha entrada.** Não é uma janela Chromium nativa encaixada no editor. Alguns recursos, downloads e diálogos do navegador não são suportados.
- **Snapshot lê o documento principal e Shadow DOM aberto.** Raízes fechadas e conteúdo de iframes não entram nessa leitura. A inserção Monaco exige a API pública da instância focada; se não estiver disponível, retorna erro.
- **JavaScript usa um orçamento por chamada:** 5 segundos por padrão, ajustável até 120 segundos. Timeout preserva a aba. Acompanhe trabalhos externos longos com consultas curtas. Modo leve não muda esses prazos.
- **Modo leve reduz capturas, não elimina o consumo dos sites.** Não há promessa de desempenho comparativo ou de acesso sem CAPTCHA.
- **Permissões são controladas pelo cliente MCP.** Conteúdo e imagens autorizados podem chegar ao seu provedor de IA. Leia [privacidade](PRIVACY.md) e [segurança](SECURITY.md).

Antes chamado **Elektron Browser**. Os IDs internos foram preservados para manter perfis, logins, pareamento e configurações. [Migração](MIGRATION.md).

## Código e suporte

Para desenvolver: `npm ci`, `npm run check`, `npm test` e `npm run package`. Os testes de navegador exigem Chrome; testes do App exigem o Sidecar SDK do Antigravity. O [relatório de segurança](store-assets/security-review-2026-10-17.md) registra o escopo daquela revisão.

Relate problemas no [GitHub Issues](https://github.com/MadrasLe/tabyra/issues) ou escreva para [abrakasfrosken@gmail.com](mailto:abrakasfrosken@gmail.com). Consulte [SUPPORT.md](SUPPORT.md) antes de enviar diagnósticos; não inclua cookies, senhas, tokens ou perfis.

Gabriel Yogi · [Licença MIT](LICENSE) · [Avisos de terceiros](THIRD_PARTY_NOTICES.md).
