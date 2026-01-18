# AndroidAutoOperator

This repository contains localized READMEs:
- [README.en.md](README.en.md) — English quick start
- [README.ja.md](README.ja.md) — 日本語（Japanese）

Please open the file matching your preferred language.

# ADB 远程画面与点击工具（简体中文）

本项目用于通过 ADB 拉取 Android 设备画面并在浏览器中远程进行点击、滑动、长按等操作。

## 先决条件
- Node.js (推荐 14+)
- 有可用的 `adb`（设备已开启 USB 调试并已授权）。
- Android 设备上安装并准备好 `minicap`（用于实时截图）。请务必在手机上安装并验证 `minicap`，否则无法在浏览器获得实时画面。

## 准备 ADB
- 默认本项目会优先使用仓库内的 `adb`：`./adb/adb`（Unix）或 `./adb/adb.exe`（Windows）。
- 你也可以通过环境变量 `ADB_PATH` 覆盖，例如：

  Windows (PowerShell):
  ```powershell
  $env:ADB_PATH = 'C:\path\to\adb.exe'
  node server.js
  ```

  Unix/macOS:
  ```bash
  export ADB_PATH=/usr/bin/adb
  node server.js
  ```

## 安装并准备 minicap（必须在设备上）
本项目依赖 `minicap` 在设备上提供截图流，建议提前在手机上安装好：

1. 编译或获取与你设备 ABI/Android 版本匹配的 `minicap` 二进制与依赖库（参考 `minicap/README.md`）。
2. 将 `minicap` 上传到设备：

```bash
adb push path/to/minicap /data/local/tmp/minicap
adb shell chmod 755 /data/local/tmp/minicap
# 若有需要，也 push 对应的 so 库到 /data/local/tmp
```

3. 验证 `minicap` 可执行并能运行（可先在设备 shell 运行）

```bash
adb shell /data/local/tmp/minicap -h
```

4. 本服务器在有客户端连接时会尝试通过 ADB 启动 `minicap`，默认设备端路径为 `/data/local/tmp/minicap`。如果你把二进制放在其它位置，请设置环境变量 `MINICAP_PATH`：

```bash
export MINICAP_PATH=/data/local/tmp/minicap
node server.js
```

若不确定如何为你的设备准备 minicap，请参考仓库内的 `minicap/` 子目录说明或使用公开的 prebuilt 包（注意需与设备 ABI 和 Android 版本匹配）。

## 本地运行
1. 安装依赖：

```bash
npm install
```

2. 启动服务：

```bash
node server.js
```

3. 在浏览器打开：

```
http://localhost:3000
```

页面可以实时显示设备画面，并支持点击、滑动、长按、录制与回放操作。

## 长按说明
服务器会将客户端发送的 `longpress` 消息映射为 ADB 的 `input swipe x y x y <duration>`（即起点和终点相同的 swipe 模拟按住）。如果你的设备或 adb 版本对其他长按模拟方式有要求，可调整 `server.js` 中的实现。

## 故障排查
- 无画面或无法连接：检查 `adb devices` 是否能看到设备，检查 `MINICAP_PATH` 是否正确且设备上可执行。查看终端输出的错误信息。
- minicap 报错：确认所用 minicap 与设备 ABI / Android 版本匹配，并且其依赖库已正确放置。
- adb 不在 PATH：把 adb 放到 `./adb/adb` 或通过 `ADB_PATH` 指定。

## 贡献
欢迎提交 issue/PR。请在修改前确保基本功能（截图流、点击、回放）在你的设备上可用。
