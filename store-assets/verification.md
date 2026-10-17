# Tabyra beta verification · 17 October 2026

Windows verification for Browser 0.7.0, App 0.6.0 and Connect 0.3.0:

- TypeScript check and production builds passed.
- Automated coverage includes 60 scenarios for the App, browser, MCP, JavaScript budgets/cancellation, authentication, reconnect, Monaco, installer migration and archive guards. A complete 60/60 run passed before the final viewport adjustment.
- The final viewport adjustment retains the size chosen before Chrome connects. App integration and connected-Chrome checks cover the corrected initialization and the capture dimensions.
- A later complete run encountered a transient 2.5-second manual-login capture timeout. Running the IDE host and Chrome tests together also produced time-sensitive failures under local load. Those failures are not erased from this report.
- After closing the other test host, the final connected-Chrome suite passed **8/8** in **18.5 seconds**, including manual login, unchanged tabs/cookies, saved reconnection and JavaScript timeout preservation. The capture budget was not increased to obtain this result.
- Real extension-host smoke tests passed in **Antigravity IDE (VS Code API 1.107.0)** and **VS Code 1.137.0**: commands, tabs, pause, MCP configuration in each host's format, actual stdio tool calls and shutdown. Disposable editor profiles were used.
- Distribution checks passed for the VSIX and both ZIPs, including privacy/support documents, icons, compatibility IDs, bundled installer and license inventory. No personal browser profile, discovery file, development log or machine-specific user path was included by these checks.

The App installer was tested on a clean profile, an existing JSONC configuration and an upgrade fixture retaining profile bytes, saved pairing and pause/preferences. The bundled installer ran from a separate folder without a source checkout or development node_modules.

Actual panel screenshots use a local test fixture without personal accounts. Windows is the beta target; macOS/Linux, individual websites, account access and store acceptance are not established by these tests. Manual-mode captures can fail transiently under load and the visible panel retries them on later polls.
