// The process runner the scripts share, on its own so a lib that wants it
// does not have to carry the database helpers too: cutover.mjs runs git and
// tar through it, the scripts their catalog commands.
import { spawn } from 'node:child_process';

/**
 * Run a command and collect its output. `detached` puts it in a process group
 * of its own, so a Ctrl-C meant for the calling script does not kill it
 * halfway through: the script's signal handler decides what stops, and in
 * what order. `onSpawn` is handed the child the moment it exists, for a
 * handler that has to forward a signal to it.
 */
export function exec(command, args, { env = process.env, cwd, input, onSpawn } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    onSpawn?.(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) => resolve({ status: null, signal: null, stdout, stderr: `${stderr}${error.message}` }));
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
  });
}
