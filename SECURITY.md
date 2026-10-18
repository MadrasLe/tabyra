# Security and permission scope

Report vulnerabilities privately to **abrakasfrosken@gmail.com**. Include affected versions, steps to reproduce, expected/actual behavior and redacted diagnostics. Do not put tokens, cookies or account data in a public issue. No guaranteed response or fix deadline is offered for this beta.

## Boundaries

- The MCP bridge listens on `127.0.0.1`, requires a random session credential and refuses browser-origin requests and foreign Host headers. Its client never follows HTTP redirects with command data.
- The embedded Chromium process is launched with its sandbox enabled on every supported operating system. Windows is validated; macOS/Linux remain experimental. Connected Chrome retains the normal browser process configuration.
- Chrome pairing uses a local page and a single-use key valid for two minutes. The helper exchanges it for a saved reconnect credential. Credentials are not intended for chat messages or public logs.
- Chrome control checks the dedicated window. It is not an OS sandbox and the normal Chrome profile is not isolated from its own accounts.
- Arbitrary page JavaScript runs in an isolated world with access to the DOM. It is not Node.js and cannot use Node filesystem APIs. It is not a complete sandbox for all web side effects.
- A timeout preserves the page. Tracked resources are cleaned up; requests already accepted by external servers are not undone. Workers, sockets and deliberately escaped APIs do not have comprehensive cancellation guarantees.
- Page text and images are untrusted data. They cannot authorize new actions, broaden tool access or override the human's instructions.
- Panel state messages from unrelated origins are ignored; the IDE's same-origin host frame and local App events remain supported. The App accepts host theme events only from its embedding parent or its own document and validates their CSS variable structure before the host preload handles them.

## Review scope

Browser 0.7.1 / App 0.6.1 contain fixes from a source review with attack reproductions for the local bridge, Chrome handshake, panel messaging and embedded process configuration. Regression tests cover the fixes. This is a maintainer review, not an independent audit, penetration-test certification or guarantee of absence of vulnerabilities.

The transport protects against unauthenticated access; it does not isolate Tabyra from malicious software already running with your OS account's privileges. Such software may read local credentials or alter program files. Browser-only JavaScript isolation is not an operating-system sandbox for the editor extension or Node backend. The sidecar server and preload are supplied by the installed Antigravity SDK and require host updates independently of Tabyra.

## Chrome permissions

`debugger` supplies CDP control, native input and inspection; `tabs` identifies dedicated-window tabs; `storage` retains pairing; `alarms` retries connection. Site access supports shared-page screenshots and the loopback pairing content script. The helper is powerful: only connect it to a trusted Tabyra installation and AI client. Chrome displays its own debugger banner; dismissing it releases control.

All extension logic is bundled. Runtime page evaluation uses the Debugger API in its documented role; it is not an extension-side eval loader. Chrome Web Store acceptance remains a separate review. See the [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).

## Host permissions

MCP approval is governed by the host. The public App installer preserves settings by default. `--allow-tools` is an explicit opt-in for this plugin only and refuses conflicting Ask/Deny rules. Eager loading is discovery behavior, not approval. Organization policies still apply.

Keep browser profiles and discovery files private, install only trusted releases, and verify the SHA-256 checksums included with a release. A checksum detects mismatched bytes; it is not a signature or a guarantee of safety.
