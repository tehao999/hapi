/**
 * Runner doctor utilities
 * 
 * Process discovery and cleanup functions for the runner
 * Helps diagnose and fix issues with hung or orphaned processes
 */

import psList from 'ps-list';
import { killProcess } from '@/utils/process';

const DEFAULT_PROCESS_COMMAND_MAX_LENGTH = 240;
const SENSITIVE_VALUE_FLAGS = new Set(['--payload', '--initial-message', '--message', '--prompt']);
const SAFE_VALUE_FLAGS = new Set([
  '--cwd',
  '--directory',
  '--effort',
  '--hapi-agent',
  '--hapi-starting-mode',
  '--model',
  '--model-reasoning-effort',
  '--permission-mode',
  '--resume',
  '--service-tier',
  '--session',
  '--worktree-name'
]);
const SAFE_POSITIONAL_TOKENS = new Set([
  'auth',
  'claude',
  'codex',
  'cursor',
  'doctor',
  'gemini',
  'hapi',
  'happy',
  'node',
  'opencode',
  'runner',
  'src/index.ts',
  'start',
  'start-sync',
  'status',
  'stop'
]);

export type ProcessCommandSanitizeOptions = {
  maxLength?: number;
};

export type FindHappyProcessesOptions = {
  fullArgs?: boolean;
};

function tokenizeCommand(command: string): string[] {
  return command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function commandTokenLooksSafe(token: string, index: number): boolean {
  const bare = stripQuotes(token);
  if (index === 0) {
    return true;
  }
  if (SAFE_POSITIONAL_TOKENS.has(bare)) {
    return true;
  }
  return bare.endsWith('/hapi') || bare.endsWith('/hapi.exe') || bare.endsWith('/bun') || bare.endsWith('/node');
}

function splitFlag(token: string): { flag: string; inlineValue: string | null } {
  const equalsIndex = token.indexOf('=');
  if (equalsIndex < 0) {
    return { flag: token, inlineValue: null };
  }
  return {
    flag: token.slice(0, equalsIndex),
    inlineValue: token.slice(equalsIndex + 1)
  };
}

function pushRedactedPositional(output: string[]): void {
  if (output[output.length - 1] !== '<arg>') {
    output.push('<arg>');
  }
}

export function sanitizeProcessCommand(command: string, options: ProcessCommandSanitizeOptions = {}): string {
  const maxLength = Math.max(40, options.maxLength ?? DEFAULT_PROCESS_COMMAND_MAX_LENGTH);
  const tokens = tokenizeCommand(command.replace(/\s+/g, ' ').trim());
  if (tokens.length === 0) {
    return '';
  }

  const output: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = stripQuotes(tokens[i] ?? '');
    if (!token) continue;

    if (token.startsWith('--')) {
      const { flag, inlineValue } = splitFlag(token);

      if (flag === '--started-by') {
        if (inlineValue === 'runner') {
          output.push('--started-by=runner', '<redacted>');
        } else if (tokens[i + 1] && stripQuotes(tokens[i + 1]) === 'runner') {
          output.push('--started-by', 'runner', '<redacted>');
          i += 1;
        } else {
          output.push('--started-by', '<redacted>');
        }
        break;
      }

      if (SENSITIVE_VALUE_FLAGS.has(flag)) {
        output.push(inlineValue === null ? `${flag} <redacted>` : `${flag}=<redacted>`);
        while (tokens[i + 1] && !stripQuotes(tokens[i + 1]).startsWith('--')) {
          i += 1;
        }
        continue;
      }

      if (SAFE_VALUE_FLAGS.has(flag)) {
        if (inlineValue !== null) {
          output.push(`${flag}=${stripQuotes(inlineValue)}`);
        } else {
          output.push(flag);
          if (tokens[i + 1] && !stripQuotes(tokens[i + 1]).startsWith('--')) {
            output.push(stripQuotes(tokens[i + 1]));
            i += 1;
          }
        }
        continue;
      }

      output.push(inlineValue === null ? flag : `${flag}=<redacted>`);
      while (tokens[i + 1] && !stripQuotes(tokens[i + 1]).startsWith('--')) {
        i += 1;
      }
      continue;
    }

    if (commandTokenLooksSafe(token, i)) {
      output.push(token);
    } else {
      pushRedactedPositional(output);
    }
  }

  const sanitized = output.join(' ');
  if (sanitized.length > maxLength) {
    return `${sanitized.slice(0, maxLength).trimEnd()}… [truncated; use --full-args]`;
  }

  return sanitized;
}

/**
 * Find all HAPI CLI processes (including current process)
 */
export async function findAllHappyProcesses(options: FindHappyProcessesOptions = {}): Promise<Array<{ pid: number, command: string, type: string }>> {
  try {
    const processes = await psList();
    const allProcesses: Array<{ pid: number, command: string, type: string }> = [];
    
    for (const proc of processes) {
      const cmd = proc.cmd || '';
      const name = proc.name || '';
      
      // Check if it's a HAPI process
      const isHappyBinary = name === 'hapi' || name === 'hapi.exe' || /\bhapi(\.exe)?\b/.test(cmd);
      // Dev mode: running via bun/node with src/index.ts (production uses compiled binary)
      const isDevMode = cmd.includes('src/index.ts');
      const isHappy = name.includes('happy') ||
                      name === 'node' && cmd.includes('happy-cli') ||
                      cmd.includes('happy-coder') ||
                      isHappyBinary ||
                      isDevMode;
      
      if (!isHappy) continue;

      // Classify process type
      let type = 'unknown';
      if (proc.pid === process.pid) {
        type = 'current';
      } else if (cmd.includes('--version')) {
        type = isDevMode ? 'dev-runner-version-check' : 'runner-version-check';
      } else if (cmd.includes('runner start-sync') || cmd.includes('runner start')) {
        type = isDevMode ? 'dev-runner' : 'runner';
      } else if (cmd.includes('--started-by runner')) {
        type = isDevMode ? 'dev-runner-spawned' : 'runner-spawned-session';
      } else if (cmd.includes('doctor')) {
        type = isDevMode ? 'dev-doctor' : 'doctor';
      } else if (cmd.includes('--yolo')) {
        type = 'dev-session';
      } else {
        type = isDevMode ? 'dev-related' : 'user-session';
      }

      const rawCommand = cmd || name;
      allProcesses.push({
        pid: proc.pid,
        command: options.fullArgs ? rawCommand : sanitizeProcessCommand(rawCommand),
        type
      });
    }

    return allProcesses;
  } catch (error) {
    return [];
  }
}

/**
 * Find all runaway HAPI CLI processes that should be killed
 */
export async function findRunawayHappyProcesses(): Promise<Array<{ pid: number, command: string }>> {
  const allProcesses = await findAllHappyProcesses();
  
  // Filter to just runaway processes (excluding current process)
  return allProcesses
    .filter(p => 
      p.pid !== process.pid && (
        p.type === 'runner' ||
        p.type === 'dev-runner' ||
        p.type === 'runner-spawned-session' ||
        p.type === 'dev-runner-spawned' ||
        p.type === 'runner-version-check' ||
        p.type === 'dev-runner-version-check'
      )
    )
    .map(p => ({ pid: p.pid, command: p.command }));
}

/**
 * Kill all runaway HAPI CLI processes
 */
export async function killRunawayHappyProcesses(): Promise<{ killed: number, errors: Array<{ pid: number, error: string }> }> {
  const runawayProcesses = await findRunawayHappyProcesses();
  const errors: Array<{ pid: number, error: string }> = [];
  let killed = 0;
  
  for (const { pid, command } of runawayProcesses) {
    try {
      console.log(`Killing runaway process PID ${pid}: ${command}`);
      
      await killProcess(pid, false);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if still alive
      const processes = await psList();
      const stillAlive = processes.find(p => p.pid === pid);
      if (stillAlive) {
        console.log(`Process PID ${pid} ignored termination request, using force kill`);
        await killProcess(pid, true);
      }
      
      console.log(`Successfully killed runaway process PID ${pid}`);
      killed++;
    } catch (error) {
      const errorMessage = (error as Error).message;
      errors.push({ pid, error: errorMessage });
      console.log(`Failed to kill process PID ${pid}: ${errorMessage}`);
    }
  }

  return { killed, errors };
}
