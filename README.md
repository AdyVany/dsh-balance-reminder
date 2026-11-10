# DSH 余额提醒插件（dsh-balance-reminder）

在 DeepSeek Harness Web 界面底部常驻显示 DeepSeek 平台钱包余额，并在余额偏低时弹出提醒。  
余额通过 DSH 已登录的 DeepSeek 账号读取（`account.getBalance`），**不需要另外配置 API Key**。

## 功能

- **常驻余额条**：界面最底部一行，显示充值余额 + 赠金合计，每分钟自动刷新，也可点「刷新」立即读取。
- **低余额变色**：人民币余额低于 ¥20 变琥珀色，低于 ¥5 变红色。
- **低余额提醒卡**：低于 ¥20 时在右下角弹出提醒，可直接「去充值」或「稍后提醒」；余额恢复后再次低于阈值会重新提醒。
- **断线不伪造余额**：读取失败时明确显示失败原因，不会把失败当成 ¥0.00。
- 中英文文案跟随界面语言。

## 安装

推荐在 DSH 插件页安装（安装后自动启用），或让 agent 用 `plugin_manager` 安装：

```
plugin_manager install_bundle target="<本目录绝对路径>"
```

安装后刷新 Web 页面即可看到底部余额条。若没有出现，检查 `设置 → 插件` 中本插件是否已启用。

手动卸载：

```
plugin_manager remove_bundle target="dsh-balance-reminder"
```

## 数据来源与隐私

- 读取的是当前 DSH 账号登录态下的 DeepSeek 平台钱包摘要（充值钱包 / 赠金钱包的币种与余额字符串）。
- 插件不保存、不打印 access token，也不把余额发送到 DeepSeek 之外的任何地方。
- 只有界面打开时才会每分钟请求一次余额；页面隐藏时暂停自动刷新，切回页面时立即刷新。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半边：无状态，只让 bundle 进入 Loader，使 Client bundle 被 `dsh-client-modules` 提供。 |
| `client.js` | Client 半边：注册 `shell.bottom` 余额条与 `shell.overlay` 提醒卡。 |
| `cordis.patch.yml` | Bundle patch：插入 `balance-reminder` 插件行。 |

## 调整阈值

阈值目前是 `client.js` 中的常量：`WARN_BELOW = 20`、`CRITICAL_BELOW = 5`、`REFRESH_MS = 60 * 1000`。改完后保存文件，页面会通过 HMR 重新加载该插件（首次安装后如未生效，刷新页面即可）。

## 说明

- 插件以 `link:` 方式安装在当前 desktop profile 中，源码就是这个工作区里的 `dsh-balance-reminder` 目录。移动或删除该目录会让插件失效；移动后重新执行一次 `plugin_manager install_bundle` 即可。
- 安装时插件会自动启用，并写入 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 列表。
- 当前 profile 已确认加载：插件行 `include:balance-reminder` 状态为 `active`，浏览器启动图中包含 `dsh-balance-reminder` 的客户端 bundle。
