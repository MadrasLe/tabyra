# Tabyra Connect · beta 0.3.0

Tabyra Connect shares a dedicated window of your regular Chrome profile with Tabyra Browser or the App edition. It keeps the normal Chrome user agent and WebDriver flags unchanged; it does not disguise browser identity or bypass site checks.

## Install once

During the beta, extract `tabyra-connect-0.3.0.zip` to a permanent folder. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked** and select that folder. Store publication is a separate review process; an unpacked beta is not a Chrome Web Store listing.

Existing users should keep their current helper folder and update its files there, then reload the existing extension card. Loading a different folder may create a separate extension identity and lose the helper's saved pairing. Chrome accounts remain in the Chrome profile.

The IDE also provides a stable helper folder through **Chrome → Primeiro acesso ou atualizar extensão → Copiar pasta da extensão**. The App helper is inside its installed plugin. Select the intended Chrome profile before installing.

## Connect

1. In Tabyra, select **Chrome conectado · suas contas**.
2. Click **Conectar Chrome**. A local page passes a one-time key to the helper.
3. Return to Tabyra after it confirms the connection. The helper stores the reconnect credential in that Chrome profile; there is no JSON to paste in the normal flow.

Restarting only the Tabyra backend reconnects the same shared tabs. Reloading the helper or restarting Chrome clears the temporary window identifier; the button can open a new dedicated window. Previous tabs remain in Chrome. Old pairing JSON is accepted in the compatibility section.

## Login and human control

Choose **Fazer login no Chrome** to pause the agent and detach the debugger. Complete login directly in Chrome, then choose **Já terminei · Retomar painel**. Disconnected Chrome tabs remain open. Websites may still request CAPTCHA, reject a browser or expire a session; the helper cannot guarantee account access.

Tabyra Connect can interact with the dedicated window only. Other windows are excluded by the helper's window checks. This is an application boundary, not a separate OS account or an isolation boundary for the Chrome profile.

## Permissions and data

The helper uses `debugger` for Chrome DevTools control, `tabs` for the dedicated window, `storage` for pairing, and `alarms` for reconnect attempts. Site access is used for shared-page capture and the local pairing content script. The permissions are powerful and the supported scope is disclosed in [PRIVACY.md](PRIVACY.md).

Traffic between the helper and Tabyra uses authenticated loopback WebSocket connections. Page text, screenshots, selected elements and tool results can reach your AI provider through the MCP client. Tabyra does not supply an AI account or promise that AI processing happens locally.

Support: [abrakasfrosken@gmail.com](mailto:abrakasfrosken@gmail.com).
