# Tabyra Browser

**Browse with your AI. Stay on the same page.**

Tabyra brings a shared browser into **VS Code and Antigravity IDE**. Open a website or local web app, let an MCP-compatible agent inspect and interact with it, and watch the same tabs in your editor. Click, type and take over whenever you need to.

Use a separate Chromium profile, or connect your **regular Chrome with its existing accounts** through Tabyra Connect. A separate edition also opens inside an **Antigravity App conversation**, with the IDE closed.

[Install from Open VSX](https://open-vsx.org/extension/gabrielyogi/elektron-browser) · [Download the IDE package](https://github.com/MadrasLe/tabyra/releases/tag/v0.7.2-beta.1) · [Guia em português](README.pt-BR.md)

![Tabyra sharing a browser page between a person and an AI agent](https://raw.githubusercontent.com/MadrasLe/tabyra/main/store-assets/screenshots/browser.png)

*Actual Tabyra panel on a local demonstration page.*

## What you can do

- **Work beside your code:** open your development server, inspect rendered content, exercise a form and check the result without leaving the editor.
- **Give your agent browser tools:** manage tabs, navigate, read page structure, click, fill, press keys, scroll and take screenshots through 16 MCP tools.
- **Use accounts already in Chrome:** connect a dedicated window of your normal profile. Saved pairing makes subsequent connections simpler.
- **Automate with JavaScript:** extract links or tables, inspect DOM/CSS and process page data in batches, returning structured results.
- **Work with rich editors:** native input supports ordinary fields and contenteditable editors. Supported Monaco instances receive a complete code block with indentation preserved and immediate text verification.
- **Follow and interrupt:** a visual pointer marks interaction targets when available. **Pause AI** blocks subsequent calls; **Interromper** cancels a running JavaScript call.
- **Reduce capture overhead:** Light mode lowers image frequency and quality. Browser processes are reused; connected Chrome stays open when Tabyra disconnects.

**Your MCP client supplies the agent, model and AI account.** Tabyra supplies the browser connection and tools; installing it alone does not configure an agent or include a model subscription.

## Two browser modes

| | Embedded Chromium | Connected Chrome |
| --- | --- | --- |
| Profile | Separate and persistent | Your regular Chrome profile |
| Account sessions | Saved in Tabyra's profile | Available in the connected Chrome profile |
| Setup | Detect a locally installed Chrome/Edge | Install Tabyra Connect once, then pair from the panel |
| Human view | The Tabyra panel | The panel and a dedicated normal Chrome window |
| Stopping Tabyra | Closes embedded Chromium | Disconnects control; Chrome remains open |

![Tabyra connection controls](https://raw.githubusercontent.com/MadrasLe/tabyra/main/store-assets/screenshots/connect.png)

*Actual connection controls. The usual Chrome pairing flow does not require copying JSON.*

## Get started in your editor

1. Install **Tabyra Browser** from [Open VSX](https://open-vsx.org/extension/gabrielyogi/elektron-browser), or download `tabyra-browser-0.7.2.vsix` and choose **Extensions → Install from VSIX…**.
2. Run **Tabyra: Abrir navegador**, click Tabyra in the status bar, or press **Ctrl+Alt+B** (**Cmd+Alt+B** on macOS).
3. Open **Conectar IA → Copiar configuração**. Merge the generated entry into your MCP client's settings, then start or refresh that server.
4. Ask the agent to use Tabyra's tools. Keep the IDE panel open while it works.

| Client | Where to configure MCP |
| --- | --- |
| Antigravity IDE | `mcpServers.elektron-browser` in **Manage MCP Servers → View raw config**. The generated entry includes eager tool discovery. |
| VS Code | `servers.elektron-browser` in `.vscode/mcp.json`; start it with **MCP: List Servers** and enable the tools in your MCP-capable agent. |
| Other MCP clients | Use the generated stdio command, arguments and environment. Client-specific setup may differ. |

Configuration is normally a one-time step; revisit it if the client's saved installation path changes. It contains installation/discovery-file paths, not your session token. Host approval rules still apply.

**Try these requests once connected:**

> Use Tabyra to open http://localhost:3000, inspect the form and check its validation with sample data.

> Read the table on the active tab and return the first 20 rows as JSON.

> Open these two pages in separate Tabyra tabs and compare their visible information.

## Connect your signed-in Chrome

Install [Tabyra Connect](CHROME.md) once in the intended profile. During the beta, extract the [Chrome helper ZIP](https://github.com/MadrasLe/tabyra/releases/download/v0.7.1-beta.1/tabyra-connect-0.3.0.zip) to a permanent folder and load it unpacked from `chrome://extensions`. Then select **Chrome conectado · suas contas** in Tabyra and click **Conectar Chrome**. A local page pairs the helper, which saves the reconnect credential.

For a new sign-in, choose **Fazer login no Chrome**, complete it in the normal Chrome window, then resume the panel. The helper controls the dedicated shared window; other windows are excluded by its checks. This window scope does not create an isolated account profile. Websites can still expire sessions, request CAPTCHA or reject a browser.

## JavaScript and developer console access

**JavaScript automation is available; a full DevTools console is not.** `browser_evaluate` runs a function in an **isolated JavaScript context sharing the page DOM**. It can inspect elements, computed styles and links, modify the DOM and return JSON. It does not expose the site's own JavaScript globals or Node.js/file-system APIs.

For example, call `browser_evaluate` with:

```json
{
  "script": "() => ({ title: document.title, headings: [...document.querySelectorAll('h1, h2')].map(el => el.innerText) })"
}
```

Use `return` to send data back; `console.log` output is not collected as the result. Errors thrown by the evaluated function are returned to the agent. **Page-wide console history, background JavaScript errors, network request/response inspection, breakpoints and a docked DevTools UI are not currently exposed as Tabyra tools.**

For manual debugging in connected mode, release Tabyra's debugger control through **Fazer login no Chrome**, use the normal Chrome window's DevTools, close DevTools and resume the panel afterward. This does not give the MCP agent access to DevTools. [JavaScript and editor guide](AUTOMATION.md).

## Antigravity App edition

For a browser beside a conversation with the IDE closed, download [Tabyra App 0.6.1](https://github.com/MadrasLe/tabyra/releases/download/v0.7.1-beta.1/tabyra-app-0.6.1.zip), extract it and run `node install.mjs`. Reopen Antigravity App, enable/open Tabyra under **Customizations**, and ask the agent to use the plugin's MCP tools.

The App requires Antigravity's Sidecar SDK and Node.js 20+. It preserves existing approval settings, starts the browser on demand and defaults to Light mode. [App installation and lifecycle guide](APP.md).

## MCP tools

| Purpose | Tools |
| --- | --- |
| Tabs and navigation | `browser_tabs`, `browser_new_tab`, `browser_switch_tab`, `browser_close_tab`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload` |
| Read the page | `browser_snapshot`, `browser_screenshot` |
| Interact | `browser_click`, `browser_fill`, `browser_type`, `browser_press`, `browser_scroll` |
| Run JavaScript | `browser_evaluate` |

## Compatibility and practical limits

- **Windows beta:** validated on Windows. macOS/Linux remain experimental. The editor edition requires desktop VS Code API 1.90+ and local Chrome/Edge; it does not run on vscode.dev. The Chrome helper requires Chrome 125+.
- **Visual panel:** captured frames and forwarded input, rather than a native Chromium view embedded in the editor. Some browser features, downloads and native dialogs are unsupported.
- **Page inspection:** snapshots cover the main document and open Shadow DOM, excluding closed roots and iframe contents. Monaco insertion requires the focused instance's public API; unavailable APIs return an error.
- **Operation budgets:** JavaScript defaults to 5 seconds, adjustable up to 120 seconds per call. Timeouts preserve the tab. Monitor long external jobs through short checks; Light mode does not change these budgets.
- **Resource use:** Light mode reduces capture work, but websites and Chromium still consume memory and CPU. No comparative performance or CAPTCHA-free login claim is made.
- **Permissions and data:** your MCP host controls approval. Authorized page content and screenshots may reach your AI provider. See [privacy](PRIVACY.md) and [security](SECURITY.md).

Previously **Elektron Browser**. Internal extension/MCP identifiers remain stable to preserve profiles, logins, pairing and settings. [Migration guide](MIGRATION.md).

## Build and support

```powershell
npm ci
npm run check
npm test
npm run package
```

`npm run package` creates the editor VSIX. `npm run release` also packages the App/helper and checks archive contents. Browser tests need Chrome; connected-Chrome tests need an extension-capable Chromium. App tests need Antigravity's Sidecar SDK. The [security review](store-assets/security-review-2026-10-17.md) records the scope and results of that review.

Report bugs at [GitHub Issues](https://github.com/MadrasLe/tabyra/issues). Support: [abrakasfrosken@gmail.com](mailto:abrakasfrosken@gmail.com). Read [SUPPORT.md](SUPPORT.md) before sharing diagnostics; never include cookies, tokens, passwords or browser profiles.

Copyright Gabriel Yogi. [MIT license](LICENSE), with [third-party notices](THIRD_PARTY_NOTICES.md).
