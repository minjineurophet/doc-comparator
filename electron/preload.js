'use strict';

// Minimal preload — contextIsolation is enabled and nodeIntegration is disabled.
// The Next.js app communicates entirely through its own HTTP API routes,
// so no IPC bridge is needed at this time.
// Add contextBridge.exposeInMainWorld() calls here if desktop-specific
// features (e.g. native file dialogs, auto-update status) are added later.
