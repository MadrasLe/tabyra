import net from 'node:net';

/** The Windows node shim can outlive its language-server parent. */
export function watchHostLifetime(address: string, onLost: () => void) {
  const endpoint = new URL(address.includes('://') ? address : 'http://' + address);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || !endpoint.port || !['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('O endereço do host Antigravity precisa ser local e conter a porta.');
  }
  const host = endpoint.hostname.replace(/^\[|\]$/g, '');
  const port = Number(endpoint.port);
  const parentPid = process.ppid;
  let stopped = false, failures = 0;
  let timer: NodeJS.Timeout | undefined;
  let pending: net.Socket | undefined;
  const stop = () => { stopped = true; clearTimeout(timer); pending?.destroy(); pending = undefined; };
  const lost = () => { if (!stopped) { stop(); onLost(); } };
  const check = async () => {
    if (stopped) return;
    try { process.kill(parentPid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { lost(); return; } }
    const alive = await new Promise<boolean>(resolve => {
      const socket = net.createConnection({ host, port }); pending = socket;
      const finish = (value: boolean) => { socket.destroy(); if (pending === socket) pending = undefined; resolve(value); };
      socket.setTimeout(750);
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.once('timeout', () => finish(false));
      socket.once('close', () => resolve(false));
    });
    if (stopped) return;
    failures = alive ? 0 : failures + 1;
    if (failures >= 2) { lost(); return; }
    timer = setTimeout(() => { void check(); }, 1500); timer.unref();
  };
  timer = setTimeout(() => { void check(); }, 1500); timer.unref();
  return stop;
}
