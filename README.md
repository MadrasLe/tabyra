# Tabyra Browser

**One browser. You and your AI.**

[Guia em português](README.pt-BR.md)

Tabyra puts a Chromium browser beside your code and lets a compatible AI agent work on the same tabs you can see and control. It also has an edition for the Antigravity App, inside the conversation panel.

Formerly **Elektron Browser**. This beta keeps the original extension and MCP identifiers so existing profiles and connections remain usable. See [migration](MIGRATION.md).

![Tabyra panel controlling a local demonstration page](store-assets/screenshots/browser.png)

Actual panel capture from a local test page. No personal account is shown.

## Choose your edition

| Edition | Package | Requires |
| --- | --- | --- |
| Tabyra Browser | `tabyra-browser-0.7.1.vsix` | Desktop VS Code / Antigravity IDE, API 1.90+, Chrome or Edge |
| Tabyra for Antigravity App | `tabyra-app-0.6.1.zip` | Antigravity App with Sidecar SDK, Node.js 20+ |
| Tabyra Connect | `tabyra-connect-0.3.0.zip` | Chrome 125+; helper for your regular Chrome profile |

Windows is the validated beta platform. Browser detection exists for macOS/Linux but those platforms are experimental. This is a desktop extension; it does not run on vscode.dev. The AI model and its account are supplied by your MCP client, separately from Tabyra.

## Install in an editor

1. Download the VSIX from the release assets.
2. In Extensions, select **Install from VSIX…** and choose the package.
3. Click **Tabyra** in the status bar, use `Ctrl+Alt+B`, or run **Tabyra: Abrir navegador**.
4. Open **Conectar IA → Copiar configuração**. Keep the panel open while the agent uses it.

The copied configuration matches the editor:

- **Antigravity IDE:** merge `mcpServers.elektron-browser` into the MCP settings shown by the agent's **Manage MCP Servers → View raw config**. Refresh the server. The configuration includes eager tool loading.
- **VS Code:** merge `servers.elektron-browser` into `.vscode/mcp.json`, then start it from **MCP: List Servers**. Enable the tools in an MCP-capable agent. Tabyra does not provide a model or a Copilot subscription.
- Other clients may accept the stdio server, but automatic setup is not claimed for them.

The configuration contains installation paths and a discovery-file path, not your session token. Do not post discovery files or browser profiles in issues.

## Use your signed-in Chrome

Choose **Chrome conectado · suas contas** and install [Tabyra Connect](CHROME.md) once in the intended Chrome profile. Click **Conectar Chrome** in the panel. A local page pairs the helper without copying JSON; the saved credential reconnects when the backend restarts.

For account login, choose **Fazer login no Chrome**, complete it in the regular Chrome window, then resume the panel. The helper shares its dedicated window, not every window in your profile. Websites can still expire sessions or request verification. No CAPTCHA or Google login guarantee is made.

## Shared control

- Tabs, address bar, history, human input and 16 MCP tools operate on the same pages.
- A visual AI pointer marks actual interaction targets when available.
- Pause blocks subsequent agent calls. **Interromper** cancels an active JavaScript call.
- JavaScript defaults to a 5-second budget and accepts up to 120 seconds. A timeout preserves the tab; elapsed time is not a diagnosis of a frozen page.
- Light mode reduces the image capture rate and quality. It does not change tool deadlines.
- In the embedded mode, Chromium uses its own persistent profile. In connected mode, Chrome owns the existing profile and remains open when Tabyra disconnects.

The panel displays images and forwards input; it is not a native Chromium view embedded in the editor. Some browser features, downloads and native dialogs remain unsupported. Read [automation and editor limitations](AUTOMATION.md), [privacy](PRIVACY.md) and [security](SECURITY.md).

## Tools

`browser_tabs`, `browser_new_tab`, `browser_switch_tab`, `browser_close_tab`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload`, `browser_snapshot`, `browser_click`, `browser_fill`, `browser_type`, `browser_press`, `browser_scroll`, `browser_screenshot`, `browser_evaluate`.

Snapshots cover the main document and open Shadow DOM, with bounded output. Closed roots and iframe contents are not included. Monaco insertion uses the focused editor's public API and verifies the inserted text; sites that do not expose it receive an error, without an automatic typing fallback.

## Build and validate

```powershell
npm ci
npm run check
npm test
npm run release
```

The release command builds the VSIX, self-contained App installer and Connect ZIP, checks the distribution allowlists and writes SHA-256 checksums. Browser integration tests need Chrome; the connected-Chrome tests need an extension-capable Chromium selected with `ELEKTRON_TEST_CHROME`. The App tests need the Sidecar SDK supplied by Antigravity. The optional Monaco fixture is not bundled in the product.

Support: [abrakasfrosken@gmail.com](mailto:abrakasfrosken@gmail.com). Please read [SUPPORT.md](SUPPORT.md) before sharing diagnostics. Copyright Gabriel Yogi. [MIT license](LICENSE), with [third-party notices](THIRD_PARTY_NOTICES.md).
