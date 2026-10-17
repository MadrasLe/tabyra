import { BrowserController, startBridge } from './core';
let controller: BrowserController | undefined;
let bridge: Awaited<ReturnType<typeof startBridge>> | undefined;
let stopping: Promise<void> | undefined;
let starting: Promise<unknown> | undefined;
const send = (message: unknown) => { if (process.connected) process.send?.(message); };
function close() {
  if (stopping) return stopping;
  stopping = (async () => {
    const browserClosed = controller?.close();
    await starting?.catch(() => {});
    await Promise.all([bridge?.close(), browserClosed]);
  })();
  return stopping;
}
process.on('disconnect', () => { void close().finally(() => process.exit(0)); });
process.on('message', async (message: any) => {
  try {
    let result: unknown;
    if (message.method === 'start') {
      if (controller) throw new Error('Navegador já iniciado.');
      controller = new BrowserController(message.args.options);
      controller.on('changed', () => send({ event: 'changed' }));
      controller.on('notice', data => send({ event: 'notice', data }));
      controller.on('activity', data => send({ event: 'activity', data }));
      starting = (async () => {
        await controller!.start();
        if (stopping) throw new Error('Inicialização cancelada pelo encerramento.');
        bridge = await startBridge(controller!, message.args.discoveryFile);
        return controller!.state();
      })();
      result = await starting;
    } else if (message.method === 'close') {
      await close(); result = { closed: true };
    } else {
      if (!controller) throw new Error('Navegador não iniciado.');
      if (message.method === 'state') result = await controller.state();
      else if (message.method === 'capture') result = await controller.capture(message.args.quality);
      else if (message.method === 'call') result = await controller.call(message.args.method, message.args.args);
      else throw new Error('Operação inválida.');
    }
    send({ id: message.id, result });
    if (message.method === 'close' && process.connected) process.disconnect?.();
  } catch (error) { send({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
});
