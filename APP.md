# Tabyra for Antigravity App · beta 0.6.0

The shared browser opens inside the conversation panel. The IDE can remain closed. The plugin includes its MCP server and uses the Sidecar SDK supplied by Antigravity; it does not bundle another Electron installation or a model.

## Install

Requirements: Windows for this beta, Antigravity App with Sidecar SDK support, Node.js 20+ and Chrome or Edge. macOS/Linux have not been validated.

1. Extract `tabyra-app-0.6.0.zip` to a local folder.
2. In that folder run `node install.mjs`.
3. Reopen the App. In **Customizations → Installed**, confirm **Tabyra** is enabled. Open its browser panel from the conversation's extensions menu.
4. Ask the agent to use the plugin's MCP tools. Its compatibility identifier is `elektron-app_elektron-app`, distinct from the IDE server `elektron-browser`.

The installer is bundled: it does not need this source repository, npm install, or a developer's absolute paths. It creates the plugin and MCP paths for the current user, enables the plugin/sidecar, and preserves unrelated settings. Before replacing an installed plugin it keeps a backup under `~/.gemini/config/tabyra-backups/`.

MCP approval settings are preserved by default. To explicitly grant this plugin's tools automatic approval during installation, use `node install.mjs --allow-tools`. It only adds `mcp(elektron-app_elektron-app/*)` and refuses conflicting Ask/Deny rules. It does not approve terminal commands or other MCP servers.

From source, use `npm run app:install`. Installation requires a writable Antigravity profile; organizational policies still apply.

## Connection and accounts

Choose the embedded browser or [connect regular Chrome](CHROME.md). The connected mode saves pairing without copying JSON and uses the Chrome profile where Tabyra Connect is installed. Account login takes place in the regular Chrome window after releasing debugger control.

Existing Elektron installations are updated in place. Plugin ID, sidecar ID, data directories, saved pairing and permission rules keep their legacy names. See [MIGRATION.md](MIGRATION.md).

## Lifetime and resource use

The backend starts without launching Chromium; the browser starts on demand. Captures are requested only while the panel is visible. Light mode uses up to one periodic capture per second at JPEG quality 65; normal mode uses 300 ms and quality 80. Browser content still consumes memory and CPU; no comparative performance claim is made.

Closing the panel keeps the App session available to the agent. The power button closes embedded Chromium or disconnects the external Chrome. Closing the last embedded tab releases Chromium. Blank embedded sessions can expire after 60 seconds without activity; real pages are not discarded just for being idle.

Pause blocks subsequent tools. Interromper cancels an active JavaScript call while preserving the page. Calls have a configurable budget up to 120 seconds; external work such as a training job should be monitored through short checks. See [AUTOMATION.md](AUTOMATION.md).

## Local storage and removal

- Plugin: `~/.gemini/config/plugins/elektron-app`.
- Profile, preferences and discovery: `~/.gemini/elektron-app`.
- Host logs: the Antigravity sidecar log directory for `elektron-app/browser`.
- This App profile is shared across projects and separate from the IDE's workspace profiles and your normal Chrome profile.

Disable the plugin and its sidecar in Antigravity before uninstalling. Remove its MCP permission rule if you no longer want that authorization. Data is retained unless you separately delete the profile directory; deleting it removes embedded-browser logins. Uninstalling Tabyra Connect does not clear your normal Chrome accounts.

Read [privacy](PRIVACY.md), [security](SECURITY.md) and [support](SUPPORT.md). No session files, cookies or tokens should be sent to support.
