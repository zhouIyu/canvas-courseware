import type { DiagnosticLogger } from "@canvas-courseware/core";
import { inject, provide, type InjectionKey } from "vue";

/** 编辑器内部共享的诊断 logger 注入键。 */
const coursewareDiagnosticLoggerKey: InjectionKey<DiagnosticLogger | null> = Symbol(
  "courseware-diagnostic-logger",
);

/** 在编辑器组件树内提供统一的诊断 logger。 */
export function provideCoursewareDiagnosticLogger(
  diagnosticLogger: DiagnosticLogger | null | undefined,
): void {
  provide(coursewareDiagnosticLoggerKey, diagnosticLogger ?? null);
}

/** 在编辑器组件树内读取当前共享的诊断 logger。 */
export function useCoursewareDiagnosticLogger(): DiagnosticLogger | null {
  return inject(coursewareDiagnosticLoggerKey, null);
}
