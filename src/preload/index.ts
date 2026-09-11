import { contextBridge, ipcRenderer } from 'electron'

/**
 * Minimal, safe bridge. The renderer is treated as untrusted UI: it only gets a
 * generic `invoke` (IPC request) and `on` (event subscription). No Node APIs,
 * no filesystem, no secrets. Typed wrappers live in the renderer's lib/api.ts.
 */
const snifferBridge = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('sniffer', snifferBridge)
