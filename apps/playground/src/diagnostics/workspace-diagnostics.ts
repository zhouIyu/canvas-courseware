import {
  createDiagnosticLogger,
  type DiagnosticLogEntry,
} from "@canvas-courseware/core";

/** 开发态挂到 `window` 上的统一诊断桥接键名。 */
const WORKSPACE_DIAGNOSTICS_KEY = "__CW_DIAGNOSTICS__" as const;

/** 当前页面挂在浏览器全局上的诊断桥接结构。 */
interface WorkspaceDiagnosticsBridge {
  /** 读取最近保留的结构化日志。 */
  getEntries: () => readonly DiagnosticLogEntry[];
  /** 清空当前内存中的最近日志。 */
  clear: () => void;
}

/** 带有开发态诊断桥接能力的浏览器全局对象。 */
type WorkspaceDiagnosticsWindow = Window & {
  [WORKSPACE_DIAGNOSTICS_KEY]?: WorkspaceDiagnosticsBridge;
};

/** 避免重复打印开发态查看提示。 */
let hasAnnouncedDiagnosticsBridge = false;

/** 工作台共享的轻量诊断 logger 单例。 */
export const workspaceDiagnosticLogger = createDiagnosticLogger({
  scope: "workspace",
  maxEntries: 120,
  enableConsole: import.meta.env.DEV,
});

/** 在开发态把最近日志查看能力挂到浏览器全局，便于排障与自动化读取。 */
export function attachWorkspaceDiagnosticsBridge(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  (window as WorkspaceDiagnosticsWindow)[WORKSPACE_DIAGNOSTICS_KEY] = {
    getEntries: () => workspaceDiagnosticLogger.getEntries(),
    clear: () => workspaceDiagnosticLogger.clear(),
  };

  if (hasAnnouncedDiagnosticsBridge) {
    return;
  }

  hasAnnouncedDiagnosticsBridge = true;
  console.info(
    "[cw-diagnostics] 可通过 window.__CW_DIAGNOSTICS__.getEntries() 查看最近日志。",
  );
}

/** 页面卸载时回收开发态桥接，避免旧实例残留到后续页面。 */
export function detachWorkspaceDiagnosticsBridge(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  delete (window as WorkspaceDiagnosticsWindow)[WORKSPACE_DIAGNOSTICS_KEY];
}
