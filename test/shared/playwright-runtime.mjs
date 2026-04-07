import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Playwright 在 pnpm 虚拟仓中的安装目录名称前缀。 */
const PLAYWRIGHT_PACKAGE_PREFIX = "playwright@";

/**
 * 解析当前仓库中实际可用的 Playwright ESM 入口。
 * 仓库没有把 Playwright 声明为顶层依赖，因此这里需要主动到 pnpm 虚拟仓中查找。
 *
 * @param {string} rootDir
 * @returns {Promise<string>}
 */
async function resolvePlaywrightModulePath(rootDir = process.cwd()) {
  const pnpmStoreDir = path.resolve(rootDir, "node_modules/.pnpm");
  const packageEntries = await fs.readdir(pnpmStoreDir);
  const playwrightEntries = packageEntries
    .filter((entry) => entry.startsWith(PLAYWRIGHT_PACKAGE_PREFIX))
    .sort()
    .reverse();

  for (const entry of playwrightEntries) {
    const modulePath = path.join(
      pnpmStoreDir,
      entry,
      "node_modules/playwright/index.mjs",
    );

    try {
      await fs.access(modulePath);
      return modulePath;
    } catch {
      // 继续尝试下一项已安装版本。
    }
  }

  throw new Error("未找到可用的 Playwright 运行时，请先确认依赖已安装");
}

/**
 * 加载当前仓库可用的 Chromium 启动器。
 *
 * @param {string} rootDir
 * @returns {Promise<import("playwright").BrowserType>}
 */
export async function loadChromium(rootDir = process.cwd()) {
  const modulePath = await resolvePlaywrightModulePath(rootDir);
  const playwrightModule = await import(pathToFileURL(modulePath).href);
  return playwrightModule.chromium;
}
