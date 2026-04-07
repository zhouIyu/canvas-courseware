# Test Directory

`test/` 用于存放仓库内可复用、可追踪的自动化测试代码。

## 目录约定

- `test/shared/`
  放公共运行时、浏览器工具函数和可复用辅助方法。
- `test/<feature-point>/`
  按当前功能点、版本点或缺陷编号拆分测试脚本。
  例如：
  - `test/vnext-10/round-01.mjs`
  - `test/vnext-11/round-01.mjs`
  - `test/vnext-12/round-01.mjs`

## 输出约定

- 自动化测试代码放在 `test/`
- 测试报告继续放在 `docs/test-reports/`
- 截图、JSON 快照和运行摘要继续放在 `docs/test-reports/assets/`

## 当前脚本

- `pnpm test:vnext-10`
- `pnpm test:vnext-11`
- `pnpm test:vnext-12`
- `pnpm test:vnext-13`
- `pnpm test:vnext-14`

## 运行前提

- 本地开发服务已启动，并可访问 `http://127.0.0.1:32173/projects`
- 仓库依赖已安装完成

## 后续新增测试

- 新测试脚本必须优先写入 `test/`，不要再临时散落到 `tmp/`、仓库根目录或业务源码目录。
- 新脚本应按当前功能点创建子目录，并保持“一个功能点 / 一个轮次脚本”的结构，便于回归和复用。
