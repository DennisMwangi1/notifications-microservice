import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { AppLogMeta } from './app-logger.service';

@Injectable()
export class RequestContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<AppLogMeta>();

  run<T>(initialContext: AppLogMeta, callback: () => T): T {
    return this.asyncLocalStorage.run(initialContext, callback);
  }

  getStore(): AppLogMeta | undefined {
    return this.asyncLocalStorage.getStore();
  }

  set(key: string, value: unknown): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      (store as any)[key] = value;
    }
  }
}
