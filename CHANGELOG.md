# Changelog

## 0.0.2

认证方案重构版本。

包含内容：

- 在 VS Code 状态栏右侧显示 IKunCode 余额
- 通过 `access token + new-api-user` 请求 `GET /api/user/self`
- 将 `quota / 500000` 显示为人民币金额
- 根据 `quota / (quota + used_quota)` 显示剩余额度占比
- 支持手动刷新和自动刷新
- 支持通过命令配置和清除认证信息
- 使用 VS Code `SecretStorage` 保存敏感信息
- 提供基础调试配置和本地开发说明
