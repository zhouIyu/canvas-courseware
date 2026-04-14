import type { CoursewareNode } from "../schema";

/** 运行时解析过程中统一使用的未知对象类型。 */
export type UnknownRecord = Record<string, unknown>;

/**
 * 读取并断言某个值是普通对象。
 * 只要拿到数组、`null` 或基础类型，都会直接抛出路径明确的错误。
 */
export function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} 必须是一个对象。`);
  }

  return value as UnknownRecord;
}

/**
 * 读取并断言某个字段是数组。
 * 这个帮助函数让数组路径的错误提示更稳定，也方便统一 `map` 校验。
 */
export function readArray(value: UnknownRecord, key: string, path: string): unknown[] {
  const targetValue = value[key];

  if (!Array.isArray(targetValue)) {
    throw new Error(`${path} 必须是一个数组。`);
  }

  return targetValue;
}

/**
 * 读取并断言某个字段是字符串。
 * 字符串允许为空，但不允许缺失、`null` 或其他基础类型。
 */
export function readString(value: UnknownRecord, key: string, path: string): string {
  const targetValue = value[key];

  if (typeof targetValue !== "string") {
    throw new Error(`${path} 必须是字符串。`);
  }

  return targetValue;
}

/**
 * 读取一个可选字符串字段。
 * 如果字段不存在则返回 `undefined`，否则仍然要求它是字符串。
 */
export function readOptionalString(
  value: UnknownRecord,
  key: string,
  path: string,
): string | undefined {
  const targetValue = value[key];

  if (targetValue === undefined) {
    return undefined;
  }

  if (typeof targetValue !== "string") {
    throw new Error(`${path} 必须是字符串。`);
  }

  return targetValue;
}

/**
 * 读取一个可选的字符串或数字字段。
 * 该逻辑主要给文本节点的 `fontWeight` 这类宽松字段使用。
 */
export function readOptionalStringOrNumber(
  value: UnknownRecord,
  key: string,
  path: string,
): string | number | undefined {
  const targetValue = value[key];

  if (targetValue === undefined) {
    return undefined;
  }

  if (typeof targetValue !== "string" && typeof targetValue !== "number") {
    throw new Error(`${path} 必须是字符串或数字。`);
  }

  return targetValue;
}

/**
 * 读取并断言某个字段是有限数字。
 * 可选地支持最小值和最大值限制，避免尺寸、透明度之类的字段越界。
 */
export function readNumber(
  value: UnknownRecord,
  key: string,
  path: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number {
  const targetValue = value[key];

  if (typeof targetValue !== "number" || !Number.isFinite(targetValue)) {
    throw new Error(`${path} 必须是有限数字。`);
  }

  if (targetValue < minimum || targetValue > maximum) {
    throw new Error(`${path} 必须在 ${minimum} 到 ${maximum} 之间。`);
  }

  return targetValue;
}

/**
 * 读取一个可选数字字段。
 * 字段不存在时直接返回 `undefined`，存在时继续复用统一的数值边界校验。
 */
export function readOptionalNumber(
  value: UnknownRecord,
  key: string,
  path: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number | undefined {
  if (value[key] === undefined) {
    return undefined;
  }

  return readNumber(value, key, path, minimum, maximum);
}

/**
 * 读取并断言某个字段是布尔值。
 * 这个方法主要用于节点的可见和锁定状态字段。
 */
export function readBoolean(value: UnknownRecord, key: string, path: string): boolean {
  const targetValue = value[key];

  if (typeof targetValue !== "boolean") {
    throw new Error(`${path} 必须是布尔值。`);
  }

  return targetValue;
}

/**
 * 读取并断言某个字段属于指定枚举值集合。
 * 这样可以把 union 类型的运行时校验集中到一处维护。
 */
export function readEnum<TValue extends string>(
  value: UnknownRecord,
  key: string,
  path: string,
  allowedValues: readonly TValue[],
): TValue {
  const targetValue = value[key];

  if (typeof targetValue !== "string" || !allowedValues.includes(targetValue as TValue)) {
    throw new Error(`${path} 必须是 ${allowedValues.join(" / ")} 之一。`);
  }

  return targetValue as TValue;
}

/**
 * 读取一个可选枚举字段。
 * 缺失时返回 `undefined`，存在时仍然执行与必填字段相同的合法性校验。
 */
export function readOptionalEnum<TValue extends string>(
  value: UnknownRecord,
  key: string,
  path: string,
  allowedValues: readonly TValue[],
): TValue | undefined {
  if (value[key] === undefined) {
    return undefined;
  }

  return readEnum(value, key, path, allowedValues);
}

/**
 * 单独读取节点类型，方便节点分支解析之前先完成一次基础约束。
 */
export function readNodeType(value: UnknownRecord, path: string): CoursewareNode["type"] {
  return readEnum<CoursewareNode["type"]>(value, "type", path, ["text", "image", "rect"]);
}
