# Tabyra security review — 17 October 2026

Scope: Browser 0.7.0 / App 0.6.0 source and bundled dependencies, with fixes prepared for Browser **0.7.1** / App **0.6.1**. Tabyra Connect's executable code and manifest permissions are unchanged at **0.3.0**.

This is a maintainer source review with executable attack reproductions and regression checks. It is not an independent audit, certification or exhaustive penetration test.

## Findings and corrections

| Boundary | Observed issue | Correction and verification |
| --- | --- | --- |
| Embedded Chromium process | Only Linux explicitly enabled Chromium sandboxing. Playwright adds `--no-sandbox` when `chromiumSandbox` is not true, including on Windows. No renderer exploit was attempted. | Explicitly enable the sandbox on all platforms. A Windows integration test reads the real browser process command line and checks that `--no-sandbox` is absent. Windows operation remains covered by the browser tests; macOS/Linux runtime compatibility is not established by that test. |
| Chrome WebSocket handshake | A JSON `null` first message reached property access outside the parse guard, allowing a local unauthenticated protocol client to crash the relay. Ordinary websites are separately excluded by Origin checks. | Validate the initial object before reading properties. Regression runs the relay in a child process and sends malformed JSON values, expecting refusal while the process stays alive. |
| Loopback Host validation | The WebSocket upgrade accepted a foreign Host header with an otherwise valid extension Origin and credential. The HTTP MCP bridge also lacked a Host check. This did not bypass their credential requirements. | Require the actual `127.0.0.1:port` Host on both transports. Regression checks foreign-Host refusal; the normal pairing and browser paths remain covered. |
| Local MCP HTTP client | Fetch followed a 307 redirect, forwarding the command JSON to the redirected server. A malicious local endpoint or reused discovery port would be required; this was not a remote website authentication bypass. | Reject all redirects. A real stdio MCP test uses two local HTTP servers and confirms the destination receives no command body. |
| Panel messaging | A foreign opener with a window reference could send a state message that the panel rendered as if supplied by the host. The App host preload also accepted unvalidated theme events. | Reject unrelated cross-origin state sources, while allowing the IDE's same-origin frame and local App events. Run an App capture guard before the host preload to validate theme structure and reject unrelated windows. Real browser tests check rejected spoofing, malformed messages and working legitimate state/theme events, including the IDE's masked-parent behavior. |

Additional hardening bounds pending unauthenticated handshakes and terminates silent peers, validates reported Chrome tab metadata, suppresses App referrers and prevents HTML base/form targets in the panel's CSP. These changes do not remove browser tools or insert per-action approval prompts.

## Preserved behavior

All **16 MCP tools**, arbitrary page JavaScript, the existing operation budgets, native input, editor support and connected Chrome remain available. The review does not alter host approval rules, account profiles, saved pairing or the user's browser sessions.

## Verification

The targeted transport, redirect, panel messaging and real process-sandbox regression tests passed after their fixes. The same attack reproductions failed against the prior implementation. One initial sandbox assertion using `Browser.getBrowserCommandLine` was unavailable in the installed Chromium; the regression instead reads the process command line identified through `SystemInfo.getProcessInfo`.

Final `npm run check` passed. The final `npm test` run passed **66/66 tests**, with **0 failures, cancellations or skips**, in **194.6 seconds**. This includes the installed sidecar lifecycle, browser/App UI, foreign-message and same-origin host-frame cases, Chrome pairing/reconnection/manual login, session persistence, JavaScript cancellation, real Python Monaco, MCP, installer migration and new attack regressions. Foreign HTTP Host tests use `http.request`, because the installed Node fetch replaces a caller-supplied Host header with the URL's authority.

`npm audit --json` reported **zero known dependency advisories** on the reviewed lockfile on 17 October 2026. This does not assess all first-party logic or prove the absence of undisclosed vulnerabilities.

The real extension-host smoke checks passed in **Antigravity IDE 1.107.0** and **Visual Studio Code 1.137.0**, each running Browser **0.7.1** in a disposable profile. They exercised activation, launcher/commands, tabs, pause/resume, screenshots, authenticated bridge access, the host-specific MCP configuration, a real stdio MCP JavaScript call and shutdown/discovery cleanup.

`npm run release` built the Browser VSIX and App/Connect ZIPs. Archive checks passed for all three packages, including version/identity checks and exclusions for private sessions, credentials and development artifacts. The archived browser panel, worker and MCP bundles were compared byte-for-byte with the reviewed build; the App's backend, panel, guard and MCP bundle were also checked. SHA-256 checksums accompany the release.

The local Browser **0.7.1** and App **0.6.1** installations were verified against the reviewed runtime files. Pre/post configuration fingerprints confirmed that existing permission grants and unrelated MCP servers remained unchanged. The App installer backed up the previous plugin; the IDE MCP path repair backed up the configuration it changed. Loading the updated code requires an editor/App reload.

The public [patch release](https://github.com/MadrasLe/tabyra/releases/tag/v0.7.1-beta.1) was uploaded to GitHub, then its VSIX and ZIP assets were downloaded again and matched against the release SHA-256 hashes. The [source-check workflow](https://github.com/MadrasLe/tabyra/actions/runs/39087897135) also passed on GitHub for security commit `56312ce4155f8eb92b4c00d14caad59108a091f4`. Open VSX also activated Browser **0.7.1**: its anonymous version API and public VSIX download were verified, and the downloaded package SHA-256 matched the reviewed release. See [distribution status](../PUBLISHING.md).

## Remaining trust boundaries

The IDE extension and Node backend run with the OS user's privileges. Malicious software running as that user may read credentials or modify files; a loopback token is not isolation from the same OS account. Connected Chrome uses the regular browser profile. A dedicated window is an application scope, not a separate account or OS sandbox.

The AI client and model remain trusted operators for authorized browser actions. Page JavaScript is isolated from Node APIs but can produce web effects and read page-accessible data; managed cancellation cannot recall requests already accepted by another server. The Antigravity sidecar SDK and preload are external host components and require independent host updates. OS/browser vulnerabilities, third-party websites, compromised model providers and exhaustive installer/file-system race testing are outside this review's coverage.
