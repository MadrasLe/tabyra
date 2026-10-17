# Tabyra beta · Browser 0.7.0 / App 0.6.0 / Connect 0.3.0

Elektron Browser is now **Tabyra**: one browser shared by you and your AI.

- Consistent branding, panel labels and new icons.
- Existing extension IDs, profiles, pairing and approval rules remain compatible.
- IDE setup generates the correct MCP format for VS Code or Antigravity.
- The App ZIP includes a standalone installer; fresh installations do not add automatic MCP approval unless explicitly requested.
- Privacy, support, security, migration and dependency-license documents accompany the packages.

The browser uses the same tabs for human and agent input. Chrome pairing is saved, JavaScript timeouts preserve tabs, and active JavaScript calls can be interrupted from the panel.

**Windows beta.** macOS/Linux are experimental. The editor/App and Chrome helper are separate packages. See README, PRIVACY, SUPPORT and MIGRATION before installing. AI accounts and website sessions are supplied by their respective providers.

Install the editor VSIX through Install from VSIX. Extract the App ZIP and run `node install.mjs`, or extract the Chrome ZIP and load it unpacked during the beta. Verify the downloaded packages against SHA256SUMS.txt. No store approval is implied by this release.

Support: **abrakasfrosken@gmail.com**.

Verification includes 60 automated scenarios and real extension-host checks in Antigravity IDE and VS Code. See [the detailed validation report](https://github.com/MadrasLe/tabyra/blob/main/store-assets/verification.md), including transient capture-timeout findings. The final connected-Chrome suite passed 8/8; this is not a claim that every final check passed in a single full-suite run.
