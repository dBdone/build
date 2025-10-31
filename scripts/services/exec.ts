import { execa } from 'execa';
export async function sh(cmd: string, args: string[], opts: any = {}) {
  return execa(cmd, args, { stdio: 'inherit', shell: false, ...opts });
}

