// Hằng số esbuild `define` nhúng vào bundle main process.
declare const __DEV__: boolean;
/** URL renderer dev server; chuỗi rỗng khi build production. */
declare const __DEV_SERVER_URL__: string;

interface Window {
  /** Do src/main/preload.ts expose; undefined khi chạy bản web. */
  electronAPI?: import('./shared/ipc').ElectronAPI;
}
