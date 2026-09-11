import { BrowserWindow, Notification } from 'electron'

/** Push an event to every renderer window (used for progress / job updates). */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

export function notifyUser(title: string, body: string): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return
  try {
    new Notification({ title, body }).show()
  } catch {
    /* notification not available — fail silently */
  }
}
