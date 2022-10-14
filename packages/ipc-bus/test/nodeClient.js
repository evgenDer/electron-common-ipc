const minimist = require('minimist');

// busPath
let args = minimist(process.argv.slice(1));
let timeoutDelay = 30000;
if (args.busTimeout) {
    timeoutDelay = parseInt(args.busTimeout);
}
let ipcBusPath = 0;
if (args.busPath) {
    ipcBusPath = parseInt(args.busPath);
}
if (isNaN(ipcBusPath)) {
    ipcBusPath = args.busPath;
}

const ipcBusModule = require('../lib/index');
const ipcClient = ipcBusModule.CreateIpcBusClient();
ipcClient.connect(ipcBusPath, { peerName: 'client Node', timeoutDelay })
    .then(() => {
        ipcClient.on('test-message', (event, ...args) => {
            console.log(`test-message event=${event}, args=${args}`);
            process.send(JSON.stringify({ event: event, args: args }));
        });
        ipcClient.on('test-request', (event, ...args) => {
            console.log(`test-request event=${event}, args=${args}`);
            if (event.request) {
                event.request.resolve(args[0]);
            }
        });
        process.send(JSON.stringify({ resolve: true }));
    })
    .catch((err) => {
        process.send(JSON.stringify({ reject: true, error: err }));
    });

    // Keep process alive
    process.stdin.on("data", () => {});