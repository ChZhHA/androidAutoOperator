````markdown
# ADB リモート画面とタッチツール（日本語）

このプロジェクトは、ブラウザ上で Android デバイスの画面を表示し（minicap 経由）、リモートでタップ、スワイプ、長押しなどの操作を行える UI を提供します。操作の記録・再生も可能です。

## 前提条件
- Node.js（推奨 v14+）
- ADB が利用可能で、デバイスの USB デバッグが有効かつ認証済みであること
- デバイスに `minicap` がインストールされ、スクリーンショットのストリームが利用できること

## ADB の準備
- デフォルトではリポジトリ内の `./adb/adb`（Unix）または `./adb/adb.exe`（Windows）を優先して使用します。
- 別の adb を使う場合は環境変数 `ADB_PATH` を設定してください。

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

## minicap の準備（デバイス上）
サーバはデバイス上の `minicap` を使ってスクリーンショットを取得します。デバイスの ABI と Android バージョンに合ったバイナリと依存ライブラリを用意してください。

1. お使いのデバイスに合う prebuilt かビルド済みの `minicap` を用意してください（`minicap/README.md` を参照）。
2. バイナリをデバイスに転送し、実行権を与えます：

```bash
adb push path/to/minicap /data/local/tmp/minicap
adb shell chmod 755 /data/local/tmp/minicap
# 必要に応じて .so も転送
```

3. 実行確認：

```bash
adb shell /data/local/tmp/minicap -h
```

4. サーバはデフォルトで `/data/local/tmp/minicap` を起動します。別の場所に置いた場合は `MINICAP_PATH` を設定して起動してください：

```bash
export MINICAP_PATH=/data/local/tmp/minicap
node server.js
```

## ローカルで起動
1. 依存をインストール：

```bash
npm install
```

2. サーバを起動：

```bash
node server.js
```

3. ブラウザで開く：

```
http://localhost:3000
```

デバイス画面のライブ表示と、リモート操作（タップ、スワイプ、長押し）、録画・再生が可能です。

## 長押しについて
クライアントは `longpress` メッセージを送り、サーバ側は `adb shell input swipe x y x y <duration>` に変換して長押しをシミュレートします（開始座標と終了座標を同じにする方法）。別の方法を使いたい場合は `server.js` を調整してください。

## トラブルシューティング
- 画面が表示されない / 接続できない：`adb devices` でデバイスが表示されるか確認し、`MINICAP_PATH` を確認してください。サーバのログも確認してください。
- minicap エラー：`minicap` とその依存ライブラリがデバイスの ABI / Android バージョンに合っているか確認してください。
- adb が見つからない：`./adb/adb` に配置するか、`ADB_PATH` を使って指定してください。

## 貢献
issue や PR は歓迎します。変更を加える前に、スクリーンショットストリーム・タッチ操作・再生が実機で動作することを確認してください。

````
