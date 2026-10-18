# Tabyra security update · Browser 0.7.1 / App 0.6.1

This update repairs five security boundaries without removing AI tools or adding approval prompts:

- Enable Chromium process sandboxing on Windows and macOS as well as Linux.
- Refuse malformed unauthenticated Chrome handshakes without crashing the backend; limit pending handshakes and release silent peers.
- Validate loopback Host headers on the Chrome transport and MCP bridge.
- Reject HTTP redirects from the local MCP client so commands cannot be forwarded to another endpoint.
- Reject panel state from unrelated origins and validate App theme messages before the host preload handles them. Preserve IDE frame messaging and normal host themes.

App responses now suppress referrers, and the panel CSP forbids HTML base/form targets. All **16 MCP tools**, arbitrary page JavaScript, existing time budgets, profiles, saved pairing and approval settings remain available. Tabyra Connect's executable code and permissions remain at **0.3.0**; users already on that helper do not need to reinstall it for this patch.

Install Browser **0.7.1** or App **0.6.1**, then reload the editor/App to load the new code. The App ZIP includes `install.mjs`; run `node install.mjs` after extracting it. The installer preserves existing approval rules and creates an upgrade backup.

Read the [security review and verification report](https://github.com/MadrasLe/tabyra/blob/main/store-assets/security-review-2026-10-17.md). This is a maintainer review, not independent certification. Windows is validated; macOS/Linux remain experimental. Dependencies had no known advisories in `npm audit` at review time.

Support and private vulnerability reports: **abrakasfrosken@gmail.com**. Verify downloads against the included `SHA256SUMS.txt`.
