declare module 'sidecar_sdk' {
  import type { Server } from 'node:http';
  export class Response {
    constructor(body: string | Buffer, options?: { contentType?: string; status?: number; headers?: Record<string, string> });
  }
  export class SidecarApp {
    page(path: string, handler: () => string | Response | Promise<string | Response>): void;
    api(path: string, handler: (data: Record<string, any>) => unknown, method?: string): void;
    run(): Promise<Server>;
    close(): Promise<void>;
  }
}
