# ikuncode-balance

一个 VS Code 扩展，用来在状态栏右侧显示 IKunCode 余额。

当前版本通过下面这条接口获取数据：

```text
GET https://api.ikuncode.cc/api/user/self
```

需要提供两项认证信息：

- `session`
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

1. `session`
2. `new-api-user`

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
ikuncode-balance-0.0.1.vsix
```

### 安装 `.vsix`

在 VS Code 中：

1. 打开命令面板
2. 执行 `Extensions: Install from VSIX...`
3. 选择生成的 `.vsix` 文件

## 发布到 VS Code Marketplace

这一步走的是 VS Code 官方 Marketplace 发布流程，工具通常使用 `vsce`。

### 1. 先创建 publisher

你需要先在 Visual Studio Marketplace / Azure DevOps 体系里创建自己的 publisher。

创建完成后，你会拿到一个唯一的 `publisher id`。

### 2. 在 `package.json` 中补上 `publisher`

当前仓库还没有填写这个字段，因为它必须绑定你自己的发布账号。

发布前需要在 [package.json](/Users/leachim/repo/ikuncode-balance/package.json) 里补上类似：

```json
{
  "publisher": "your-publisher-id"
}
```

### 3. 准备 Personal Access Token

`vsce publish` 需要使用 Marketplace 对应的 Personal Access Token。

### 4. 登录 publisher

```bash
vsce login your-publisher-id
```

然后按提示输入你的 PAT。

### 5. 先本地打包确认

```bash
npm run build
npm run package:vsix
```

### 6. 正式发布

```bash
vsce publish
```

或者用脚本：

```bash
npm run publish:vsix
```

如果要顺手升级版本，可以使用：

```bash
vsce publish patch
```

### 7. 发布前最小检查清单

- `package.json` 已填写正确的 `publisher`
- `README.md` 已准备好展示说明
- `CHANGELOG.md` 已更新版本内容
- 本地 `npm run build` 成功
- 本地 `.vsix` 安装验证通过
- 没有把个人认证信息写入仓库

## 命令

- `IKunCode Balance: Configure Credentials`
- `IKunCode Balance: Refresh Balance`
- `IKunCode Balance: Clear Credentials`

## 说明

- 认证信息保存在 VS Code `SecretStorage` 中，不写入 `settings.json`
- 当前实现依赖 `session + new-api-user`
- 如果登录态失效，需要重新配置认证信息
