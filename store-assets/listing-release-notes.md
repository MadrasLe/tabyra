# Tabyra Browser 0.7.2 — clearer product guide

This release improves the extension listing and documentation. Browser behavior, permissions and all 16 MCP tools are unchanged from 0.7.1.

- New English and Portuguese descriptions explain practical workflows, embedded versus connected Chrome, setup for VS Code/Antigravity, and example agent requests.
- Direct installation/download links and real panel screenshots make the first steps easier to follow.
- Developer-console access is documented precisely: `browser_evaluate` supports isolated DOM JavaScript and returns function results/errors. Console history, general page errors, network request inspection, breakpoints and a DevTools panel are not currently MCP tools.
- App **0.6.1** and Connect **0.3.0** remain compatible and do not need updating for this documentation release. Their packages remain available in the [0.7.1 release](https://github.com/MadrasLe/tabyra/releases/tag/v0.7.1-beta.1).

Install the VSIX through **Extensions → Install from VSIX…**, or update through Open VSX once the version is available there. Existing profiles, pairing and approval rules are preserved. Windows is the validated beta platform; macOS/Linux remain experimental.

Support: **abrakasfrosken@gmail.com**. Verify the package against `SHA256SUMS.txt`.

Validation: TypeScript check and VSIX packaging passed, alongside **5/5** targeted security/distribution tests. Archive checks confirm the current documentation (with vsce's repository-link rewrites), valid local documentation links and exclusion of private/development files. The browser worker, editor extension, panel scripts and Chrome helper code/permissions match 0.7.1 byte-for-byte. The only MCP runtime source change is its reported editor version. A full browser regression suite was not rerun for this documentation update.
