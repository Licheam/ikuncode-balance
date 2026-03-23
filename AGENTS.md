# AGENTS.md

本文件用于给后续协作开发者或编码代理快速建立上下文。

## 项目定位

这是一个计划中的 VS Code 桌面扩展，目标是在状态栏中显示 IKunCode 余额。

当前仓库还没有代码，现阶段以“方案收敛 + MVP 落地路径”优先。

## 当前共识

- 首发目标是桌面版 VS Code 扩展
- 已确认可用接口为 `GET /api/user/self`
- 第一阶段默认采用“用户提供现有登录态”的方案
- 登录态优先通过 Cookie 复用，不优先做自动登录
- 敏感凭证必须存入 `SecretStorage`

## 不要过早做的事

- 不要先做浏览器 Cookie 自动读取
- 不要先做 Web Extension
- 不要先做复杂 UI
- 不要把 `access token` 或 `new-api-user` 存进 settings.json
- 不要把敏感头或 Cookie 打到日志里

## 优先任务顺序

1. 收敛最小请求头集合
2. 验证登录失效返回特征
3. 落状态栏 + 手动刷新
4. 接 SecretStorage
5. 再补自动刷新和错误处理
6. 最后准备打包发布

## 调研目标

后续调研时，优先回答这几个问题：

1. 请求时最少需要哪些 Header
2. 登录失效时返回什么特征
3. `new-api-user` 的来源是否稳定
4. 是否存在频率限制或风控

## MVP 验收标准

- 可以在状态栏看到余额或明确错误态
- 可以通过命令设置 `access token + new-api-user`
- 认证信息保存在 `SecretStorage`
- 可以手动刷新
- 可以自动刷新
- 登录失效时不会静默失败

## 建议模块划分

- `src/extension.ts`
  - 扩展激活与释放
- `src/services/balanceRefreshService.ts`
  - 定时刷新与状态同步
- `src/clients/ikunCodeClient.ts`
  - 请求 `GET /api/user/self` 并解析 `data.quota`
- `src/parsers/balanceParser.ts`
  - 余额提取
- `src/services/authStore.ts`
  - `SecretStorage` 封装
- `src/commands/*.ts`
  - 命令入口

## 代码约束

- 默认使用 TypeScript
- 默认使用 ASCII
- 敏感信息不落盘、不明文输出
- 对站点结构变化要预留失败提示
- 请求和解析逻辑分离，方便后续替换策略

## 建议配置项

- `ikuncodeBalance.refreshInterval`
- `ikuncodeBalance.baseUrl`
- `ikuncodeBalance.debug`

说明：

- `refreshInterval` 用于轮询周期
- `baseUrl` 方便未来切换环境或站点域名变化
- `debug` 只输出脱敏后的诊断信息

## 开发策略

如果后续开始编码，推荐按下面节奏推进：

1. 用 `yo code` 或等效方式初始化扩展
2. 先渲染一个假的状态栏余额
3. 再接入真实请求
4. 再接入 SecretStorage
5. 最后完善命令、配置和测试

## 完成定义

只有在下面几项都满足时，才算第一版可用：

- 新用户能在 3 分钟内完成配置
- 登录失效有明确提示
- 解析失败能定位问题类别
- 状态栏展示不会阻塞编辑器
- 停用扩展后定时器能正确释放
