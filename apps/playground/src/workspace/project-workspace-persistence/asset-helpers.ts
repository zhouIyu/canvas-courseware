import type {
  CoursewareDocument,
  DiagnosticLogContext,
  DiagnosticLogger,
} from "@canvas-courseware/core";
import {
  collectProjectAssetIdsFromDocument,
  hydrateProjectDocumentAssetSources,
  removeProjectAssets,
} from "../../projects/project-assets";
import type { ProjectRecord } from "../../projects/types";

/** 资产辅助逻辑需要的诊断能力。 */
export interface WorkspacePersistenceAssetDiagnostics {
  /** 统一日志上下文构造器。 */
  buildDiagnosticContext: (context?: DiagnosticLogContext) => DiagnosticLogContext;
  /** 工作台统一诊断 logger。 */
  diagnosticLogger: DiagnosticLogger;
}

/** 项目加载阶段的资源恢复结果，供工作台同时刷新文档与用户提示。 */
export interface WorkspaceProjectHydrationResult {
  /** 已恢复为当前运行态可直接消费的文档。 */
  document: CoursewareDocument;
  /** 当前文档里引用但仓库中已经缺失的本地资产 id。 */
  missingAssetIds: string[];
  /** 本轮成功恢复的本地资产来源数量。 */
  restoredAssetCount: number;
}

/** 计算一次保存后已经不再被项目引用的旧资产 id，供后台异步清理使用。 */
export function resolveRemovedWorkspaceAssetIds(
  previousDocument: CoursewareDocument | null | undefined,
  nextAssetIds: string[],
): string[] {
  if (!previousDocument) {
    return [];
  }

  const nextAssetIdSet = new Set(nextAssetIds);
  return collectProjectAssetIdsFromDocument(previousDocument).filter(
    (assetId) => !nextAssetIdSet.has(assetId),
  );
}

/** 保存成功后异步清理已经失效的旧资产，避免把清理失败误判成保存失败。 */
export async function cleanupRemovedWorkspaceAssets(
  assetIds: string[],
  diagnostics: WorkspacePersistenceAssetDiagnostics,
): Promise<void> {
  if (assetIds.length === 0) {
    return;
  }

  try {
    await removeProjectAssets(assetIds);
  } catch (error) {
    diagnostics.diagnosticLogger.warn({
      event: "project.asset.cleanup.failed",
      message: "项目保存成功，但旧图片资产清理失败",
      context: diagnostics.buildDiagnosticContext({
        assetCount: assetIds.length,
      }),
      error,
    });
  }
}

/** 加载项目时优先恢复本地资产引用，失败时回退到仓库原始文档。 */
export async function hydrateWorkspaceProjectDocument(
  projectRecord: ProjectRecord,
  diagnostics: WorkspacePersistenceAssetDiagnostics,
): Promise<WorkspaceProjectHydrationResult> {
  try {
    const hydrationResult = await hydrateProjectDocumentAssetSources(
      projectRecord.document,
      projectRecord.id,
    );

    if (hydrationResult.missingAssetIds.length > 0) {
      diagnostics.diagnosticLogger.warn({
        event: "project.asset.hydrate.partial",
        message: "部分本地图片资产缺失，已保留原始引用等待后续处理",
        context: diagnostics.buildDiagnosticContext({
          missingAssetCount: hydrationResult.missingAssetIds.length,
          restoredAssetCount: hydrationResult.restoredAssetCount,
        }),
      });
    }

    return hydrationResult;
  } catch (error) {
    diagnostics.diagnosticLogger.error({
      event: "project.asset.hydrate.failed",
      message: "本地图片资产恢复失败，已回退到仓库内的原始文档",
      context: diagnostics.buildDiagnosticContext(),
      error,
    });

    return {
      document: projectRecord.document,
      missingAssetIds: [],
      restoredAssetCount: 0,
    };
  }
}

/** 导出前尽量把内部图片资产引用还原成标准 data URL，保证导出的 JSON 可独立使用。 */
export async function resolveWorkspaceExportDocument(
  projectRecord: ProjectRecord,
): Promise<CoursewareDocument> {
  const hydrationResult = await hydrateProjectDocumentAssetSources(
    projectRecord.document,
    projectRecord.id,
  );

  if (hydrationResult.missingAssetIds.length > 0) {
    throw new Error(
      `当前项目有 ${hydrationResult.missingAssetIds.length} 个本地图片资源缺失，暂时无法导出标准 JSON。`,
    );
  }

  return hydrationResult.document;
}
