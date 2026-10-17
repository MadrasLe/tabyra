import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';

export class AlreadyRunningError extends Error {
  constructor() { super('Outra instância do Tabyra App já controla este perfil. Reutilize o painel aberto.'); }
}

/** Kernel-owned lock: Windows releases the named pipe even if the owner crashes. */
export async function acquireInstance(dataDir: string, waitMs = 0) {
  const identity = path.resolve(dataDir);
  const hash = createHash('sha256').update(process.platform === 'win32' ? identity.toLowerCase() : identity).digest('hex').slice(0, 24);
  const socket = process.platform === 'win32' ? `\\\\.\\pipe\\elektron-app-${hash}` : path.join(os.tmpdir(), `elektron-app-${hash}.sock`);
  const server = net.createServer(connection => connection.destroy());
  const listen = () => new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, () => { server.off('error', reject); resolve(); });
  });
  const deadline = Date.now() + waitMs;
  for (;;) {
    try { await listen(); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      if (process.platform !== 'win32') {
        const alive = await new Promise<boolean>(resolve => {
          const probe = net.connect(socket);
          probe.setTimeout(500);
          probe.once('connect', () => { probe.destroy(); resolve(true); });
          probe.once('error', () => { probe.destroy(); resolve(false); });
          probe.once('timeout', () => { probe.destroy(); resolve(true); });
        });
        if (!alive) {
          await rm(socket, { force: true });
          try { await listen(); break; } catch { /* A concurrent owner may have acquired it. */ }
        }
      }
      if (Date.now() >= deadline) throw new AlreadyRunningError();
      await new Promise(resolve => setTimeout(resolve, Math.min(250, deadline - Date.now())));
    }
  }
  let closing: Promise<void> | undefined;
  return { close() { return closing ??= new Promise<void>(resolve => server.close(() => resolve())); } };
}
