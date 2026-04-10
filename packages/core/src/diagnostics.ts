import { COMMAND_TYPES, type EditorCommand } from "./commands";

/** 诊断日志允许记录的基础上下文字段值类型。 */
export type DiagnosticLogValue = string | number | boolean | null;

/** 一条诊断日志允许挂载的上下文字段集合。 */
export type DiagnosticLogContext = Record<string, DiagnosticLogValue | undefined>;

/** 诊断日志支持的日志级别。 */
export type DiagnosticLogLevel = "debug" | "info" | "warn" | "error";

/** 对外暴露的诊断错误摘要。 */
export interface DiagnosticLogError {
  /** 错误名称。 */
  name: string;
  /** 错误消息。 */
  message: string;
  /** 当前错误的堆栈信息。 */
  stack?: string;
}

/** 内存中保留的一条结构化诊断日志。 */
export interface DiagnosticLogEntry {
  /** 当前日志的唯一 id。 */
  id: string;
  /** 当前日志归属的逻辑 scope。 */
  scope: string;
  /** 当前日志的事件名。 */
  event: string;
  /** 当前日志的可读说明。 */
  message: string;
  /** 当前日志的级别。 */
  level: DiagnosticLogLevel;
  /** 当前日志生成时间。 */
  timestamp: string;
  /** 当前日志携带的最小上下文。 */
  context: Record<string, DiagnosticLogValue>;
  /** 当前日志携带的错误摘要。 */
  error?: DiagnosticLogError;
}

/** 调用 logger 时允许传入的结构化输入。 */
export interface DiagnosticLogPayload {
  /** 当前日志的事件名。 */
  event: string;
  /** 当前日志的可读说明。 */
  message: string;
  /** 当前日志携带的最小上下文。 */
  context?: DiagnosticLogContext;
  /** 当前日志关联的异常对象。 */
  error?: unknown;
}

/** 创建 logger 时允许配置的基础选项。 */
export interface DiagnosticLoggerOptions {
  /** 当前 logger 归属的逻辑 scope。 */
  scope?: string;
  /** 内存中最多保留多少条最近日志。 */
  maxEntries?: number;
  /** 是否同步输出到控制台。 */
  enableConsole?: boolean;
}

/** 最近日志列表变化时对外暴露的订阅回调。 */
export type DiagnosticLogListener = (entries: readonly DiagnosticLogEntry[]) => void;

/** 首批关键链路命令的诊断描述。 */
export interface CommandDiagnosticDescriptor {
  /** 当前命令应记录的事件名。 */
  event: string;
  /** 当前命令对应的说明文案。 */
  message: string;
  /** 当前命令推荐使用的日志级别。 */
  level: DiagnosticLogLevel;
  /** 当前命令建议补充的上下文字段。 */
  context?: DiagnosticLogContext;
}

/** 默认最多保留的日志条数。 */
const DEFAULT_MAX_LOG_ENTRIES = 120;

/** 默认的 logger scope 名称。 */
const DEFAULT_LOG_SCOPE = "courseware";

/** 递增序号，保证同毫秒内的日志 id 仍然唯一。 */
let diagnosticEntrySequence = 0;

/** 轻量内存诊断 logger，统一承接结构化日志输出、内存保留和订阅。 */
export class DiagnosticLogger {
  /** 当前 logger 归属的逻辑 scope。 */
  private readonly scope: string;
  /** 当前 logger 最多保留的最近日志条数。 */
  private readonly maxEntries: number;
  /** 当前是否同步输出到控制台。 */
  private readonly enableConsole: boolean;
  /** 当前内存里保留的最近日志。 */
  private readonly entries: DiagnosticLogEntry[] = [];
  /** 最近日志变化时的订阅回调集合。 */
  private readonly listeners = new Set<DiagnosticLogListener>();

  constructor(options: DiagnosticLoggerOptions = {}) {
    this.scope = options.scope ?? DEFAULT_LOG_SCOPE;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_LOG_ENTRIES;
    this.enableConsole = options.enableConsole ?? false;
  }

  /** 记录一条 debug 级诊断日志。 */
  debug(payload: DiagnosticLogPayload): DiagnosticLogEntry {
    return this.log("debug", payload);
  }

  /** 记录一条 info 级诊断日志。 */
  info(payload: DiagnosticLogPayload): DiagnosticLogEntry {
    return this.log("info", payload);
  }

  /** 记录一条 warn 级诊断日志。 */
  warn(payload: DiagnosticLogPayload): DiagnosticLogEntry {
    return this.log("warn", payload);
  }

  /** 记录一条 error 级诊断日志。 */
  error(payload: DiagnosticLogPayload): DiagnosticLogEntry {
    return this.log("error", payload);
  }

  /** 返回当前内存中保留的最近日志快照。 */
  getEntries(): readonly DiagnosticLogEntry[] {
    return [...this.entries];
  }

  /** 清空当前 logger 内存中的所有最近日志。 */
  clear(): void {
    this.entries.length = 0;
    this.emitEntries();
  }

  /** 订阅最近日志列表变化，便于开发态查看入口实时刷新。 */
  subscribe(listener: DiagnosticLogListener): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => this.listeners.delete(listener);
  }

  /** 统一创建并写入一条结构化诊断日志。 */
  private log(level: DiagnosticLogLevel, payload: DiagnosticLogPayload): DiagnosticLogEntry {
    const entry: DiagnosticLogEntry = {
      id: createDiagnosticEntryId(),
      scope: this.scope,
      event: payload.event,
      message: payload.message,
      level,
      timestamp: new Date().toISOString(),
      context: sanitizeDiagnosticContext(payload.context),
      error: normalizeDiagnosticError(payload.error),
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    if (this.enableConsole) {
      writeDiagnosticEntryToConsole(entry);
    }

    this.emitEntries();
    return entry;
  }

  /** 把最新的日志列表快照统一广播给所有订阅者。 */
  private emitEntries(): void {
    const snapshot = this.getEntries();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

/** 创建一份新的轻量诊断 logger。 */
export function createDiagnosticLogger(options: DiagnosticLoggerOptions = {}): DiagnosticLogger {
  return new DiagnosticLogger(options);
}

/** 把标准命令映射成首批关键链路所需的诊断描述。 */
export function describeEditorCommand(
  command: EditorCommand,
): CommandDiagnosticDescriptor | null {
  switch (command.type) {
    case COMMAND_TYPES.SLIDE_CREATE:
      return {
        event: "slide.create",
        message: "已创建页面",
        level: "info",
        context: {
          slideId: command.slide.id,
        },
      };
    case COMMAND_TYPES.SLIDE_UPDATE:
      return command.patch.background
        ? {
            event: "background.write",
            message: "已写入当前页面背景配置",
            level: "info",
            context: {
              slideId: command.slideId,
              hasBackgroundImage: Boolean(command.patch.background.image?.src?.trim()),
              backgroundFit: command.patch.background.image?.fit ?? null,
            },
          }
        : {
            event: "slide.update",
            message: "已更新页面基础信息",
            level: "info",
            context: {
              slideId: command.slideId,
            },
          };
    case COMMAND_TYPES.SLIDE_DELETE:
      return {
        event: "slide.delete",
        message: "已删除页面",
        level: "warn",
        context: {
          slideId: command.slideId,
        },
      };
    case COMMAND_TYPES.SLIDE_REORDER:
      return {
        event: "slide.reorder",
        message: "已调整页面顺序",
        level: "info",
        context: {
          slideId: command.slideId,
          targetIndex: command.index,
        },
      };
    case COMMAND_TYPES.NODE_CREATE:
      return {
        event: "node.create",
        message: "已创建组件",
        level: "info",
        context: {
          slideId: command.slideId,
          nodeId: command.node.id,
          nodeType: command.node.type,
        },
      };
    case COMMAND_TYPES.NODE_IMAGE_SET_AS_BACKGROUND:
      return {
        event: "background.set-from-node",
        message: "已将图片组件设为页面背景",
        level: "info",
        context: {
          slideId: command.slideId,
          nodeId: command.nodeId,
          fit: command.fit ?? null,
        },
      };
    case COMMAND_TYPES.NODE_BATCH_DELETE:
      return {
        event: "node.batch.delete",
        message: "已批量删除组件",
        level: "warn",
        context: {
          slideId: command.slideId,
          nodeCount: command.nodeIds.length,
        },
      };
    case COMMAND_TYPES.NODE_DELETE:
      return {
        event: "node.delete",
        message: "已删除组件",
        level: "warn",
        context: {
          slideId: command.slideId,
          nodeId: command.nodeId,
        },
      };
    case COMMAND_TYPES.NODE_REORDER:
      return {
        event: "node.reorder",
        message: "已调整组件层级",
        level: "info",
        context: {
          slideId: command.slideId,
          nodeId: command.nodeId,
          position: command.position,
        },
      };
    case COMMAND_TYPES.TIMELINE_STEP_UPSERT:
      return {
        event: "timeline.changed",
        message: "已新增或更新时间轴步骤",
        level: "info",
        context: {
          slideId: command.slideId,
          stepId: command.step.id,
          changeType: "step.upsert",
          triggerType: command.step.trigger.type,
          actionCount: command.step.actions.length,
        },
      };
    case COMMAND_TYPES.TIMELINE_STEP_REMOVE:
      return {
        event: "timeline.changed",
        message: "已删除时间轴步骤",
        level: "warn",
        context: {
          slideId: command.slideId,
          stepId: command.stepId,
          changeType: "step.remove",
        },
      };
    case COMMAND_TYPES.TIMELINE_STEP_REORDER:
      return {
        event: "timeline.changed",
        message: "已调整时间轴步骤顺序",
        level: "info",
        context: {
          slideId: command.slideId,
          stepId: command.stepId,
          changeType: "step.reorder",
          targetIndex: command.index,
        },
      };
    case COMMAND_TYPES.TIMELINE_ANIMATION_UPSERT:
      return {
        event: "timeline.changed",
        message: "已新增或更新时间轴动画",
        level: "info",
        context: {
          slideId: command.slideId,
          animationId: command.animation.id,
          changeType: "animation.upsert",
          targetId: command.animation.targetId,
          animationKind: command.animation.kind,
        },
      };
    case COMMAND_TYPES.TIMELINE_ANIMATION_REMOVE:
      return {
        event: "timeline.changed",
        message: "已删除时间轴动画",
        level: "warn",
        context: {
          slideId: command.slideId,
          animationId: command.animationId,
          changeType: "animation.remove",
        },
      };
    case COMMAND_TYPES.HISTORY_UNDO:
      return {
        event: "history.undo",
        message: "已执行撤销",
        level: "info",
      };
    case COMMAND_TYPES.HISTORY_REDO:
      return {
        event: "history.redo",
        message: "已执行重做",
        level: "info",
      };
    default:
      return null;
  }
}

/** 为诊断日志生成一条稳定且可读的唯一 id。 */
function createDiagnosticEntryId(): string {
  diagnosticEntrySequence += 1;
  return `diag-${Date.now()}-${diagnosticEntrySequence}`;
}

/** 统一规整上下文字段，过滤 `undefined` 并把异常值转成可序列化结果。 */
function sanitizeDiagnosticContext(
  context: DiagnosticLogContext | undefined,
): Record<string, DiagnosticLogValue> {
  if (!context) {
    return {};
  }

  const normalizedContext: Record<string, DiagnosticLogValue> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) {
      continue;
    }

    normalizedContext[key] = Number.isNaN(value) ? null : value;
  }

  return normalizedContext;
}

/** 把任意异常对象规整成统一的错误摘要，避免日志层直接持有复杂对象。 */
function normalizeDiagnosticError(error: unknown): DiagnosticLogError | undefined {
  if (!error) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

/** 在开发态把结构化日志同步输出到控制台，便于快速排查。 */
function writeDiagnosticEntryToConsole(entry: DiagnosticLogEntry): void {
  const prefix = `[cw-diagnostics][${entry.level}] ${entry.event}`;
  const printablePayload = {
    message: entry.message,
    context: entry.context,
    error: entry.error,
    timestamp: entry.timestamp,
  };

  switch (entry.level) {
    case "debug":
      console.debug(prefix, printablePayload);
      break;
    case "warn":
      console.warn(prefix, printablePayload);
      break;
    case "error":
      console.error(prefix, printablePayload);
      break;
    case "info":
    default:
      console.info(prefix, printablePayload);
      break;
  }
}
