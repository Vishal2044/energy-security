declare module 'bcryptjs' {
  export function hash(value: string, rounds: number): Promise<string>;
  export function compare(value: string, hash: string): Promise<boolean>;
}

declare module 'node-cron' {
  export function schedule(expression: string, handler: () => void): unknown;
}

declare module 'web-push' {
  const webPush: any;
  export default webPush;
}

declare module 'pngjs' {
  export class PNG {
    static sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } };
  }
}
