import { singleton } from 'tsyringe';

import { IPlatformService, PlatformInfo } from './IPlatformService';

/** Bản browser — chỉ dùng Web API tiêu chuẩn. */
@singleton()
export class WebPlatformService implements IPlatformService {
  public readonly isDesktop = false;

  public getInfo(): Promise<PlatformInfo> {
    return Promise.resolve({
      label: 'Web (browser)',
      details: [
        { name: 'Origin', value: window.location.origin },
        { name: 'Ngôn ngữ hệ thống', value: navigator.language },
        { name: 'User agent', value: navigator.userAgent },
      ],
    });
  }

  public openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer');
    return Promise.resolve();
  }
}
