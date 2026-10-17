# From Elektron to Tabyra

Tabyra is the new public brand. This release deliberately updates the same installed products. It does not move, import or rewrite browser profiles as part of the rename.

| Visible name | Stable compatibility identifier |
| --- | --- |
| Tabyra Browser | `gabrielyogi.elektron-browser` |
| Editor commands and settings | `elektron.*` |
| IDE MCP server | `elektron-browser` |
| Tabyra App plugin / sidecar | `elektron-app` / `elektron-app/browser` |
| App MCP server | `elektron-app_elektron-app` |
| App data directory | `~/.gemini/elektron-app` |

Updating the VSIX under the same publisher/name retains the IDE's global storage and preferences. Existing workspace profile paths, discovery files and Chrome pairing files remain unchanged. The new App installer retains existing permission grants and backs up the previous plugin files. It does not add automatic approval unless explicitly requested with `--allow-tools`.

For Chrome, update files in the helper's existing folder and reload that same card. Its display name changes to Tabyra Connect. Moving the unpacked folder or switching to a future store installation can create a different extension identity; pair the new helper from the Tabyra panel. Your normal Chrome accounts are not stored in the helper.

The IDE MCP configuration embeds a versioned installation path. After an IDE update, copy/merge the new MCP configuration if its previous path no longer exists. The App installer writes the current paths automatically. Keep unrelated servers and permission rules.

## Rollback

Close the Tabyra panel and stop its backend before rolling back program files. Install an earlier compatible VSIX using the same extension ID. App installer backups are under `~/.gemini/config/tabyra-backups/`; restore plugin files and, if needed, the saved configuration after stopping the sidecar. Retain the current profile directory. Never restore live Chromium profile databases over a running browser.
