const { ChromeRelay } = require('../../dist/core.cjs');
const relay = new ChromeRelay(process.argv[2]);
const stop = () => relay.close().finally(() => process.exit(0));
process.on('message', stop);
process.on('disconnect', stop);
relay.start().then(() => {
  process.send({ port: Number(new URL(JSON.parse(relay.pairing()).endpoint).port) });
}).catch(error => { console.error(error); process.exitCode = 1; });
