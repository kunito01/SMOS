# Studio Map OS · 制作技法与设计考量总册（Craft Playbook）

> 沉淀于 2026-06 ~ 2026-07 的完整开发周期。本册是**全软件的技法总纲**：每一条都对应仓库里可核查的代码位置，绝大多数背后有真实付出过代价的坑。
>
> 姊妹篇 [AUTH_PLAYBOOK.md](AUTH_PLAYBOOK.md) 是"Apple ID + 本地账户双轨登录"的产品与架构专册；本册第一章不复述它，只补齐**代码级机制**——两册合读才是完整的登录/同步方案。
>
> 本册定稿即冻结（项目停止功能更新）。若未来重启开发，先读第 0、6、7 章。

---

## 0. 一页心智模型

**产品形态**：单人工作室的项目操作系统。本地优先（IndexedDB 全量数据）、端到端加密（16 位恢复码或 Apple 指纹包裹主密钥）、可离线 PWA、可静态托管（GitHub Pages / 便携包 / 本地 dev 三形态同源）。没有自建后端——"云"只有用户自己的 CloudKit 私有库。

**五根技术支柱**（对应本册五章）：

| 支柱 | 一句话 | 章 |
|---|---|---|
| 身份与同步 | Apple 替你证明身份；同步是"密文字节对账"，不比时钟 | 1 |
| 加密与持久 | 口令只包裹随机主密钥；一切落盘物先校验后重建 | 2 |
| 领域计算 | 口径钉成常量；旧数据"能表达才迁移，不能就冻结" | 3 |
| 导出系统 | 一份自包含 HTML 同时服务预览/PDF/下载；安全边界在数据构建层 | 4 |
| UI 与运行环境 | 编译期锁死翻译完整度；装饰动画三层省电；SW 决策条条有注释 | 5 |

**三条贯穿性纪律**（详见第 6 章）：
1. **凡异步必配令牌**——epoch / generation / revision，迟到的响应一律作废；
2. **凡落盘必先净化**——normalize 宽进修复，validate 严出把关，计算层遇脏即炸；
3. **凡对外发出的东西必冻结**——报价快照、分享链接、导出文件，事后改库不改历史。

---

## 1. Apple ID 登录与 CloudKit 同步管线

> 先读 [AUTH_PLAYBOOK.md](AUTH_PLAYBOOK.md) 建立产品与架构视角；本章只写代码级机制。

### 0. AUTH_PLAYBOOK.md 核对结论

六层根因手册的关键论断与当前代码**全部一致**：6.1 登录消息防护（`lib/storage/cloudkit/cloudkit-client.ts:411-537`）、6.2 REST 回退 + 8 次重试（同文件 :684-762、:5-10）、6.5 localStorage 会话存储（:207-278、:570-572）、6.6 forceRemoteRestore 的 `allowPendingUpload: true`（`lib/storage/workspace-sync-coordinator.ts:1116-1125`）、6.8 base64 线性正则（`lib/storage/cloudkit-provider.ts:100-133`）、2.3 保存 1.5s 防抖且不监听 online 事件（coordinator:32、全文件无 online 监听）均可在代码中逐字验证。以下各条只写手册**没写透的代码级机制**。

---

### 1. 登录消息防护不止"拦"，还有"放行后自动跟进"的闭环

手册只写了 origin 白名单拦截；代码里真正让登录"必然成功"的是放行后的动作：可信 Apple 域的 ckSession 消息放行时，防护会**自动解除布防、清空身份缓存，并在 250ms 后强制 `setUpCloudKitAuth({force:true})`**——因为 SDK 收到会话后自己的身份确认（legacy 端点）会静默失败，必须主动踢一脚 REST 回退，登录才能不等 focus 事件就完成（`cloudkit-client.ts:483-495`）。布防用的是 document 捕获阶段监听登录按钮的点击（:522-536），任何页面挂上按钮就自动获得防护，宿主组件零接入成本；message 过滤器只装一次、常驻但按 `armedUntil` 时间戳空转（:447-517），避免反复 add/remove 监听器的时序洞。

**复用要点**：对"一次性 postMessage 监听器"类第三方 SDK，防护要做成"布防窗口 + 形状识别 + origin 白名单 + 放行后主动补一次状态机推进"四件套，缺最后一件依然会偶发卡死。

### 2. 驱动黑盒 SDK 进登录态：内部方法注入 + 会话轮换回写

REST 回退不是绕开 SDK，而是**喂饱 SDK**：拿到 `private/users/current` 的身份后调用 SDK 私有的 `container._auth._handleCurrentUserIdentity(identity)`，让登出按钮、`whenUserSignsIn` 订阅、数据库会话处理全部继续走 SDK 自己的代码路径；私有方法不存在时降级为只返回身份并 dev 告警（`cloudkit-client.ts:735-762`）。两处手册没写的细节：(1) REST 回退把 **401/421 视为"确实登出"返回 null，其余非 2xx 一律 throw**——离线/传输失败绝不能被误判成登出，否则会错清本地会话（:699-707）；(2) CloudKit 会话是**用一次轮换一次**的，响应头 `x-apple-cloudkit-web-auth-token` 暴露时立刻回写 localStorage（:718-724）。另外 `CloudKit.configure` 全局只做一次并用 `window.__studioMapCloudKitConfigurationKey` 记账：重复 configure 会把可见按钮和正在等结果的监听器拆散（:547-575）。

### 3. 身份缓存 60s TTL：防止 `setUpAuth()` 撕裂在飞请求

CloudKit JS 的 `setUpAuth()` 会重置内部认证状态并**中止共享会话 fetch 的在飞数据库请求**（表现为 NETWORK_ERROR）。代码用"已确认身份缓存 + 60s TTL + 单飞 promise"三层让高频的身份复核（provider reconcile、每请求前的 `assertCloudKitAuthenticatedUser`）不真正触发 `setUpAuth`；缓存在每次登录尝试开始（`noteSignInStarted`）和登出时强制失效，所以不会掩盖换号（`cloudkit-client.ts:157-180、:847-888`）。重试的可重试性判定也刻意收窄：只有 NETWORK_ERROR / SERVICE_UNAVAILABLE / TypeError（传输层、必未提交）才重试，CONFLICT 等业务错误直接抛（:775-822）。

### 4. React 侧认证状态机：epoch 令牌裁决"事件 vs 迟到响应"

`cloudkit-auth-provider.tsx` 的核心是 `authEpochRef`：每个**权威事件**（弹窗 sign-in/sign-out 事件、用户点击登录按钮）都 `epoch+1`；每次 `refresh()` 开始时记下 epoch，异步返回后若 epoch 已变则丢弃结果、改返回当前身份（:90-99、:122-177、:182-190）。配套三个机制：(1) reducer 让 signed-in 状态**粘滞**——checking/signing-in/error 动作在已有身份时全部不动状态，只有明确的 signed-out 或新 signed-in 能换人（:59-77）；(2) 登录尝试中 `setUpAuth` 返回 null 不算失败，有 8 秒宽限窗显示 signing-in，超时才报错（:145-158）；(3) focus/visibilitychange 的重校准**只在"有未决登录尝试"（150ms/1.2s/8.25s 三连查）或"已登录做一次廉价复核"时发起**，空闲未登录时刻意什么都不做——多余的 `setUpAuth` 会倍增 SDK 内部轮询链并重渲染登录按钮（:267-291）。登录面板再叠一层 `requestSequence + currentIdentityKey` 双检丢弃过期 inspect 结果（`apple-cloudkit-login-panel.tsx:60-100`）。

### 5. 同步协调器的四层竞态守卫：最终裁决永远在锁内做字节比对

手册写了"查账不比钟"，没写**怎么保证判定时刻到落盘时刻之间没人动过数据**。代码是四层：
1. **startGuard**：排程时快照 `mutationEpoch + provider + cloudKitUserRecordName`，真正执行时先验一遍，防"定时器活过了断开/换号"（`workspace-sync-coordinator.ts:339-364`）；
2. **cloudBindingStillMatches**：每个 await 之后都重验绑定，防整站恢复清掉绑定后旧同步把它偷偷续上（:366-372、:411-414）；
3. **localSaveRevision（内存计数器）+ mutationEpoch（localStorage 持久）**：每次本地保存 `revision+1`，同步开始时记下，覆盖/标记前比对（:118-129）；
4. **锁内终审**：`restoreRemoteBundleUnderMutationLock` / `markSyncedIfLocalUnchangedUnderMutationLock` 在与本地持久化**同一把** Web Lock 里重新捕获本地密文快照并做字节级比对（updatedAt+salt+iv+ciphertext 四元组，:288-305），任何不符→标 conflict 或降级为 pending 并重新排程上传，绝不把"上传时被改过的本地"标成 synced（:396-499）。
配套：`runExclusive` = 每 workspace 一把 `navigator.locks` + 进程内 in-flight map 去重（:746-771）；conflict 状态**粘滞**——冲突未决时后续保存不许把状态翻回 pending，否则排程上传会跟用户的裁决赛跑（:826-837）；登录期超时（30s/60s）刻意大于内层 8 次重试预算，否则弱网下超时会掐死"其实正在成功"的重试（:32-39）。

### 6. "无共同版本史"的三种下场 + 云端缺失时的方向判定

`cloudManifestChangeTag === null` 且无待传改动（= 刚做过整站恢复的设备）时，代码不敢用任何自动策略：先用回调验证云端包可被当前密钥解开，再要求**本地与云端密文字节相等**才敢标 synced，不等则直接 conflict 弹给用户（:616-652、:1136-1172）。反向的坑也堵了：云端查无 manifest 且本地**没有** pendingUpload 时，不是"顺手上传"而是报错——一个恢复出来的工作区找不到云副本，大概率是登错 iCloud 账户，此时上传等于向陌生账户播种数据（:594-611）。会解读为"该上传"的只有 pendingUpload=true 一种情况。

### 7. 分块上传的事务模型：manifest 提交 = 唯一提交点，changeTag 三态 CAS

chunk 尺寸选 384KiB 是算出来的：base64 后约 512KiB，稳落在 CloudKit 单记录 1MiB 上限内还留足元数据余量（`cloudkit-provider.ts:20-26`）。事务性靠三件事：(1) 每代 chunk 记录名含随机 generation、**不可变**，全部保存成功后才提交 manifest，读者永远读不到半截（:574-620）；(2) manifest 保存带上旧 `recordChangeTag` 让服务器做 CAS，且 `expectedManifestChangeTag` 是**三态语义**——`undefined`=接受上传前刚查到的最新 tag、`null`=要求云端必须为空、字符串=精确匹配（:50-57、:547-557）；(3) 旧 generation 的 chunk 删除是 best-effort、任何失败静默吞掉——新 manifest 已不引用它们，清理失败最多费配额，绝不能把成功同步报成失败（:305-320、:630-636）。下载侧对每 chunk 验 recordType/schema/generation/index/sha256，拼装后再验总长与总 sha256，最后还要求快照的 `workspaceId` 与 `updatedAt` 与 manifest 一致（:453-529）。

### 8. 设备保险库：把"不可导出 CryptoKey"当值直接塞进独立 IndexedDB

免密钥秒开的核心是浏览器冷知识：`generateKey({extractable:false})` 的 CryptoKey 可以**被结构化克隆直接存进 IndexedDB**，取出后能用、但永远导不出原始字节（`apple-device-vault.ts:594-633`）。围绕它的工程化手册没写透：(1) 用**独立数据库** `studio-map-os.apple-device-vault`，就是为了让应用的加密工作区/整站备份快照函数**天然带不走**包裹密钥——备份被偷也解不开（:6-19）；(2) 指纹本身**不落盘**，库里只存其 SHA-256 摘要，解锁时调用方必须重新出示完整指纹进 AES-GCM 的 AAD，等于每次解锁都重新证明"你能算出指纹"（:207-239）；(3) 读取记录时用 `hasExactKeys` 精确键集 + `isValidWrappingKey`（type=secret、extractable===false、算法/长度/usages 逐项验）拒绝一切被篡改或降级的记录（:253-341）；(4) IndexedDB open 挂 15s watchdog、`DataCloneError/NotSupportedError` 映射为"此浏览器无法持久化不可导出密钥"专用错误码（:352-371、:419-435）；(5) 每次更新都换新密钥+新 IV，明文 masterKey 用后在 finally 里 `fill(0)`（:594-633）。

### 9. 免恢复密钥的完整链路：指纹包裹 → vault 快路径 → miss 后指纹解包 → 回填 vault

密码学根基：指纹 = `SHA-256(containerId + "\0" + userRecordName)`（`cloudkit-client.ts:344-360`），当作≥32 字符高熵口令喂给与恢复码同一套 PBKDF2 包裹流程（`workspace-crypto.ts:852-945`，注释明确承认这**不是**对 Apple 端到端保密）。登录时的层级在 `auth.ts:1501-1522`：先试设备保险库（同设备秒开），只有 `VAULT_ENTRY_NOT_FOUND / INVALID_VAULT_RECORD / UNLOCK_FAILED` 三种"vault 不可用"错误才降级用指纹解开云端档案里的 `recoveryMetadata`，其他错误（如浏览器不支持）原样上抛；随后 `activateAppleAccountSession` 无论走哪条路都**回填**本设备 vault（:1351-1357），新设备第二次打开就走快路径。指纹对外只以 `CK-XXXX-XXXX` 短标签展示、邮箱打码为 `a•••@domain`，原始 userRecordName 永不出 UI（`cloudkit-client.ts:305-337`）。

### 10. Apple 供给是两阶段提交：provisioning→ready，每一步都可从崩溃中续接

首次设置的顺序被精心编排成"任何一步断电都能恢复"：本地先以 `indexeddb` provider 激活工作区（避免种子数据触发上传排程），激活成功后才切 `cloudkit`（此时 pendingUpload=true 恰好是对的——首份副本确实待传），再写 vault（`auth.ts:1396-1426`）；云端档案先以 `status:"provisioning"` 创建，**必须**等第一份加密工作区副本上传且验证 `outcome==="synced"`，才用 `expectedRecordChangeTag` CAS 把档案翻到 `ready`（:1428-1472）。两处"响应丢失"幂等术：create/save 档案抛错后都**重读**这个固定 recordName 的记录，若服务器其实已提交（workspaceId+指纹匹配）就当成功继续（:1456-1468、:1721-1733）。回滚有清晰分界线 `profileCreationAttempted`：CloudKit create 尝试前失败→全量回滚（删 vault、还原账户/工作区注册表、还原存储快照和偏好）；一旦尝试过→保留本地密文和 vault 供重试对账，绝不销毁用户唯一数据（:1754-1776）。下次同一 Apple ID 登录发现 `status==="provisioning"` 会自动续跑 finalize（:1533-1540）。

### 11. 双轨分叉点与"密钥不出 auth 模块"的回调注入

双轨在代码里的分叉极窄：凭证验证（密码 vs 指纹/vault）之后全部汇入同一条 `setActiveSession → pullWorkspaceFromCloudOnLogin` 管线。关键解耦：同步协调器**从不持有主密钥**，auth 通过 `validateRemoteBundle` 回调注入验证——回调里用会话内存中的密钥**真实解密**一次云端密文（结构校验和传输哈希都不算数），过了才允许覆盖 IndexedDB（`auth.ts:267-284`，coordinator 注释 :87-95）。两轨共享同一条救援路径：本地激活失败且 provider 是 cloudkit 时，先建一个"临时已认证会话"再 `forceRemoteRestore` 从云端拉回、成功才算登录（本地账户 `auth.ts:1902-1935`；Apple 账户 :1309-1330）。登出语义也分叉：用户主动 logout 且是 Apple 账户→删持久化 ckSession（否则登录页会静默重进，登出形同虚设）但**保留 vault**，下次登录免恢复密钥；CloudKit 自己报告的登出→只清本地会话（:2036-2062）。

### 12. 跨标签串行化 + 离线解锁的四重门

所有会动"账户注册表/会话/vault"的操作（register / inspectAppleAccount / provision / recover / offlineUnlock）统一包 `withAuthMutationLock`——一把全局 Web Lock `studio-map-os.auth-mutation`，无 Web Locks 时降级进程内 promise 队列（`workspace-mutation-lock.ts:36-59`）；workspace 写锁则嵌套在 database 大锁内取，天然与整库替换互斥（:123-132）。离线解锁比手册的"三重门"多一道：持久化会话存在（主动登出会删它，`cloudkit-client.ts:187-189`）+ **本地恰好只有 1 个 Apple 账户**（0 个没得解、≥2 个离线无法消歧，`auth.ts:1575-1583`）+ vault 有此账户条目 + 本地密文可激活；且 UI 侧只在 CloudKit phase 为 `error`（连不上）时尝试，在线明确答"已登出"仍要求重新 Apple 登录（`apple-cloudkit-login-panel.tsx:109-135`）。任一门不过返回 null 静默回落在线流程，四门全过也**不碰云端**，纯本地进入。

---

## 2. 加密与本地持久层

范围：`lib/security/workspace-crypto.ts`、`lib/storage/indexed-db.ts`、`lib/api/mock-persistence.ts`、`lib/security/public-share-storage.ts`、`lib/storage/workspace-mutation-lock.ts`、`lib/storage/workspace-write-guard.ts`、`lib/storage/storage-preferences.ts`（均在 `/Users/likun/Cache/Studio Map OS/Codex/` 下）。

### 1. 两级密钥体系：口令只包裹随机主密钥，永不直接加密数据

16 位恢复码经 PBKDF2(SHA-256, 310k 次迭代) 派生出的只是"包裹钥"，用它 AES-GCM 解开一把真正随机的 32 字节 workspace master key；所有数据密钥再从 master key 用 HKDF 按用途派生。好处：换解锁方式（恢复码 / 应用内密码 / Apple 账户指纹）只需重新包裹 32 字节，不必重加密整库；同一 master key 可同时被多种 wrapper 包裹共存。Apple 账户模式用高熵账户指纹替代恢复码，注释明确承认这**不是**对账户持有者端到端保密——用恢复码保护换取多设备免恢复码，是有意的产品取舍，本地账户仍走 code-based 路线。恢复码生成用拒绝采样（丢弃 250-255）消除模偏差。
- `lib/security/workspace-crypto.ts:17`（迭代数）、`:746-790`（createWorkspaceRecovery）、`:852-902`（Apple 账户取舍注释+实现）、`:947-989`（密码二次包裹）、`:686-706`（无偏采样）

### 2. AAD 全头绑定 + HKDF info 域隔离：让"换头攻击"直接撞碎 GCM tag

每种加密记录（recovery metadata、password wrapper、备份 envelope、IndexedDB record、公开分享）都把 schema/version/workspaceId/时间戳/KDF 参数/IV 等**全部头字段**序列化成 JSON 数组塞进 AES-GCM 的 additionalData——篡改任何一个明文头字段（比如把 A 工作区的密文头改成 B 的 id）解密时 tag 必炸。同时 HKDF 的 info 里绑定 schema+kind+workspaceId+用途字符串（`"backup-encryption-key"` vs `"indexeddb-workspace-record-encryption-key"` vs `"public-share-encryption-key"`），即使 salt 相同，不同用途派生出的密钥互不通用，密文无法跨场景搬运。复用要点：AAD 序列化要用固定顺序的数组而非对象，保证字节级确定性。
- `lib/security/workspace-crypto.ts:472-566`（五组 AAD/info 构造）、`lib/security/public-share-storage.ts:203-272`

### 3. 踩坑实录：canonical base64 校验的分组量词 regex 在 5MB 处栈溢出

原本用 `(?:[A-Za-z0-9+/]{4})*` 这种"每 4 字符一组"的正则校验 base64，V8 对分组量词按组递归，字符串超过约 5MB（一个内嵌图片的 workspace 就到了）直接抛 `RangeError: Maximum call stack size exceeded`。修复方案：单字符类线性扫描 `/^[A-Za-z0-9+/]*={0,2}$/` + `length % 4 === 0` + `atob` 后 re-encode 回原字符串比对——三者合起来仍完整保证 canonical（拒绝非标准填充/尾随位），且 O(n) 无递归。两个文件各留了一段注释防止后人"优化"回去。
- `lib/security/workspace-crypto.ts:166-201`、`lib/security/public-share-storage.ts:152-181`

### 4. 严格 parse 风格：exact-keys + 原型检查 + canonical ISO + 校验后重建对象

所有 parse 函数不是"校验通过就返回原对象"，而是逐字段校验后**重新构造字面量对象**返回：`hasExactKeys` 拒绝任何多余键（防夹带字段进 IndexedDB）、`isRecord` 要求原型必须是 `Object.prototype` 或 `null`（防原型污染注入）、`isCanonicalIsoDate` 用 `Date.parse → toISOString === 原值` 的 round-trip 拒绝非规范时间串。base64 字段全部解码再重编码后写回，保证入库的每个字节都经过规范化。这套模式在 crypto、indexed-db、public-share 三处以同构代码复制而非抽公共库——每层保持零依赖可独立审计。
- `lib/security/workspace-crypto.ts:208-244, 349-470`、`lib/storage/indexed-db.ts:115-169, 244-289`

### 5. normalize / validate 双层校验：宽进修复 + 严出把关，缺一不可

`normalizePersistedDatabase` 是"宽进"层：补旧版缺失的集合（报价、工作流上线前的库没有这些字段）、迁移项目内嵌 workflow 到全局库（签名去重 + FNV hash 防 id 冲突）、剔除引用已消失品牌的报价、修复种子数据。但 normalize 自己也可能有 bug，所以最后一步强制 `structuredClone(validatePersistedDatabase(hydratedDatabase))`——validate 是"严出"层，逐实体结构断言 + 工作流引用完整性检查，normalize 的产物不合格照样抛。只有 validate 没法兼容旧数据，只有 normalize 则 normalize 的缺陷会静默写坏加密库且再也无法发现（密文里没法 grep）。
- `lib/api/mock-persistence.ts:624-689`（normalize，688 行是关键的双层收口）、`:336-380`（validate）、`:504-572`（内嵌 workflow 迁移）

### 6. IndexedDB 三条纪律：每操作开关连接、15 秒 watchdog、事务内绝不 await

连接按操作粒度 open→transaction→close，因为 iOS/Safari PWA 退后台会挂起长连接（文件头注释写明动机）。open 与每个事务都套 15s watchdog，因为 IndexedDB 请求在某些浏览器状态下会**永远不回调**——超时主动 abort 并 reject，宁可报错也不无限挂起。最硬的一条：加密（Web Crypto 是异步的）必须在进入事务**之前**全部完成，事务 setup 里只允许同步的 request 链——Safari 会把"空闲"事务激进 auto-commit，事务中 await 一个 crypto promise 回来时事务已经提交了一半。配套的 controller 模式：`setResult` 只暂存结果，`oncomplete` 触发才 resolve（保证真正落盘）；事务完成但没人 setResult 也判失败。
- `lib/storage/indexed-db.ts:8-14`（动机注释）、`:30, 567-589, 775-787`（watchdog）、`:1505-1510`（"Encryption must finish before"注释）、`:733-854`（runTransaction/controller）

### 7. bundle 原子替换 + 分享 token 所有权 preflight

一个工作区的加密主记录和它全部公开分享记录视为一个 bundle，替换永远在**同一个 readwrite 事务**内完成：put 主记录 → 逐 token 检查该 digest 是否已被**别的**工作区占用（是则 `PUBLIC_SHARE_TOKEN_CONFLICT` 中止整个事务）→ 游标删除本工作区全部旧分享 → put 新分享。任何一步失败事务整体回滚，不存在"主记录是新的、分享是旧的"的中间态。全库替换 `replaceEncryptedDatabaseSnapshot` 同理：所有验证在事务外做完，事务内只 clear 两个 store + 回填。`deleteEncryptedWorkspaceBundle` 则**故意不 parse 现有值**——留出一条"已验证备份救回不可读损坏库"的授权删除通道。
- `lib/storage/indexed-db.ts:885-967`（preflight+替换）、`:1393-1435`（全库替换）、`:1468-1503`（不 parse 的删除，注释说明原因）、`:1511-1541`

### 8. persistMockDatabase 的四重防竞态：队列 + generation + mutation epoch + 失败回滚

单人应用照样有并发：多 tab、PWA 窗口、保存中途登出、保存中途恢复备份。四道防线叠加：(a) 模块级 `persistenceQueue` promise 链串行化本 tab 的保存；(b) 每次激活工作区 `activeWorkspaceGeneration+1`，in-flight 保存持有旧 generation 一律作废（切换账户后旧数据不会写进新工作区）；(c) 跨 tab 的 mutation epoch（localStorage 持久化，读取时与内存值取 max 以容忍 localStorage 写失败）在锁内检查**两次**——进锁时和加密完成后，任何 restore/别的 tab bump 过 epoch 就中止，防止旧内存快照覆盖刚恢复的数据；(d) 保存失败时 `persistenceFailureEpoch+1` 并把内存库回滚到 `lastPersistedDatabase`，注释原话"a refused save leaves no phantom edits"——UI 上的编辑要么落盘要么消失，绝不停留在"看着已保存其实没有"的幻觉态；队列里排在后面的保存靠 failureEpoch 比对连带作废。master key 每次复制使用、finally 里 `fill(0)`。
- `lib/api/mock-persistence.ts:71-79`（状态）、`:724-769`（epoch 双检的加密保存）、`:1133-1196`（四重防线汇合点）、`lib/storage/workspace-mutation-lock.ts:87-117`（epoch 的 max 合并与持久化）

### 9. 锁层级固定序：全局 database 锁 ⊃ per-workspace 锁，Web Locks 缺席时降级进程内队列

`withWorkspaceMutationLock` 永远先取全局 `database-mutation` 锁再取 `workspace-mutation.<id>` 锁——固定获取顺序天然免死锁，同时让"整库替换"类操作只需持全局锁就能压制所有工作区写入。跨 tab 用 `navigator.locks`（exclusive），老浏览器降级为进程内 promise 队列，且队列实现里用"释放信号 promise"衔接而非直接链 operation，保证前一个操作抛错不会毒化队列。`bumpWorkspaceMutationEpoch` 的契约写在注释里：必须在已持有 database 锁时调用，排队中的写入才能感知 baseline 被替换。
- `lib/storage/workspace-mutation-lock.ts:13-49`（队列+降级）、`:123-132`（层级顺序）、`:93-96`（调用契约注释）

### 10. 备份恢复的两阶段回滚：内层 bundle 快照 + 外层 storage 快照双保险

`restoreMockDatabaseBackup` 动手前先捕获三样：上一份内存库、当前加密 bundle（`captureEncryptedWorkspaceBundle`）、相关 localStorage 键值；然后 apply 新库 → `persistMockDatabase({bumpMutationEpochAfterPersist:true})` → 写语言/币种偏好。任一步失败且已持久化，就在锁内恢复旧 bundle + bump epoch + 回滚 localStorage + 回滚内存。内层回滚自己也可能失败——注释交代调用方还握着一份**外层** storage 快照（`captureMockDatabaseWorkspaceStorage`/`restoreMockDatabaseWorkspaceStorage`，一次性打包加密 bundle + 全部相关 localStorage 键），会做第二次回滚尝试后才报错。capture 还带 `discardCorruptBundleForVerifiedRecovery` 选项：用户已验证的备份可以先删掉损坏 bundle 再继续，与技法 7 的"不 parse 删除"配套构成损坏恢复通道。
- `lib/api/mock-persistence.ts:1224-1298`（内层两阶段）、`:1287-1290`（外层保险注释）、`:866-945`（外层快照对）

### 11. 明文→加密迁移：写后读回验证，才删明文

旧版数据存 localStorage 明文。迁移流程严格是：加密写入 IndexedDB → **重新读出该记录 → 用同一把钥匙解密 → normalize 通过** → 才调用 `removeVerifiedLegacyPlaintextCopies` 删明文。任何一环失败明文保留，用户数据不会"迁移到一半两头都没有"。全局旧库的认领用 claim marker 两步写：先复制到 workspace 键、再写 marker，写 marker 失败则回滚复制；`finalizeLegacyMockDatabaseClaim` 确认加密记录确实存在后才删全局明文，注释点明否则会"留下第二份永远陈旧的明文库"——既是数据安全也是隐私问题（明文不该在加密上线后继续存在）。
- `lib/api/mock-persistence.ts:1039-1074`（写后验证迁移）、`:713-722, 771-805, 947-964`（claim 两步写与收尾）

### 12. 公开分享链接：token 即密钥、库里只存 digest、加密的是脱敏冻结快照

分享 token `smos_`+48hex（24 随机字节）本身就是密钥材料：HKDF(token, 随机 salt, info=[schema, tokenDigest, workspaceId, projectId, 用途]) 派生 AES-GCM 密钥；IndexedDB 主键只存 token 的 SHA-256 base64url digest。于是：偷走整个 IndexedDB 也解不开任何分享（没有 token）；访客拿 URL 里的 token 就能解密，**完全不经过** workspace master key——这是与主数据平行的独立读路径。写入侧每次 persist 全量重建分享记录，且加密前先过 `sanitizeProjectForPublicShare` 白名单裁剪（人名脱敏、成本行改占位名、workflow 附件因含私有源文件被整体禁止发布）——加密的是"已脱敏快照"而非活数据，链接内容天然冻结在发布时刻。解密后 `validateDecryptedSnapshot` 再交叉核对明文里的 tokenDigest/workspaceId/projectId/token 与外层记录逐一相符且未过期，防密文调包。配套的 `readMockDatabaseWorkspaceSnapshot` 提供不激活、不 hydrate、不 seed 的严格读路径，保证另一个已登录工作区不可能污染分享结果。
- `lib/security/public-share-storage.ts:18-19, 184-253`（token/digest/派生）、`:283-425`（脱敏白名单）、`:543-578`（交叉核对）、`:656-703`（全量重建+候选过滤）、`lib/api/mock-persistence.ts:828-864`（隔离读路径）

### 13. Write guard：冲突期一刀切断写、notify 豁免、异常态自愈

CloudKit 工作区处于本地/云冲突态时，`assertWorkspaceWritable` 在持久化队列内、加密之前抛 `WorkspaceSyncConflictError`——检查点**故意放在 persist 的 try 内**，让技法 8 的回滚机制顺带把内存改动打回 lastPersistedDatabase，用户看到的是"这次编辑被拒绝"而非"编辑成功但没保存"，两份副本在决策期内无法继续漂移。guard 与 UI 解耦：只 dispatch 一个 CustomEvent，app shell 监听后弹阻断对话框；登录 bookkeeping、备份 flush 这类"容忍被拒"的调用方传 `notify:false` 静默失败——这个豁免参数是踩过"登录流程自己触发写入→被冲突阻断→登录死锁"的坑后加的（见 memory 的登录豁免死锁教训）。相邻的自愈技法：storage-preferences 反序列化时把持久化的 `"syncing"` 状态降级为 `"pending"`（浏览器可能在同步中途被杀，否则 UI 永久卡在 syncing）；便携备份导出偏好时故意剥离 CloudKit 身份/change tag/会话（设备绑定态不可移植），恢复后置 `auth-required` 引导重连。
- `lib/storage/workspace-write-guard.ts:28-49`（阻断+豁免注释）、`:21-26`（事件解耦）、`lib/api/mock-persistence.ts:1155-1160`（try 内检查点注释）、`lib/storage/storage-preferences.ts:124-127`（syncing 自愈）、`:320-326`（身份不可移植注释）

---

## 3. 领域模型与业务计算

### 1. 计费口径用常量钉死：人日=10小时、月=20工作日、人员数周末/软件数自然日
所有人力换算只走一个口径：`PROJECT_BUDGET_HOURS_PER_DAY = 10`（lib/utils/project-budget.ts:18）与 `PROJECT_BUDGET_WORKING_DAYS_PER_MONTH = 20`（lib/utils/cost-template-links.ts:10）。人员模版无论按时/日/月/年计费，一律经 `peopleTemplateDailyRate` 折算成唯一的"日费率"存储展示（cost-template-links.ts:17-37），预算行反向再除以 10 得小时费率（cost-template-links.ts:174）。更细的一层口径：人员按工作日计费（`countInclusiveWorkingDays` 用"整周×5+余数逐日判断"的 O(1) 算法剔除周末，project-budget.ts:179-201），而软件订阅按自然日摊销（月费/30、年费/365，project-budget.ts:266-278）——两类成本各有独立的 usage-days 函数（project-budget.ts:211-253）。复用要点：口径不是文档约定而是 export 的常量+纯函数，任何 UI/导出/校验都 import 同一来源，不可能出现两处算不一致。

### 2. @deprecated 保留式迁移：能表达才转换，不能表达就原样冻结
`days`（人员行）和 `periods`（软件行）被 `allocationPercent` 取代，但类型上保留为 `@deprecated` 可选字段（lib/types/domain.ts:114-116, 151-153）。迁移逻辑在 normalize 层：把旧 `days` 换算成等效占用比（days/阶段天数×100），**≤100% 就丢弃 days 完成迁移；>100%（新模型表达不了）就保留 days 并把 allocation 钉在 100**（lib/utils/project-budget-normalize.ts:87-97；软件行同理，periods 先按月/年折成等效天数再算，normalize.ts:204-217）。计算层则约定 `line.days !== undefined` 时旧字段优先（project-budget.ts:259-264, 468-470），保证老数据的总额一分不变。同样思路的还有 `dailyExpenses` 单总额→`dailyExpenseLines` 明细行的迁移（domain.ts:159-162；计算层兜底 project-budget.ts:512-526；normalize 层落地为一条 legacy 明细行 normalize.ts:285-299）。技法本质：迁移的验收标准是"旧总额不变"，而不是"字段更新"；表达不了就带着旧字段继续算。

### 3. 成本模版双重语义之一——"引用即联动"：每次写库全量物化
`Person.costTemplateId` / `Tool.costTemplateId` 是活引用（domain.ts:37-38, 63-64），但系统不在读取时解引用，而是每次写操作后调 `synchronizeCostTemplateLinks` 把模版当前值**物化**进全局库、项目内副本、以及预算行（roleLevel/hourlyRate/软件行 amount 全部覆写，lib/utils/cost-template-links.ts:130-202）——模版仍是唯一事实来源，但物化后的字段让加密导出和旧版本读者自包含（注释见 cost-template-links.ts:125-129）。删除模版走"先物化最终值、再解链、最后删除"三步（lib/api/libraries.ts:330-338 调 synchronize→detach），实体上留下最后已知的费率，不会数据丢失。修改模版时若已有实体挂链且改动会破坏兼容性（如 people 模版改成 one-time），直接抛错要求先解链（libraries.ts:311-321）。兼容性判定本身也是纯函数（`isCompatiblePeopleTemplate` 排除 one-time——"一次性金额不是费率"，cost-template-links.ts:46-60）。

### 4. 成本模版双重语义之二——"入行即冻结"：预算软件行是快照，sync 只增不改
阶段预算里的 `softwareCosts` 是从工具库**冻结**下来的费率快照行（domain.ts:164-165）：`createProjectBudgetSoftwareCostSnapshots` 生成快照（project-budget.ts:280-314，快照 id 取 `phaseId:software:toolId` 保证幂等），而 `syncProjectBudgetSoftwareCostSnapshots` 在阶段勾选新工具时**只追加缺失行、绝不改已有行**，刷新费率必须显式调用重建函数（project-budget.ts:316-347）。两种语义的交界处：快照行若 `toolId` 指向仍挂着模版活链的工具，会被技法 3 的 sync 覆写回联动状态（cost-template-links.ts:179-195）——即"挂模版=联动，不挂模版=冻结"，一条数据两种生命周期由是否有 costTemplateId 决定。计算时还区分 `softwareSource: "snapshot" | "derived"`（有存档用存档、没存档现算）并上报 `missingToolIds` 供 UI 提示（project-budget.ts:540-549）。

### 5. 多币种聚合：sumMoney 先按币种分桶、每桶只换算一次
`sumMoney` 不逐条换算相加，而是先把所有条目按 4 种币种（money.ts:1）累加出原生小计，再对每个非零桶做一次 `convertCurrency` + `roundMoneyAmount`（lib/utils/money.ts:108-144）——同币种条目零换算误差，跨币种误差也只发生在每桶一次的舍入上，结果确定且与条目顺序无关。汇率快照恒以 CNY 为基准（`base: "CNY"`），换算恒走 `amount/fromRate*toRate` 两跳（money.ts:75-97）；内置 `bundledExchangeRateSnapshot` 用 `asOf:"bundled"` 哨兵值 + `stale:true` 标记离线兜底（money.ts:15-27），`isExchangeRateSnapshotRecent` 对 bundled 一律返回 false 逼 UI 显示"汇率过期"（money.ts:64-73，且容忍 asOf 超前一天的时区偏差）。金额全程整数化（`roundMoneyAmount` 四舍五入到个位并归一 -0，money.ts:99-106）；单值换算 `toCny` 也复用 sumMoney 保证舍入语义统一（money.ts:146-150）。

### 6. 分类合计与总额的舍入调平：byCategory 必须精确等于 subtotal
subtotal 是全部条目一次 sumMoney，byCategory 是每类各跑一次 sumMoney——分桶不同导致舍入不同，两者可能差几块钱。`calculateCategoryTotals` 显式调平这个差值：差为负则从类目倒序逐个扣减（不扣穿 0），差为正则整体加到最后一个有条目的类目上，仍调不平就直接抛错（project-budget.ts:399-446）。这样对外的不变量是"分类合计 === 基数"（类型注释明言，project-budget.ts:108-109），报表里永远不会出现分项加起来对不上总额的尴尬。技法要点：多币种+舍入的系统里，"各视图数字自洽"要靠显式 reconcile 步骤保证，不能指望浮点自然对齐。

### 7. 双层防御：normalize 层静默清洗归零，计算层 assert 抛错
同一批数据有两套完全不同的容错哲学。信任边界（导入备份/云端 hydrate）走 normalize 层：`cleanNonNegativeNumber` 把一切垃圾归 0、`clampUsageRange` 把越界日期夹回阶段范围、非法行直接丢弃、首个同 phaseId 记录获胜且孤儿行淘汰（project-budget-normalize.ts:18-25, 42-69, 311-349）。进入计算后则零容忍：`assertNonNegativeNumber/Integer`、`multiplyMoney` 连乘后检查溢出、`parseIsoDate` 用"解析后重新格式化必须等于输入"的往返校验拒绝 2026-02-30 这类假日期（project-budget.ts:120-160），sumMoney 对非法币种/非有限金额直接 throw（money.ts:120-135）。唯一例外是编辑期友好：草稿行日期不完整或越出阶段时 usage-days 返回 0 而非抛错，避免打断输入（project-budget.ts:211-229）。复用原则：脏数据只该在边界处被消毒一次；计算层遇到脏数据说明有 bug，就该炸。

### 8. 报价三种计价内核 + minimumFee 地板 + 错误三态
`PricingTemplateKind` 三内核共用一个求值入口 `evaluatePricingTemplate`（pricing-templates.ts:543-594）：area-tier 又分三模式——单价制（命中档×面积）、**累进制（每档只对落入该档的面积区间计价，`span = min(area,上界) - 下界` 逐档累加**，pricing-templates.ts:515-537）、一口价；style-minute 是难度等级×分钟数；cost-markup 是成本基数先乘管理费 (1+overhead%) 再乘设计毛利 (1+markup%) 的**复利式**加成（pricing-templates.ts:581-593）。结果统一带 `minimumApplied` 标志（最低收费地板兜底后 UI 可提示"按最低价收取"）和 `error` 三态（no-matching-tier / no-style-level / missing-input），让"算不出价"成为可展示状态而非异常（pricing-templates.ts:501-508, 547-557）。求值结果永远是模版币种，何时换算成报价币种由调用方决定（注释明言，pricing-templates.ts:539-542）。

### 9. QuoteLinePricing 快照冻结哲学：报出去的价永远可复算、永不被追改
模版拉入报价行的瞬间，`createQuoteLineFromTemplate` 把 `structuredClone(template)` 整个冻进 `pricing.snapshot`，连同 inputs、模版币种原始金额 sourceAmount、以及按当时汇率折成报价币种的 unitPrice 一起落盘（pricing-templates.ts:655-693）——之后改库里的模版只动库存副本，已发出的报价一个字不变（libraries.ts:372 注释）。`templateId` 仅作溯源，"快照才是事实来源"（domain.ts:419-424）；反序列化时 `normalizeQuoteLinePricing` 会重新校验整个快照并从快照推导 kind，杜绝 kind 与 snapshot 分叉（pricing-templates.ts:262-289）。改价不改旧单而是 `reviseQuote` 克隆链：新 id、新月度编号、version+1、状态重置 draft、行 id 全部重新生成（lib/api/quotes.ts:120-146）。配套两个小技法：报价编号 `QT-YYMM-NNN` 按月扫描已有最大序号+1，删单不会引起重号错乱（quotes.ts:41-56）；updateQuote 用 `"projectId" in input` 区分"没传这个字段"和"显式清空"，防止编辑器清掉的可选字段被旧值复活（quotes.ts:99-114）。毛利计算 `calculateQuoteMargin` 把内部预算成本换算到报价币种求 profit，revenue 为 0 时 marginPercent 返回 null 让 UI 显示横杠——毛利只进内部导出，与客户可见的 totals 分离（pricing-templates.ts:623-649）。

### 10. 订阅提醒的纯日历数学：锚点日 + 逐月 clamp + 原始日回弹
续费/积分刷新提醒完全不用 Date 加减毫秒，而是自建 `CalendarDate{y,m,d}` 值对象：本地时区只在取"今天"时用一次，之后比较全部通过 `Date.UTC/86400000` 的天序号进行，规避时区与 DST 坑（lib/utils/subscription-reminders.ts:43-56）。月度周期用"绝对月数"推进并把日子 clamp 到目标月长（31 号→2 月 28 号，subscription-reminders.ts:61-71），且**锚点永远保留用户选的原始日**，所以 2 月被压到 28 后 3 月自动弹回 31（注释明言这个坑，subscription-reminders.ts:227-233）。找下次到期日先按已过月数一步跳到附近、最多再修正一格，不做循环递推（subscription-reminders.ts:103-122）；再叠加 expiresAt 截止剪除（125-146）和 0..leadDays 提醒窗（174-177）。复用要点：一切"每月 N 号"类周期逻辑，都该用"锚点+clamp+天序号比较"这套纯函数，而非 setMonth 连环调用。

### 11. 预算计算的三态来源与 legacy fallback 冻结
`ProjectBudgetCalculation.source` 显式区分 `structured / legacy / none`（project-budget.ts:104-116）：无结构化预算的老项目由调用方传入全部旧成本+订阅成本作 `legacyFallback`，sumMoney 聚合后当作只读的预算展示值，专门为了让老项目的 totalProjectCost 数字不变（project-budget.ts:62-84, 696-717）；一旦建立结构化预算，实际成本报表就与预算脱钩独立。附加的完整性检查：预算引用未知阶段或重复阶段直接抛错（project-budget.ts:643-656），而 normalize 层的 `normalizeProjectBudgetForPhases` 则以"当前阶段列表"为骨架重建整个预算——首个匹配行获胜、孤儿/重复行静默丢弃（project-budget-normalize.ts:311-349），两层各司其职（读入时对账、计算时断言）。

---

## 4. 导出系统（报价书 / 报告 / 工作流 / 分享）

> 范围：`lib/utils/report-share-common.ts`、`quote-share.ts`、`summary-report-share.ts`、`project-report-share.ts`、`workflow-share.ts`、`components/share/report-export-modal.tsx`（以下路径均相对 `/Users/likun/Cache/Studio Map OS/Codex/`）

### 1. "关门式" CSP 是自包含 HTML 导出的地基，且按需求精确开洞

每个导出 HTML 都在 `<head>` 里写 meta CSP，基线是全关：`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`，再配 `<meta name="referrer" content="no-referrer">`。这意味着即使 escapeHtml 漏了某处，注入的脚本、外链图片、表单提交、iframe 嵌套全部被浏览器层拦掉——导出文件会被邮件转发到完全不受控的环境，这是最后一道防线。三个报告各自只开必需的洞：报价书纯静态所以 `script-src 'none'`（`lib/utils/quote-share.ts:357`）；总表报告为苏美尔语楔形文字额外开 `font-src https://fonts.gstatic.com`（`lib/utils/summary-report-share.ts:534`）；项目报告因内嵌 workflow viewer 脚本，用每次导出随机生成的 nonce 精确放行这一段脚本（`lib/utils/project-report-share.ts:277-279, 293`），nonce 由 `crypto.getRandomValues` 生成 32 位 hex。复用要点：CSP 严格程度按"这份文件需要什么"逐文件定制，而不是全项目一套。

### 2. 封面图内嵌 data URL：白名单正则同时当输入校验和输出校验

`embedReportCoverImage` 的流水线（`lib/utils/report-share-common.ts:44-76`）：源已是 data URL 则用正则 `supportedDataImagePattern` 白名单直接放行；否则 `fetch`（same-origin 凭证 + AbortController 5 秒超时）→ blob → 校验 MIME 白名单（avif/gif/jpeg/png/webp，**不含 svg**，因为 SVG 可携带脚本）+ 12MB 上限（`:1-3, 67`）→ FileReader 转 data URL → **对转换结果再跑一次同一个正则**（`:72`）。任何一步失败都静默返回 null，报告降级为纯 CSS 渐变背景而非导出失败。同一策略延伸到品牌 logo：数据构建层只接受已经以 `data:` 开头的存储值（`lib/utils/quote-share.ts:137`、`lib/utils/summary-report-share.ts:323-326`），因为 CSP 的 `img-src data:` 会让远程 URL 直接裂图——与其导出裂图不如构建时就滤掉。

### 3. 打印/PDF 组合拳：满页渐变靠 @page margin:0 + 容器 padding 模拟页边距

五个互相配合的规则（集中在 `lib/utils/quote-share.ts:361, 429-438`，summary/project 同套路 `summary-report-share.ts:539,656`、`project-report-share.ts:298,357`）：
- `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` 挂在通配符上，保证所有背景色/渐变进 PDF 而不是被打印机"省墨"抹白；
- `@page{size:A4;margin:0}` 把页边距归零——因为 @page 的 margin 区域不渲染 body 背景，想让渐变铺满整页只能这么做，真正的页边距改由 `@media print{.doc{padding:9mm}}` 在内容容器上模拟；
- `thead{display:table-header-group}` 让费用明细表跨页时自动重复表头；
- break-inside 分层：行级单元（tr、条款、scope 列、fee-totals）`break-inside:avoid`，但章节容器显式 `break-inside:auto` 允许拆页，只有 head-card/notes/signature 这类必须完整的块整体 avoid——盲目对大容器 avoid 会造成大段空白页；
- print 下去掉 box-shadow、报告底色转纯白。

### 4. 显式 CJK 字体栈防导出文件在别人机器上丢中文字形

字体栈不写 `sans-serif` 了事，而是显式列出 `"PingFang SC","Hiragino Sans GB","Noto Sans SC","Source Han Sans SC","Microsoft YaHei"`（`lib/utils/quote-share.ts:349`、`summary-report-share.ts:524-526`）：导出 HTML 脱离 app 环境后，打印渲染管线对中文回退字体的映射不可靠，显式声明覆盖 macOS/Windows/Linux 三平台。更进一步的例外处理：语言为 `sux`（苏美尔语）时条件注入 `@font-face` 加载 Noto Sans Cuneiform 并限定 `unicode-range:U+12000-123FF...`（`summary-report-share.ts:521-522`），同时 CSP 才开 font-src——字体声明、CSP 开洞、语言判断三者联动，其它语言的导出文件保持零外部请求。

### 5. 统一预览弹窗：iframe srcDoc 承载完整文档，contentWindow.print() 复用其 @media print

`ReportExportModal` 是四个导出入口（报价书/总表/公司/项目）共用的终端：接收**已完整渲染的 HTML 字符串**，用 `<iframe srcDoc={html}>` 做所见即所得预览；"导出 PDF"按钮只做 `frameWindow.focus(); frameWindow.print()`（`components/share/report-export-modal.tsx:74-83, 115-120`）——打印走的是 iframe 内文档自己的 @media print 规则，于是**一份 HTML 字符串同时服务预览、PDF、HTML 下载三个出口**，不存在"预览和导出不一致"的可能。HTML 下载用 Blob URL + `a[download]` + `setTimeout(0)` 回收（`lib/utils/report-share-common.ts:151-162`）。一个具体的坑：弹窗初始聚焦用 setTimeout 16ms 轮询而非 rAF（`report-export-modal.tsx:40-50` 注释），因为 ModalPortal 下一次 commit 才挂载子节点，且 rAF 在隐藏/后台文档中被挂起会导致永远聚不上焦。

### 6. 品牌 chrome 做成共享渲染模块，SVG/PNG 资产以字符串常量内嵌

产品决策"导出 HTML 必带品牌页头脚"落地为 `report-share-common.ts` 中的四件套：`reportBrandMarkSvg`（手写内联 SVG 字符串，`:125`）、`reportChromeStyles`（含 `@media print{...break-inside:avoid}`，`:127-136`）、`renderReportChromeHeader/Footer`（`:138-149`），labels 经 `buildReportChromeLabels(t)` 从 i18n 注入，每个报告模板直接拼接。报价书的 "Business Proposal" 字标是 1088x320 透明 PNG 直接以 base64 常量写死在源码里（`lib/utils/quote-share.ts:21-22`）——对不常变的品牌资产，硬编码 data URL 比运行时读取/转码更可靠，且天然满足 CSP。workflow-share 独立使用时提供英文默认 chrome 兜底（`lib/utils/workflow-share.ts:6-12`）。

### 7. CSS-only 像素城市动画在静态导出里复刻动效

工作室总表的 hero 把 dashboard 的 PixelHeroScene 复刻成零 JS 版本（`lib/utils/summary-report-share.ts:433-477` 结构 + `:602-638` 样式）：楼体用 `repeating-linear-gradient` 画竖条纹，窗户是 grid 容器里重复的 `<i>` 元素配 nth-child 变色变透明度，像素太阳用两条互相垂直的三段 linear-gradient 拼出"去角"方块，所有动画关键帧统一 `steps(N,end)` 缓动模拟像素跳帧感。楼与云的布局数据是 style 字符串数组常量直接内联到 style 属性（`:433-459`）。这套做法的收益：满足 `script-src 'none'` 的 CSP、浏览器里打开有动画、打印成 PDF 时动画自然静止在关键帧上不需任何特判。

### 8. Proposal 版式：面板负外边距"出血"对齐 + 双列标题补偿

报价书要复刻"色块通到纸边、正文文字统一栅格"的参考版式，核心是一个 CSS 变量技法（`lib/utils/quote-share.ts:383-386`）：`--panel-pad` 定义面板内边距，面板同时设 `padding:var(--panel-pad)` 和 `margin-inline:calc(var(--panel-pad) * -1)`——色块向外扩出自身 padding 的宽度，内部文字则回落到与面板外正文完全相同的左右边线；head-card、beige、blue、notes 四种色块共享同一外沿（`:370-372, 425`）。配套细节：06/07 双列布局里，蓝色面板的 padding 把标题压低，右侧无底色的 policy 列就补 `padding-top:var(--panel-pad)` 让两个标题严格同线（`:414-417`，源码注释写明意图）。可复用为任何"卡片流+满宽色带"混排版式。

### 9. workflow 画布序列化：base64 payload + textContent 注入，注入面为零

用户自由输入的节点文本不参与 HTML 字符串拼接：整个 workflow JSON 经 `TextEncoder` → 按 0x8000 分块 `String.fromCharCode`（避免大数组展开爆调用栈，同时处理非 Latin-1）→ `btoa`，塞进 `<script type="application/octet-stream">` 惰性块（`lib/utils/workflow-share.ts:146-161, 247`；`project-report-share.ts:225-234, 417`）；页面内 viewer 脚本 `atob` → `TextDecoder("utf-8",{fatal:true})`（非法字节直接抛错而非静默产出乱码）→ `JSON.parse`，最后一律用 `textContent`/`style.xxx` 写 DOM（`workflow-share.ts:171-174` 注释点明此设计）。颜色等样式值在 viewer 端再过一次 `/^#[0-9a-fA-F]{6}$/` 白名单。escapeHtml 只需要负责模板自身的少量标题字段，攻击面收敛到接近零。

### 10. 零依赖只读画布 viewer：1px scene + transform 表达 viewport

导出页里复刻 React Flow 的浏览体验只用约 150 行原生 JS（`lib/utils/workflow-share.ts:285-407`；项目报告版支持多画布，用 data-workflow-index 关联，`project-report-share.ts:468-581`）：scene 是 `1px×1px、transform-origin:0 0` 的容器，`translate(x,y) scale(zoom)` 即 viewport；缩放以指针为锚点做世界坐标换算（`setZoom` 先反解 world 再重投影）；`fitView` 由节点 AABB + padding 算包围缩放；拖拽用 pointer capture；滚轮缩放用 `Math.exp(-deltaY*.0015)` 得到平滑指数曲线；连线是 SVG cubic bezier，控制点距离 `max(72, |dx|*.46)`，`vector-effect:non-scaling-stroke` 保证线宽不随 zoom 缩放。节点附件下载也全内置（Blob + a[download]），文件名清洗函数在 viewer 脚本里独立重写一份（静态页无法 import 共享模块，这是自包含导出的固有代价）。

### 11. build → create 两段式：数据打平层与字符串模板层严格分离

每个报告都拆成 `build*ReportData`（把领域对象 + `t()` 翻译打平成纯可序列化结构，所有 label 预翻译为字符串）和 `create*ReportHtml`（纯模板函数，不再接触 i18n/store/时间）两步。收益一：模板层可同步、可 memo——报价书直接 `useMemo(() => createQuoteReportHtml(buildQuoteReportData(...)))`（`components/companies/quote-export-modal.tsx:20-23`）；summary/project 仅因 embedCoverImage 而 async。收益二：**安全边界在构建层就成立**——`buildQuoteReportData` 的注释明确"internal margins, budget costs... stay out of the exported document by construction"（`lib/utils/quote-share.ts:115-120`），客户版报价书不含毛利/成本不是靠模板里"不渲染"，而是数据结构里根本没有。收益三：颜色处理集中在共享工具（YIQ 亮度公式 `0.299/0.587/0.114`、阈值 0.58 自动黑白文字，`report-share-common.ts:90-98`），三个报告与两个 viewer 脚本行为一致。

### 12. 无 JS 图表：conic-gradient 饼图与百分比定位甘特

状态分布饼图不用 SVG/canvas：把各状态计数换算成累计百分比串成 `conic-gradient(color a% b%, ...)` 直接当背景（`lib/utils/summary-report-share.ts:367-385`），中心圆是覆盖其上的普通 div，零计数时兜底单色。甘特总表用"月序号 + 当月天数比例"的浮点坐标系（`ganttMonthKey`/`ganttMonthPosition`，`:148-221`）：一切定位（条形 left/width、今日线）都归一化为容器百分比，天然响应式且打印不变形；`widthPct` 下限 0.75% 保证超短项目仍可见（`:211`），今日标签在 >88% 位置时翻到线左侧防溢出（`:489-491`）。日期解析统一 `Date.parse(value+"T00:00:00Z")` 走 UTC，避开时区把项目挪进错误月份的经典坑（`:148-152`）。

---

## 5. UI 骨架、i18n、动画省电与 PWA

### 1. i18n 分层：一份全量基线 + 三档覆盖策略，全部靠 `satisfies` 在编译期锁死

核心思路是**不写运行时回退逻辑**，把回退在模块求值时用对象展开"烘焙"死，再用 TypeScript `satisfies` 把每一档语言的覆盖承诺变成编译期契约。分四档：① zh/en 是全量基线，直接写在 `translations.ts` 里，key 集合由 `keyof typeof baseTranslations.en` 推导（`lib/i18n/translations.ts:47`、`:2959`）；② ja 是"覆盖层"，`jaOverrides satisfies Partial<Record<keyof typeof baseTranslations.en, string>>`（`:2935`），合并时先铺 en 再盖 ja（`:2940-2944`），允许漏译但不允许拼错 key；③ ru/tr 是"编译期全量约束"，locale 文件尾部用 `satisfies Record<Exclude<TranslationKey, StorageTranslationKey>, string>`（`lib/i18n/locales/ru.ts:991`、`tr.ts` 同），基线每加一个 key，ru/tr 不补译就直接编译失败——这是"上架语言必须完整"的机械保证；④ de/es/fr/ko/pt/th 用 `satisfies Partial<...>` 尽力而为，缺的自动落回 en。最终导出用 `as const satisfies Record<Language, Record<TranslationKey, string>>`（`:2957`）证明合并后每种语言都是全量。另一个细节：storage 相关文案独立成 `storage-translations.ts` 模块并自带 key 命名空间，ru/tr 的约束里用 `Exclude<>` 把它剔掉，使两个模块的覆盖度可以独立强制（`lib/i18n/storage-translations.ts:598`）。复用要点：**"Partial 覆盖 + Exclude 全量 + 展开合并"三件套，让翻译完整度成为构建门禁而非 QA 事项**。

附带小技法：`t()` 出口统一套一层 `keepNumericWordPairsTogether`，用正则把 "3 days"、"16-digit" 里的空格/连字符替换成 NBSP/不换行连字符，防止数字和单位被折行拆散（`lib/i18n/non-breaking.ts:1-11`，调用在 `components/providers/app-providers.tsx:160`）。

### 2. 苏美尔语彩蛋：生成式伪翻译，且"玩笑不许遮蔽危险操作"

`sux` 不是手写词条，而是一个**接收整份英文全量翻译、逐 key 生成楔形文字的纯函数**（`lib/i18n/locales/sux.ts:211-219`）。机制分四层：① 概念词典 `signLexicon` 把约 130 个界面概念映射到楔形文字组合（`:12-139`）；② `splitWords` 同时拆解 camelCase 的 key 名和英文原文取词，命中词典的符号去重后最多取 6 个（`:165-186`）；③ 没命中任何词的 key 用字符码求和做哈希，从 8 个备用符号里确定性地挑两个（`:172-178`）——保证同一 key 每次构建产出一致；④ 两道安全网：`safetySensitiveKeyPattern` 匹配 delete/backup/recovery/password 等 key 时，楔形文字后面**强制拼回英文原文**（`:157-158`、`:200-202`），文件头注释明说"玩笑永远不能隐藏破坏性或恢复类指令"；`protectedTokenPattern` 把占位符 `{day}`、金额、"Apple ID"、文件路径等 token 原样保留拼接（`:160-161`、`:204-208`）。配套的字体方案：`@font-face` 用 `unicode-range: U+12000-1254F` 只对楔形文字码位加载 Noto Sans Cuneiform，`html[lang="sux"]` 才切字体族（`app/globals.css:6-15`、`:48-50`）；日期数字格式化则把 sux 映射回 en-US（`translations.ts:28-29`）。复用要点：**彩蛋语言用"生成器 + 安全 key 白名单"实现，成本 O(1) 维护，且天然跟随基线更新**。

### 3. 背景动画三层省电：三个"没人在看"的状态各配一个属性开关

高成本装饰动画（jelly 果冻场 + 像素城市）的省电由三个互不干扰的机制叠加，全部收敛为"往 DOM 上打属性 → CSS 一条 `animation-play-state: paused !important`"，因为**暂停的 CSS 动画栅格化一次后就零开销**（注释 `app/globals.css:281-287`）：

- **层 1（标签页隐藏）**：`BackgroundMotionController` 监听 `visibilitychange`，在 `<html>` 上切 `data-motion-hidden`，CSS 选择器 `:root[data-motion-hidden] *` 冻结**全部**动画（`components/providers/background-motion-controller.tsx:26-29`、`globals.css:288-296`）。
- **层 2（用户发呆）**：4 秒无 pointer/keyboard/wheel/scroll 输入则打 `data-motion-idle`；CSS 只作用于 `.jelly-field` 和 `[data-scene-root]`，**功能性动画（spinner/骨架屏）继续跑**（`background-motion-controller.tsx:31-53`、`globals.css:298-314`）。定时器是惰性重臂的：到点后不再自轮询，等下一次输入再重启（`:35-53`）；scroll 用 capture 捕获内层容器滚动（`:62-70`）。
- **层 3（滚出视口）**：`SceneRoot` 在场景顶部注入一个 1px 透明哨兵元素，用 IntersectionObserver 观察哨兵而非场景本体，顶边一离开视口就打 `data-motion-paused`（`components/scenes/scene-root.tsx:29-48`）。**关键决策**：以"顶边是否在屏内"为准而不是可见面积比例——比例方案会让比视口还高的横幅永久判定为"可见度不足"而冻死（注释 `:10-18`，这是踩过坑后的修正）。

复用要点：省电条件全部做成幂等的属性开关 + CSS 兜底，三层"任一暂停、互不打架"；哨兵元素技法把"任意高度元素的顶边可见性"化简为标准 intersecting 布尔测试。

### 4. 纯 CSS 像素城市：定位数组生成 DOM，`nth-child` + 负延迟造伪随机，`steps()` 造 8-bit 感

像素场景零 canvas、零 JS 动画：`pixel-hero-scene.tsx` 用三个 `as const` 字符串数组（Tailwind 定位类）声明云、远楼、近楼的布局，窗户就是 N 个空 `<span>`（`components/auth/pixel-hero-scene.tsx:3-29`、`:42-50`）。视觉技法在 CSS 侧：① 楼体是 `display: grid` + `grid-auto-rows: 12px`，窗户 span 自动排版成窗格（`app/globals.css:605-618`）；② 闪烁的"随机感"用 `nth-child(2n)/(3n+1)/(4n+2)/(5n)` 叠加不同颜色/透明度/负 `animation-delay` 制造（`:628-640`、`:976-982`），一条 keyframes 服务全部窗户；③ 所有动画用 `steps(2/3/8, end)` 缓动，帧间跳变而非平滑插值，这是"像素风动起来"的关键（`:582`、`:593`、`:973`）；④ 全场景 `image-rendering: pixelated` + 一层 10px 网格 repeating-gradient 叠加 `mix-blend-mode: overlay` 做出 CRT 网点（`:537`、`:540-550`）。整个场景包在 `SceneRoot` 里自动获得第 3 条的省电行为。复用要点：**装饰性像素场景 = 数据数组 × 空元素 × nth-child 伪随机 × steps() 缓动**，改布局只动数组。

### 5. Jelly 交互层：一个全局组件给全站按钮/卡片上"果冻手感"，零逐组件接线

`JellyInteractions` 渲染 `null`，只在 document 上挂 capture 阶段的 pointer/keyboard/focus 监听，用 `closest()` 匹配 `button/a[href]/[role=button]/[data-jelly-control]` 和 `[data-jelly-card]` 来发现目标（`components/providers/jelly-interactions.tsx:5-7`、`:568-579`）——新页面写按钮**不需要任何接入代码**，卡片打个 data 属性即可。硬技法：

- **可打断动画**：每次手势先 `getComputedStyle` 读当前 `scale`/`rotate` 作为第 0 帧（`:72-80`），cancel 旧动画再 `element.animate(..., { fill: "forwards" })`，所以快速连点/中途松手不会跳帧（`:112-149`）。按下动画 `persist=true` 常驻，松手播放 backOut 过冲回弹（`:168-195`）。
- **拖拽消歧**：pointermove 位移 >8px 判定为拖拽，取消果冻并复位（`:385-390`）；对照 `app-shell.tsx` 里导航条的 drag-pan 也用同款 8px 阈值 + `suppressClick` + `setTimeout(0)` 清除，防止拖动误触发链接（`components/layout/app-shell.tsx:274-338`）。
- **JS/CSS 分工**：注释明说"JS 拥有可打断的挤压序列；CSS 拥有 hover 抬升和指针倾斜"（`globals.css:335-339`）——倾斜用 rAF 节流写 CSS 自定义属性 `--smos-card-tilt-x/y/turn`（`jelly-interactions.tsx:402-424`），CSS 侧汇入一个 `perspective(900px) rotateX/Y/Z` 复合 transform 并配 171ms 过渡（`globals.css:376-401`）。两套动画分别作用于 `scale`/`rotate` 独立属性与 `transform`，互不覆盖。
- **可访问性对等**：Enter/空格触发同样的按压/回弹（`:474-526`）；`prefers-reduced-motion` 变化时**实时**取消所有运行中动画并清倾斜变量（`:555-566`），CSS 侧再用 `!important` 兜底（`globals.css:417-439`）。
- 性能细节：`will-change: transform` 不写死在元素上，而是由 `smos-game-motion-active` 类只在动画期间挂载（`globals.css:340-348`）。

### 6. 离线 PWA：全源码哈希做 precache revision，`skipWaiting` 与 `reloadOnOnline:false` 都是踩坑后的显式决策

Serwist 配置里的每个非默认项都有注释写明因果：① **revision 策略**——`next.config.ts` 在构建时递归收集 app/components/lib 下全部 .ts/.tsx/.css 文件，整体算一个 sha256 作为所有 app-shell 路由的 precache revision（`next.config.ts:38-58`），任何代码改动都会让全部页面缓存失效，避免"部分页面新、部分页面旧"的混装态；图标类静态文件则按单文件哈希（`:69-70`）。② **`skipWaiting: true`**——注释记录了坑：安装态 PWA 窗口常年不关，waiting worker 永远等不到激活，线上修复一直被旧 precache 顶着；因为业务数据全在 IndexedDB，刷新永远安全，所以新 worker 直接接管（`app/sw.ts:26-30`）。③ **`reloadOnOnline: false`**——网络切换绝不能重载一个已解锁的本地工作区（`next.config.ts:101-103`）；`cacheOnNavigation: false` 因为固定路由已全部 precache，运行中不做后台抓取（`:95-97`）。④ 离线兜底只对 `request.destination === "document"` 的导航请求回退到预缓存的 /offline 页（`sw.ts:15-18`、`:34-41`）；precache 匹配忽略所有 URL 参数（`:22-24`）。⑤ 同一份配置用两个环境变量岔出**三个部署形态**：GitHub Pages 静态导出（`/SMOS` basePath + trailingSlash + 每路由 `index.txt` 数据文件也进 precache，`:12`、`:34-36`）、便携 standalone 包、本地 dev（dev 下 SW 整体禁用，`:98`）。

### 7. 可分发离线包：隔离 distDir 构建 + license 合规硬门禁

`scripts/package-pwa.mjs` 把 PWA 打成"解压双击即用"的本地包，三个硬技法：① **构建隔离**——用 `NEXT_DIST_DIR=.next-pwa` 单独输出目录，不碰 dev 的 `.next`；并在构建前快照 `next build` 会篡改的 `tsconfig.json`/`next-env.d.ts`，finally 里无条件写回（`scripts/package-pwa.mjs:25-28`、`:347-363`）——这是"dev 与 build 互斥"问题的工程化解法。② **license 合规是构建门禁**——递归扫描打包产物里的 node_modules，逐包按 `name\0version` 身份回源码树找 LICENSE/NOTICE 文件，**找不到就抛错终止打包**（`:280-285`）；对 `@next/env`、`client-only` 这类不带 license 文件的 marker 包，做"同仓库同许可"验证后从父包继承（`:126-186`）；最终生成 `THIRD_PARTY_NOTICES.txt` + 每包独立 license 目录。③ **发行体验**——生成 .bat/.command/.sh 三平台双击启动器，固定 `127.0.0.1:3002`；README 明确警告"浏览器数据按 origin+端口隔离，换端口=换存储"，并给出改端口与数据迁移（加密备份）的正确姿势（`:410-418`、`:438-452`）。顺带裁掉 `images.unoptimized` 下用不到的 sharp/@img 原生依赖再做 license 扫描（`:383-387`）。

### 8. 本地 https 与内嵌浏览器 http 的双 dev 配置

`npm run dev` 走 `next dev --experimental-https` + mkcert 生成的本地证书，固定 3305 端口（`package.json:6`、`certificates/localhost*.pem`）——安全上下文是硬需求（WebCrypto 注册、SW、CloudKit JS 都要求；文案里也有 `authSecureContextRequired` 兜底提示）。但 IDE 内嵌预览浏览器不信任自签证书，页面会挂起，所以 `.claude/launch.json` 里并存第二套配置：`smos-dev-http` 直接 `npx next dev` 跑纯 http 的 3306（`.claude/launch.json:4-16`）——localhost 上 http 也算 secure context，功能验证不受影响。复用要点：**需要 https 的 PWA 项目，给自动化/内嵌浏览器单独留一条纯 http localhost 通道，两个端口互不共享 IndexedDB，测试数据天然隔离**。

### 9. 甘特总表：sticky 首列 + pointer capture 拖拽平移 + "月份连续坐标系"

`project-gantt-overview.tsx` 三个可移植技法：① **sticky 列**——整表只有一个横向滚动容器，左侧项目名列 `sticky left-0 z-20` 配同色背景和右投影，条形图从其下方滑过（`components/dashboard/project-gantt-overview.tsx:185-203`）；表头留出 `h-11` 空行与右侧"今天"徽章车道对齐（`:190-191`）。② **鼠标限定的拖拽平移**——`pointerType !== "mouse"` 直接返回，触屏保持原生滚动惯性；鼠标按下 `setPointerCapture` 后按位移差写 `scrollLeft`，配 `select-none` + grab/grabbing 光标（`:65-92`）。③ **时间轴不用像素算**——把日期折算成连续"月单位"：`monthKey = year*12 + month`，`monthPosition` 再加 `(日-1)/当月天数` 的小数部分（`:35-42`），条形位置全部用百分比表达，容器宽度只由 `月数 × 76px` 的 minWidth 决定（`:163`）；条形宽度补一天的分数使其覆盖结束日当天（`:125-128`）；"今天"竖线超过 88% 位置时徽章自动翻到线左侧防溢出（`:256`）。

### 10. 设计令牌：RGB 三元组变量 + 全整数 opacity 刻度

Tailwind 颜色全部定义为 `rgb(var(--color-x) / <alpha-value>)`（`tailwind.config.ts:14-24`），令牌本体是 `:root` 里的裸 RGB 三元组（`app/globals.css:17-27`）——这样 `bg-ink/62` 之类的 alpha 修饰符仍然可用，而改主题只动 CSS 变量。配套一条冷门技法：设计稿用了大量非 5 倍数透明度（/82、/62、/34），Tailwind 默认只有 5 的倍数，于是用 `Object.fromEntries(Array.from({length:101}...))` 把 opacity 刻度扩展到 0-100 每个整数（`tailwind.config.ts:11-13`，注释写明动机）。圆角收敛为 `studio-sm/studio/studio-lg/studio-xl` 四档语义令牌（`:29-34`），全站卡片层级感由此统一。

---


---

## 6. 横切工程法则（跨子系统提炼）

以下法则在多个子系统里独立出现过两次以上，视为本项目的"家规"：

1. **竞态令牌三件套**：`epoch`（权威事件推进，裁决迟到响应——认证状态机）、`generation`（工作区激活代际，作废旧保存）、`revision`（本地保存计数，同步终审比对）。任何 async 流程动手前记录令牌、落笔前复验令牌。
2. **锁的固定层级**：全局 auth 锁 / database 锁 ⊃ per-workspace 锁，永远同序获取；跨 tab 用 `navigator.locks`，缺席时降级进程内 promise 队列，且队列用"释放信号"衔接防止前序异常毒化。
3. **双层校验哲学**：信任边界（导入/云端/hydrate）走 normalize——垃圾归零、越界夹回、非法丢弃；进入计算后 assert——遇脏即 throw。normalize 的产物仍要过 validate（"宽进修复 + 严出把关"缺一不可）。
4. **快照冻结 vs 活引用，一律显式**：挂 `costTemplateId` = 联动（每次写库全量物化），不挂 = 冻结；报价行把整个模版 `structuredClone` 进 snapshot；分享链接加密的是脱敏后的冻结快照。对外发出的数字永远可复算、永不被追改。
5. **写后读回验证**：明文→加密迁移、首次云端上传（provisioning→ready）、恢复备份，都在"写入成功"之后**重新读出并解密/校验**才算数，然后才删旧副本或翻状态。
6. **失败不留幻觉态**：保存被拒绝就把内存回滚到 lastPersistedDatabase（"a refused save leaves no phantom edits"）；同步冲突期一刀切断写入（含 notify 豁免防登录死锁）；provisioning 中断可续跑。
7. **占位不如不显示**：无标题任务不渲染"未命名任务"、无负责人不显示"负责人"胶囊、无 Logo 不渲染框——空状态直接省略元素，而非填充占位词。
8. **口径常量化**：人日=10 小时、月=20 工作日、chunk=384KiB、防抖=1.5s……全部是 export 的常量+纯函数，UI/导出/校验 import 同一来源。
9. **主密钥不出模块**：同步协调器从不持有密钥，auth 用 `validateRemoteBundle` 回调注入"真实解密一次"的验证；密钥每次复制使用、用毕 `fill(0)`。
10. **编译期门禁优于运行时检查**：翻译完整度用 `satisfies Record<...>` 锁死；license 合规是打包硬门禁；i18n key 拼写错误无法通过 tsc。

---

## 7. 坑清单（快速对照表）

| 坑 | 症状 | 解法 | 详见 |
|---|---|---|---|
| CloudKit JS postMessage 毒化 | Apple 登录静默失败 | 布防窗口+origin 白名单+放行后强制 REST 跟进 | 1.1 / AUTH_PLAYBOOK 6.1 |
| `setUpAuth()` 撕裂在飞请求 | 随机 NETWORK_ERROR | 身份缓存 60s TTL + 单飞 promise | 1.3 |
| 分组量词正则栈溢出 | 5MB base64 校验 RangeError | 单字符类线性扫描 + 长度模 4 + roundtrip | 2.3 |
| Safari 事务 auto-commit | 事务中 await 后写入丢失 | 加密全部在事务前完成，事务内只同步链 | 2.6 |
| IndexedDB 请求永不回调 | 界面无限挂起 | 15s watchdog 主动 abort | 2.6 |
| 打印丢背景色 | PDF 深色区变白、白字消失 | `print-color-adjust:exact` 挂通配符 | 4.3 |
| 打印丢中文字形 | PDF 中文占位不渲染 | 显式 CJK 字体栈 + 避免 650 类非百位字重 | 4.4 |
| @page margin 吃掉满页背景 | 渐变四周留白 | `@page{margin:0}` + 容器 padding 模拟页边距 | 4.3 |
| 隐藏文档 rAF 不触发 | 弹窗聚焦/轮询逻辑僵死 | 用 setTimeout 轮询代替 rAF | 4.5 |
| 可见比例判定冻死高横幅 | 全屏场景永久暂停 | 1px 顶边哨兵 + IntersectionObserver | 5.3 |
| dev/build 互斥 | build 篡改 tsconfig、抢 .next | 隔离 distDir + 快照回写 tsconfig | 5.7 |
| 内嵌浏览器不信自签证书 | 预览页面挂起 | 并存纯 http 3306 dev 配置（数据与 3305 隔离） | 5.8 |
| 登录流程被冲突写保护阻断 | 登录死锁 | write guard 的 `notify:false` 豁免通道 | 2.13 |
| 月末日期 setMonth 连环坑 | 31 号订阅 2 月后永远变 28 号 | 锚点保留原始日 + 逐月 clamp + 天序号比较 | 3.10 |
| 多币种分桶舍入不平 | 分类合计 ≠ 总额 | 显式 reconcile 调平步骤 | 3.6 |

---

*Studio Map OS · 定稿于 2026-07-30 · 与代码同仓，代码即注脚。*
