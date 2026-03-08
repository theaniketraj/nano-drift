#!/usr/bin/env node
import { program } from 'commander';
import { DaemonServer } from './server';

program
    .name('nano-drift-daemon')
    .description('Nano Drift build & ADB orchestration daemon')
    .option('-p, --port <number>', 'WebSocket port to listen on', '27183')
    .parse(process.argv);

const opts = program.opts<{ port: string }>();
const port = parseInt(opts.port, 10);

const server = new DaemonServer(port);

server.start()
    .then(() => {
        console.log(`[nano-drift-daemon] Listening on ws://127.0.0.1:${port}`);
    })
    .catch((err: Error) => {
        console.error('[nano-drift-daemon] Failed to start:', err.message);
        process.exit(1);
    });

process.on('SIGINT', () => {
    console.log('[nano-drift-daemon] Shutting down…');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    server.stop();
    process.exit(0);
});
