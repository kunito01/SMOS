<p align="center">
  <img src="./app/icon.svg" width="104" alt="Studio Map OS 标志" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>创意项目操作系统</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong> · 日本語 · Español · Português · Deutsch · Français · Русский · Türkçe · 한국어 · ไทย
</p>

<p align="center">
  <strong>让一个人的工作室，像一支完整团队一样运转。</strong><br />
  面向独立创作者与一人公司的本地优先可视化项目操作系统。
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="GitHub Stars" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="GitHub Forks" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="GitHub Issues" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-可安装-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="可安装 PWA" />
  <img src="https://img.shields.io/badge/数据-本地优先-e9e5df?style=flat-square" alt="本地优先数据" />
</p>

---

## 项目简介

Studio Map OS 将品牌、项目组、项目、人员、软件工具、成本、时间表、发布节点和归档统一到一个可视化工作区中，帮助独立创作者管理多个并行项目，而不必把创作过程压缩成普通的任务清单。

当前版本是一个可安装的本地优先 PWA：业务数据保存在本机，经 Web Crypto 加密后写入 IndexedDB；Manifest、Service Worker、离线回退页、应用图标和独立打包流程均已接入。账户、恢复密钥与备份流程也在浏览器端完成，但项目尚未接入远程业务后端或服务器认证。

## 核心能力

| 项目运营 | 本地数据管理 |
| --- | --- |
| 按全部项目、品牌或项目组查看工作室全局状态 | 本地账户与工作区恢复密钥 |
| 项目状态、阶段、任务、时间表与发布节点 | 加密的 IndexedDB 工作区数据 |
| 分阶段预算、收款计划与多币种成本汇总 | 整站、单工作区和单项目加密备份 |
| 人员、软件订阅与成本模板资源库 | 旧版浏览器数据迁移与恢复回滚 |
| 项目归档、恢复和永久删除 | 可控制字段的只读分享快照 |
| 桌面、平板与窄屏移动端布局 | 可安装 PWA、离线回退与十一种界面语言 |

## 主要功能

- **品牌与项目组**：建立不同业务品牌，并用可复用的项目组类型组织项目。
- **项目工作区**：管理项目状态、阶段、目标、任务、人员、工具、素材、版本和活动记录。
- **可视化时间表**：按项目配置阶段周期、任务、负责人、工具、备注和自定义行。
- **结构化预算**：按阶段录入人员、差旅、日常支出、外包、额外成本和软件费用，并计算税费与预备金。
- **成本与收款**：汇总预算、实际成本、软件订阅和项目收款计划。
- **资源库**：维护人员、软件工具、订阅信息和可复用成本模板。
- **归档与可移植性**：归档项目，导出单项目文件，或备份整个浏览器中的 Studio Map OS 数据。
- **只读分享**：按项目选择可公开的时间表、交付物、人员、工具、素材、版本和成本预览。
- **多语言界面**：支持英语、简体中文、日语、西班牙语、葡萄牙语、德语、法语、俄语、土耳其语、韩语和泰语。

## 技术栈

- Next.js 15（App Router）
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB 与 Local Storage

## PWA 支持

Studio Map OS 已具备完整的 PWA 接入结构：

- Web App Manifest，使用 `standalone` 显示模式和 `/login` 启动入口。
- 192×192、512×512、Maskable 和 Apple Touch 图标。
- 基于 Serwist 的 Service Worker 自动注册与运行时缓存。
- 预缓存入口页、登录、注册、离线页、Manifest、品牌图标和 PWA 图标。
- 文档导航失败时回退到 `/offline` 页面。
- iOS 主屏幕应用元数据、主题色和 `viewport-fit=cover`。
- 可生成包含独立 Next.js 服务、静态资源和启动脚本的便携 PWA 压缩包。

> [!NOTE]
> 开发模式会禁用 Service Worker，避免旧缓存干扰调试。请使用生产构建并通过 `localhost` 或 HTTPS 验证安装、缓存和离线行为。

## 快速开始

### 环境要求

- 推荐使用 Node.js 20 LTS
- npm
- 支持 Web Crypto 与 IndexedDB 的现代浏览器

### 安装与运行

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

打开 [http://localhost:3000/register](http://localhost:3000/register) 创建第一个本地账户。

首次使用时：

1. 输入姓名、邮箱和至少 8 位密码。
2. 创建新的工作区。
3. 立即复制或下载系统生成的 16 位工作区恢复密钥。
4. 确认已经安全保存恢复密钥后进入工作台。

> [!IMPORTANT]
> 恢复密钥不会以明文保存在账户数据中。丢失密码、恢复密钥且没有可用备份时，工作区数据可能无法恢复。

已有本地账户时，可从 [http://localhost:3000/login](http://localhost:3000/login) 登录。这里没有“任意密码可用”的预置演示账户。

### 生产模式与 PWA 验证

```bash
npm run build
npm run start
```

在支持 PWA 的浏览器中打开 [http://localhost:3000/login](http://localhost:3000/login)，即可检查 Manifest、Service Worker 和安装入口。`localhost` 会被浏览器视为安全上下文；正式部署时应使用 HTTPS。

### 生成便携 PWA 包

```bash
npm run package:pwa
```

打包结果会写入 `output/pwa/studio-map-os-pwa/`。其中包含独立服务、PWA 静态资源和 macOS 启动脚本 `START_STUDIO_MAP_OS.command`；该脚本默认使用 `127.0.0.1:3002`。

## 主要路由

| 路由 | 用途 |
| --- | --- |
| `/register` | 创建本地账户和工作区，或通过加密备份加入已有工作区 |
| `/login` | 解锁本地账户、恢复整站设备备份 |
| `/offline` | Service Worker 在文档导航失败时显示的离线回退页 |
| `/dashboard` | 工作室总览、范围筛选、指标和项目地图 |
| `/companies` | 品牌与项目组管理 |
| `/companies/[companyId]` | 品牌详情与关联项目汇总 |
| `/projects` | 全部活动项目 |
| `/projects/[projectId]` | 项目状态、时间表、发布、收款与设置 |
| `/projects/[projectId]/costs` | 项目预算与成本详情 |
| `/projects/[projectId]/share` | 只读分享字段设置 |
| `/costs` | 工作室级成本汇总与显示货币设置 |
| `/libraries` | 人员、软件订阅与成本模板资源库 |
| `/archive` | 已归档项目、整站和工作区备份恢复 |
| `/share/[token]` | 本地只读项目快照 |

## 数据与安全模型

```text
React 页面
    ↓
lib/api 本地适配器
    ↓
内存业务数据库
    ↓
Web Crypto 加密
    ↓
IndexedDB 持久化
```

- 业务数据按工作区隔离，并以加密记录保存在 IndexedDB。
- 密码用于解锁受保护的工作区主密钥；主密钥只在登录后的内存会话中使用。
- 16 位恢复密钥用于恢复工作区主密钥和解锁加密备份。
- 工作区记录及备份使用 PBKDF2、HKDF 和 AES-GCM 等浏览器密码学能力。
- 整站备份包含本机账户、工作区和加密数据库快照；工作区备份和单项目文件同样会被加密。
- 浏览器可能拒绝持久存储请求，因此加密备份仍是重要的数据保护手段。

> [!WARNING]
> 这些机制尚未经过独立安全审计，不应替代专业的密钥托管、服务器备份或企业级身份系统。

## 多币种成本

当前支持以下显示与计算货币：

- CNY — 人民币
- USD — 美元
- JPY — 日元
- EUR — 欧元

应用优先从 Frankfurter / 欧洲中央银行数据源读取参考汇率，并在请求失败时使用浏览器缓存或内置回退汇率。汇率仅用于工作室内部估算，不应视为结算或财务建议。

## 备份文件

| 类型 | 内容 | 典型文件名 |
| --- | --- | --- |
| 整站设备备份 | 本机全部账户、工作区、偏好和加密数据 | `studio-map-os-*.smos-backup.json` |
| 工作区备份 | 当前工作区业务数据与偏好 | `studio-map-os-workspace-*.smos-backup.json` |
| 项目文件 | 单个项目快照 | `studio-map-os-project-*.smos-project.json` |

恢复数据前请确认备份类型和恢复密钥正确。整站恢复可能替换当前浏览器中的 Studio Map OS 本地数据。

## 公开分享的当前边界

当前的只读分享记录仍保存在生成链接的浏览器和同一网站来源下。分享 URL 可以在本机打开，但数据不会自动发布到远程服务器，因此：

- 换浏览器、清除网站数据或换设备后，链接可能无法访问。
- 当前能力不等同于真正的互联网公开页面。
- 若需要跨设备分享，需要后续接入远程存储、权限校验和撤销机制。

## 国际化说明

界面现支持十一种语言。缺少专用翻译键时会回退到英文；当前俄语和土耳其语词典已覆盖全部翻译键。欢迎通过 Issue 或 Pull Request 改进翻译覆盖与措辞质量。

## 项目结构

```text
app/                  Next.js 路由、Manifest、Service Worker 与汇率接口
components/           页面、业务模块、布局与通用 UI
lib/api/              本地业务 API 适配器
lib/i18n/             界面语言与领域标签
lib/mock/             演示种子数据与汇总逻辑
lib/security/         工作区及公开分享加密逻辑
lib/storage/          IndexedDB 与持久存储能力
lib/types/            领域数据模型
lib/utils/            预算、货币、阶段与发布工具
public/               品牌资源、PWA 图标与生成后的 Worker
scripts/              便携 PWA 构建与打包脚本
```

## 质量检查

```bash
npm run lint
npx tsc --noEmit --incremental false
```

当前仓库尚未配置自动化单元测试或端到端测试。涉及加密、迁移、恢复和预算计算的改动，应在合并前进行额外验证。

## 当前限制

- 业务 API 仍为浏览器内的本地适配器，没有真实服务器后端。
- 新建项目仍会继承部分演示项目结构，并非完全空白模板。
- 实际成本、素材和活动记录的编辑能力尚未完整开放。
- 项目组详情页、分享撤销和链接过期管理仍待接线。
- 刷新完整页面后需要重新输入密码解锁工作区。
- PWA 已接入，但尚未配置自动化 Lighthouse、安装流程或离线端到端回归测试。
- 未缓存过的动态页面和实时网络接口在断网时仍可能不可用；离线页与本地数据不会替代远程 API。

## 参与贡献

欢迎提交 Issue 或 Pull Request。建议在提交前：

1. 说明改动对应的页面、数据模型或迁移范围。
2. 同时检查桌面端与窄屏布局。
3. 运行 ESLint 和 TypeScript 检查。
4. 对数据格式变更补充向后兼容与备份恢复说明。

## 版权

本仓库当前未附带独立开源许可证。除非获得版权所有者明确授权，请勿假定拥有复制、分发、修改或商业使用本项目的许可。

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. All rights reserved.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
