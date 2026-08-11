import { spawn } from 'child_process';

export function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: { timeoutMs?: number; inheritStdio?: boolean } = {},
): Promise<{ stdout: string; stderr: string; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
      stdio: options.inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 120000;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      const output = stdout + (stderr ? `${stdout ? '\n' : ''}${stderr}` : '');
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
        return;
      }
      if (code && code !== 0) {
        const err = new Error(output || `Command failed with exit code ${code}: ${command} ${args.join(' ')}`) as Error & {
          stdout?: string;
          stderr?: string;
          code?: number | null;
        };
        err.stdout = stdout;
        err.stderr = stderr;
        err.code = code;
        reject(err);
        return;
      }
      resolve({ stdout, stderr, output });
    });
  });
}

export async function runNpm(args: string[], cwd: string, timeoutMs = 120000): Promise<string> {
  return (await runCommand(npmCommand(), args, cwd, { timeoutMs })).output;
}
