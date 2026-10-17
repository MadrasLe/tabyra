# Tabyra privacy policy

Effective: 17 October 2026. Maintainer: Gabriel Yogi. Contact: [abrakasfrosken@gmail.com](mailto:abrakasfrosken@gmail.com).

This policy covers Tabyra Browser, Tabyra for Antigravity App and Tabyra Connect. They were previously branded Elektron. The stable internal identifiers still use that name.

## What is processed

Tabyra displays browser images and forwards authorized human or AI actions. Its MCP tools can return page URLs, titles, visible text, interactive-element descriptions, screenshots and JavaScript results. Inputs supplied to tools may contain personal data. Page content and screenshots can expose information from signed-in services. JavaScript results can include data available to page scripts; avoiding input values in snapshots does not make all browser tools free of sensitive data.

MCP results are sent to the AI client you configure. That client may send them to a remote model provider under its own terms and privacy policy. Tabyra does not supply a model, guarantee local AI processing or control the provider's retention settings.

## Local storage

The embedded browser keeps cookies and site storage in a persistent local Chromium profile: per workspace in the IDE, or under `~/.gemini/elektron-app` in the App. Preferences and session discovery files are also local. Discovery files contain local authentication credentials and should not be shared.

Connected Chrome uses your existing Chrome profile. The helper stores a local reconnect credential and temporary connection/window status through Chrome extension storage. It does not export your Chrome password database or copy the profile's cookie jar into Tabyra. Chrome and websites continue to manage their own account sessions.

The host may keep diagnostic logs, conversations and tool results. Local error logs can contain URLs or action details. Installation backups preserve program files and configuration; users decide when to remove them.

## Network and sharing

Visited websites receive normal browser requests, including account cookies as managed by Chrome. The helper/backend transport and MCP bridge bind to loopback and authenticate local requests. Tabyra has no developer-operated collection service, advertising endpoint or built-in analytics/telemetry uploader in this release. Chrome, your editor, AI client and websites have independent network activity and policies.

Tabyra does not sell data or intentionally send browsing content to the maintainer. If you email diagnostics, that message and its attachments are handled through the email service and used to respond to your request. Do not include passwords, cookies, tokens or complete browser profiles.

## Control and retention

Pause blocks later agent calls; it does not undo completed actions. Interromper stops an active managed JavaScript call, but cannot recall a request already received by a website. Disconnecting the Chrome helper detaches control while keeping Chrome tabs open. Its Disconnect action removes the saved helper connection; uninstalling it clears its extension storage.

Embedded profiles remain until you remove them. Deleting a profile removes its local cookies and logins. Tabyra does not automatically delete your provider's conversation history or data held by visited websites. Review those services separately.

## Scope and updates

The helper checks that controlled tabs belong to its dedicated window. The Chrome permissions remain broader than that application-level scope. Review [SECURITY.md](SECURITY.md) for the limitations. Policy changes will be included with future releases. Contact the maintainer for privacy questions or correction/removal of diagnostics you voluntarily supplied.
