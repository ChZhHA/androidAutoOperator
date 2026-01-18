# ADB remote screen and touch tool (English)

This project provides a browser UI to view an Android device screen (via minicap) and perform remote touch actions (tap, swipe, longpress), record and playback sequences.

## Prerequisites
- Node.js (recommended v14+)
- ADB available and device with USB debugging enabled and authorized
- `minicap` installed and prepared on the Android device (required for live screenshots)

## ADB setup
- By default the project prefers a bundled adb at `./adb/adb` (Unix) or `./adb/adb.exe` (Windows).
- You can override with environment variable `ADB_PATH`:

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

## Install and prepare minicap (on device)
The server uses `minicap` on the device to stream screenshots. Prepare a matching minicap binary and libraries for your device ABI and Android version:

1. Build or obtain a prebuilt minicap matching your device ABI/Android version (see `minicap/README.md`).
2. Push the binary to device and make it executable:

```bash
adb push path/to/minicap /data/local/tmp/minicap
adb shell chmod 755 /data/local/tmp/minicap
# push any required .so deps as needed
```

3. Verify it runs on the device:

```bash
adb shell /data/local/tmp/minicap -h
```

4. The server will try to start `minicap` at `/data/local/tmp/minicap` by default. If you used a different path set `MINICAP_PATH` before launching the server:

```bash
export MINICAP_PATH=/data/local/tmp/minicap
node server.js
```

If unsure how to prepare minicap for your device, refer to the `minicap/` directory or use compatible prebuilt binaries.

## Run locally
1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
node server.js
```

3. Open in browser:

```
http://localhost:3000
```

You can view the device screen live and perform/record touch actions.

## Long press
The client sends a `longpress` message and the server maps it to `adb shell input swipe x y x y <duration>` (same start/end to simulate press-and-hold). Adjust `server.js` if another method is preferred.

## Troubleshooting
- No screen / not connected: run `adb devices` and ensure device is listed; check `MINICAP_PATH` and server logs.
- Minicap errors: ensure minicap and its libs match your device ABI and Android version.
- adb not found: put adb in `./adb/adb` or set `ADB_PATH`.

## Contributing
Issues and PRs are welcome. Please confirm core features (screenshot stream, touch, playback) work on your device before making changes.
