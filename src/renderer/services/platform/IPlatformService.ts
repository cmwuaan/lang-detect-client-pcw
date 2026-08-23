export interface PlatformDetail {
  name: string;
  value: string;
}

export interface PlatformInfo {
  /** Nhãn ngắn hiển thị trên UI. */
  label: string;
  details: PlatformDetail[];
}

/**
 * Trừu tượng hoá phần khác nhau giữa bản web và bản desktop. UI chỉ gọi
 * interface này, không bao giờ chạm `window.electronAPI` trực tiếp.
 */
export interface IPlatformService {
  readonly isDesktop: boolean;
  getInfo(): Promise<PlatformInfo>;
  openExternal(url: string): Promise<void>;
}
