# Tabyra beta distribution

Brand: **Tabyra**. Products: **Tabyra Browser** (IDE), **Tabyra** (Antigravity App), **Tabyra Connect** (Chrome helper). Author/support: Gabriel Yogi, **abrakasfrosken@gmail.com**.

The stable extension identity is `gabrielyogi.elektron-browser`; the App plugin remains `elektron-app`. These are intentional compatibility IDs, not unfinished display-name changes. [Migration](MIGRATION.md).

Project: https://github.com/MadrasLe/tabyra. Public privacy policy: https://github.com/MadrasLe/tabyra/blob/main/PRIVACY.md. Support: https://github.com/MadrasLe/tabyra/blob/main/SUPPORT.md. The repository and these public pages are available.

## Submission status — 17 October 2026

- The public [security update](https://github.com/MadrasLe/tabyra/releases/tag/v0.7.1-beta.1), Browser **0.7.1** / App **0.6.1**, is available for download. Published VSIX/ZIP bytes were downloaded and checked against the release SHA-256 hashes. Connect's executable code remains **0.3.0**.
- [Tabyra Browser **0.7.1** is publicly available on Open VSX](https://open-vsx.org/extension/gabrielyogi/elektron-browser), published by **MadrasLe** under `gabrielyogi.elektron-browser`. The anonymous version API and VSIX download were verified; the downloaded VSIX SHA-256 matches the reviewed release package. Registry review/activation is complete for this patch. The VSIX is a pre-release.
- The public listing displays **Verified publisher**. The publisher agreement was signed and the `gabrielyogi` namespace was created and verified.
- The namespace request [EclipseFdn/open-vsx.org#14363](https://github.com/EclipseFdn/open-vsx.org/issues/14363) is closed. The public listing was checked after activation; the earlier Deactivated state is resolved.
- VS Code Marketplace and Chrome Web Store submissions remain pending.

The [security review](store-assets/security-review-2026-10-17.md) records the fixes, **66/66** final automated tests, real Antigravity/VS Code host checks, zero known dependency advisories, distribution checks and preserved local permission settings. GitHub's source-check workflow also passed for the security commit.

## Reviewable assets

Run `npm ci`, `npm run check`, `npm test`, then `npm run release`. Also run `node scripts/smoke-antigravity.mjs` against each intended desktop host executable. Host smoke tests use disposable profiles, never personal browser accounts. The release directory contains the IDE VSIX, App/Connect ZIPs, privacy/support/migration documents, SHA256SUMS and an archive-check report. Source development logs and personal validation notes are excluded.

Review the 256 px store icon, Chrome 16/32/48/128 px icons, and screenshots. Any screenshots used in a listing must be actual Tabyra UI or explicitly labeled promotional material; no account data or invented product behavior.

## VS Code Marketplace

Create or use a publisher account for `gabrielyogi`. A manifest field does not register or verify that account. Submit the prepared pre-release VSIX through the publisher dashboard or authenticated vsce. Configure the real repository/homepage once available, and use its public support/privacy URLs. [Official guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

Suggested title: **Tabyra Browser**. Short description: **A browser shared by you and your AI, inside your editor.** Mark Windows as validated, macOS/Linux as experimental, and disclose that an MCP client/model account is separate.

## Open VSX / Antigravity IDE

Create the `gabrielyogi` namespace, complete the publisher agreement and use an authenticated ovsx account to upload the same VSIX. Claim ownership through Open VSX's process if verification is desired. Do not use a token in shell history or commit credentials. The local Antigravity IDE inspected for this project uses Open VSX; distribution catalogs can differ by editor/version. [Official guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions).

## Antigravity App

The standalone ZIP includes a bundled `install.mjs`. Test the extracted package on a clean user profile and an existing installation. `node install.mjs` preserves approval settings; `--allow-tools` explicitly grants this MCP only. Do not advertise a store installation until it has actually been accepted.

The official App catalog is curated and provides an interest form for listings. A code repository or downloadable ZIP can be distributed independently, but the custom sidecar installation flow still needs to be disclosed. [Marketplace guide](https://www.antigravity.google/docs/marketplace).

## Chrome Web Store

Submit `tabyra-connect-0.3.0.zip`, supply the real public privacy-policy URL, support contact, icons/screenshots and review instructions. The store requires a developer account and review; do not accept new agreements or pay registration fees without the account owner's involvement. [Publishing guide](https://developer.chrome.com/docs/webstore/publish).

Single purpose: **Share one dedicated window of the user's Chrome profile with Tabyra and an authorized MCP agent.** The package supplies no model and has no developer-operated telemetry endpoint. Page data can reach the user's AI provider through MCP; do not label this as fully local AI.

Permission justifications:

- `debugger`: CDP inspection, native input, screenshot capture and authorized page evaluation in the dedicated window. Chrome's debugger banner is expected. Dismissing it releases control.
- `tabs`: identify and manage dedicated-window tabs; other Chrome windows are excluded by runtime checks.
- `storage`: keep the local reconnect credential and temporary connection/window status.
- `alarms`: retry connecting to the local backend.
- Host access: capture the user-selected dedicated window across websites and load the loopback pairing content script. The manifest's broad permission must be disclosed even though the runtime scope is narrower.

All helper code is bundled. Authorized page evaluation uses the Debugger API, whose documented exception does not eliminate other store requirements. [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).

Reviewer flow: install the editor VSIX or App package; open Tabyra; select connected Chrome; click Connect Chrome; confirm a local public test page appears in the panel; ask an MCP client to inspect it; pause, enter manual mode, resume, and disconnect. No private Google account or paid AI account is required to verify the human panel and helper connection; MCP agent testing needs a compatible client. Never provide personal account credentials as review fixtures.

## Release checklist

Record actual test/host results and archive checks before uploading. Verify namespace ownership, repository visibility, support/privacy links and listing screenshots. Name suggestions and search results are not formal trademark clearance. Store acceptance and signed publisher accounts are separate from successful local packaging.
