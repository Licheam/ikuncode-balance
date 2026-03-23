# ikuncode-balance

一个 VS Code 扩展，用来在状态栏右侧显示 IKunCode 余额。

当前版本通过下面这条接口获取数据：

```text
GET https://api.ikuncode.cc/api/user/self
```

需要提供两项认证信息：

- `access token`
- `new-api-user`

扩展会将：

- `quota / 500000` 显示为金额，单位 `¥`
- `quota / (quota + used_quota)` 显示为剩余额度占比

示例：

```text
IKun: ¥55.28 · 43%
```

## 功能

- 状态栏右侧显示余额
- 手动刷新余额
- 自动刷新余额
- 配置和清除认证信息
- 使用 VS Code `SecretStorage` 保存认证信息

## 配置项

- `ikuncodeBalance.baseUrl`
  - 默认值：`https://api.ikuncode.cc`
- `ikuncodeBalance.refreshIntervalSeconds`
  - 默认值：`60`
  - 最小值：`15`
- `ikuncodeBalance.debug`
  - 默认值：`false`

## 本地开发

### 环境要求

- Node.js 18+
- npm
- VS Code

### 安装依赖

```bash
npm install
```

### 构建

```bash
npm run build
```

### 启动调试

用 VS Code 打开当前仓库后：

- 按 `F5`
- 或在 Run and Debug 中选择 `Run IKunCode Balance Extension`

这会启动一个新的 `Extension Development Host` 窗口。

### 首次配置

在新的调试窗口中打开命令面板，执行：

- `IKunCode Balance: Configure Credentials`

然后依次输入：

1. `access token`
2. `new-api-user`

配置说明：

- `access token` 指 IKunCode 的系统访问令牌
- 可直接粘贴原始 token，也可以粘贴 `Bearer ...`
- `new-api-user` 是当前账号的用户 ID

获取 `access token` 的方式：

1. 登录 IKunCode
2. 打开个人设置页面
3. 进入安全设置
4. 找到“系统访问令牌”
5. 生成一个新的令牌
6. 复制生成后的 token，填入扩展的 `access token`

获取 `new-api-user` 的常见方式：

1. 登录 IKunCode
2. 打开个人设置页面
3. 在昵称下方找到用户 ID
4. 这个数字就是 `new-api-user`

配置完成后，状态栏右侧应显示：

- 成功时：`IKun: ¥xx.xx · yy%`
- 未配置时：`IKun: sign in`
- 请求失败时：`IKun: error`

## 本地打包安装

### 安装打包工具

```bash
npm install -g @vscode/vsce
```

### 打包

```bash
npm run build
vsce package
```

执行后会生成类似：

```text
ikuncode-balance-0.0.2.vsix
```

### 安装 `.vsix`

在 VS Code 中：

1. 打开命令面板
2. 执行 `Extensions: Install from VSIX...`
3. 选择生成的 `.vsix` 文件

## GitHub Release 自动发布

仓库现在包含一个 GitHub Actions workflow：

- [.github/workflows/release.yml](/Users/leachim/repo/ikuncode-balance/.github/workflows/release.yml)

行为是：

- 当代码 push 到 `main` 时自动构建扩展
- 自动打包 `.vsix`
- 自动上传 workflow artifact
- 如果当前版本对应的 GitHub Release 还不存在，则自动创建 `vX.Y.Z` release，并附带 `.vsix`

说明：

- 版本号来自 [package.json](/Users/leachim/repo/ikuncode-balance/package.json) 的 `version`
- 如果当前版本对应的 tag 已经存在，再次 push `main` 不会重复创建同一个 release
- 如果你想发新 release，需要先更新 `package.json` 中的版本号，再合并到 `main`

## 命令

- `IKunCode Balance: Configure Credentials`
- `IKunCode Balance: Refresh Balance`
- `IKunCode Balance: Clear Credentials`

## 说明

- 认证信息保存在 VS Code `SecretStorage` 中，不写入 `settings.json`
- 当前实现依赖 `access token + new-api-user`
- 如果登录态失效，需要重新配置认证信息

## License

MIT. See [LICENSE](/Users/leachim/repo/ikuncode-balance/LICENSE).
