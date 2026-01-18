const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
const express = require("express");
const WebSocket = require("ws");
const net = require("net");

// Prefer an `adb` binary shipped in the project `adb/` folder by default.
// Allow override via environment variable `ADB_PATH`.
const DEFAULT_ADB_NAME = process.platform === "win32" ? "adb.exe" : "adb";
const ADB_PATH = process.env.ADB_PATH || path.resolve(__dirname, "adb", DEFAULT_ADB_NAME);

// Try to ensure executable permission on non-Windows platforms.
if (process.platform !== "win32") {
    try {
        fs.chmodSync(ADB_PATH, 0o755);
    } catch (err) {
        // ignore errors (file may not exist yet or permission change may fail)
    }
}

console.log("ADB path:", ADB_PATH);
const PORT = process.env.PORT || 3000;
const CAPTURE_INTERVAL_MS = Number(process.env.CAPTURE_INTERVAL_MS || 1020);
const DEVICE_ID = process.env.ADB_DEVICE || ""; // optional: set device serial
const MINICAP_PATH = process.env.MINICAP_PATH || "/data/local/tmp/minicap";
const MINICAP_QUALITY = Number(process.env.MINICAP_QUALITY || 60);
const MINICAP_TIMEOUT_MS = Number(process.env.MINICAP_TIMEOUT_MS || 3000);
const MINICAP_SOCKET_PORT = Number(process.env.MINICAP_SOCKET_PORT || 1717);

function createBanner()
{
    return {
        version: 0,
        length: 0,
        pid: 0,
        realWidth: 0,
        realHeight: 0,
        virtualWidth: 0,
        virtualHeight: 0,
        orientation: 0,
        quirks: 0,
    };
}

function forwardMinicapPort()
{
    return new Promise((resolve, reject) =>
    {
        runAdbCommand(["forward", `tcp:${MINICAP_SOCKET_PORT}`, "localabstract:minicap"], {}, (err) =>
        {
            if (err)
            {
                reject(err);
                return;
            }
            resolve();
        });

    });
}

function removeMinicapPortForward()
{
    runAdbCommand(["forward", "--remove", `tcp:${MINICAP_SOCKET_PORT}`], {}, () => { });
}

let cachedProjection = null;
let minicapProc = null;
let minicapSocket = null;
let minicapBanner = createBanner();
let minicapReadBannerBytes = 0;
let minicapBannerLength = 2;
let minicapReadFrameBytes = 0;
let minicapFrameBodyLength = 0;
let minicapFrameBody = Buffer.alloc(0);
let lastFrame = null;
let lastFrameSeq = 0;
let lastFrameAt = 0;
let minicapStartAt = 0;
let minicapFailures = 0;
let minicapRestartTimer = null;
let minicapStartedOnce = false;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(PORT, () =>
{
    console.log(`Server running at http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({ server });

function adbArgs(baseArgs)
{
    return DEVICE_ID ? ["-s", DEVICE_ID, ...baseArgs] : baseArgs;
}

function formatCmd(cmd, args)
{
    return [cmd, ...(args || [])].join(" ");
}

function logProcessOutput(prefix, data)
{
    const text = data.toString("utf8").trim();
    if (text)
    {
        console.log(`${prefix} ${text}`);
    }
}

function runAdbCommand(args, options, callback)
{
    const actualArgs = adbArgs(args);
    console.log("cmd:", formatCmd(ADB_PATH, actualArgs));
    const child = execFile(ADB_PATH, actualArgs, options || {}, (err, stdout, stderr) =>
    {
        if (typeof callback === "function")
        {
            callback(err, stdout, stderr);
        }
    });
    if (child.stdout)
    {
        child.stdout.on("data", (chunk) =>
        {
            logProcessOutput("stdout:", chunk);
        });
    }
    if (child.stderr)
    {
        child.stderr.on("data", (chunk) =>
        {
            logProcessOutput("stderr:", chunk);
        });
    }
    return child;
}

function runAdbCommandPromise(args, options)
{
    return new Promise((resolve, reject) =>
    {
        runAdbCommand(args, options, (err, stdout, stderr) =>
        {
            if (err)
            {
                reject(err);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

function delay(ms)
{
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDeviceSize()
{
    return new Promise((resolve, reject) =>
    {
        runAdbCommand(["shell", "wm", "size"], { encoding: "utf8" }, (err, stdout) =>
        {
            if (err)
            {
                reject(err);
                return;
            }
            const matches = stdout.match(/(\d+)x(\d+)/g);
            if (!matches || matches.length === 0)
            {
                reject(new Error("Unable to detect device size"));
                return;
            }
            const last = matches[matches.length - 1];
            const [width, height] = last.split("x").map((v) => Number(v));
            resolve({ width, height });
        });
    });
}

async function getProjection()
{
    if (cachedProjection) return cachedProjection;
    const { width, height } = await getDeviceSize();
    cachedProjection = `${width}x${height}@${width}x${height}/0`;
    return cachedProjection;
}

function resetMinicapState()
{
    minicapBanner = createBanner();
    minicapReadBannerBytes = 0;
    minicapBannerLength = 2;
    minicapReadFrameBytes = 0;
    minicapFrameBodyLength = 0;
    minicapFrameBody = Buffer.alloc(0);
}

function broadcastFrame(frame)
{
    const clients = Array.from(wss.clients).filter((ws) => ws.readyState === WebSocket.OPEN);
    if (clients.length === 0) return;
    for (const ws of clients)
    {
        ws.send(frame, { binary: true });
    }
}

function handleMinicapSocketReadable()
{
    if (!minicapSocket) return;
    console.log("read");
    for (let chunk; (chunk = minicapSocket.read());)
    {
        console.info('chunk(length=%d)', chunk.length);

        for (let cursor = 0, len = chunk.length; cursor < len;)
        {
            if (minicapReadBannerBytes < minicapBannerLength)
            {
                switch (minicapReadBannerBytes)
                {
                    case 0:
                        minicapBanner.version = chunk[cursor];
                        break;
                    case 1:
                        minicapBanner.length = minicapBannerLength = chunk[cursor];
                        break;
                    case 2:
                    case 3:
                    case 4:
                    case 5:
                        minicapBanner.pid += (chunk[cursor] << ((minicapReadBannerBytes - 2) * 8)) >>> 0;
                        break;
                    case 6:
                    case 7:
                    case 8:
                    case 9:
                        minicapBanner.realWidth += (chunk[cursor] << ((minicapReadBannerBytes - 6) * 8)) >>> 0;
                        break;
                    case 10:
                    case 11:
                    case 12:
                    case 13:
                        minicapBanner.realHeight += (chunk[cursor] << ((minicapReadBannerBytes - 10) * 8)) >>> 0;
                        break;
                    case 14:
                    case 15:
                    case 16:
                    case 17:
                        minicapBanner.virtualWidth += (chunk[cursor] << ((minicapReadBannerBytes - 14) * 8)) >>> 0;
                        break;
                    case 18:
                    case 19:
                    case 20:
                    case 21:
                        minicapBanner.virtualHeight += (chunk[cursor] << ((minicapReadBannerBytes - 18) * 8)) >>> 0;
                        break;
                    case 22:
                        minicapBanner.orientation += chunk[cursor] * 90;
                        break;
                    case 23:
                        minicapBanner.quirks = chunk[cursor];
                        break;
                }

                cursor += 1;
                minicapReadBannerBytes += 1;

                if (minicapReadBannerBytes === minicapBannerLength)
                {
                    console.log("minicap banner", minicapBanner);
                }
                continue;
            }

            if (minicapReadFrameBytes < 4)
            {
                minicapFrameBodyLength += (chunk[cursor] << (minicapReadFrameBytes * 8)) >>> 0;
                cursor += 1;
                minicapReadFrameBytes += 1;
                continue;
            }

            if (len - cursor >= minicapFrameBodyLength)
            {
                minicapFrameBody = Buffer.concat([minicapFrameBody, chunk.slice(cursor, cursor + minicapFrameBodyLength)]);

                if (minicapFrameBody[0] !== 0xff || minicapFrameBody[1] !== 0xd8)
                {
                    console.error("minicap frame does not start with JPG header");
                }

                lastFrame = minicapFrameBody;
                lastFrameSeq += 1;
                lastFrameAt = Date.now();
                console.log("minicap frame", lastFrameSeq, "bytes", lastFrame.length);
                broadcastFrame(minicapFrameBody);

                cursor += minicapFrameBodyLength;
                minicapFrameBodyLength = 0;
                minicapReadFrameBytes = 0;
                minicapFrameBody = Buffer.alloc(0);
            } else
            {
                minicapFrameBody = Buffer.concat([minicapFrameBody, chunk.slice(cursor, len)]);
                minicapFrameBodyLength -= len - cursor;
                minicapReadFrameBytes += len - cursor;
                cursor = len;
            }
        }
    }
}

async function startMinicapStream()
{
    if (minicapProc || minicapStartedOnce) return;

    minicapStartedOnce = true;
    const projection = await getProjection();
    const quality = Number.isFinite(MINICAP_QUALITY) ? MINICAP_QUALITY : 80;
    await forwardMinicapPort();
    await delay(100);
    const cmd = `LD_LIBRARY_PATH=/data/local/tmp ${MINICAP_PATH} -P ${projection}`;
    const shellCmd = ["shell", cmd];
    console.log("starting minicap:", [ADB_PATH, ...adbArgs(shellCmd)].join(" "));
    minicapProc = spawn(ADB_PATH, adbArgs(shellCmd));
    await delay(500);
    minicapSocket = net.connect({ port: MINICAP_SOCKET_PORT });
    minicapSocket.on("readable", handleMinicapSocketReadable);
    minicapSocket.on("error", (err) =>
    {
        console.error("minicap socket error:", err.message || err);
    });
    minicapProc.stdout.on("data", (chunk) =>
    {
        logProcessOutput("minicap stdout:", chunk);
    });
    resetMinicapState();
    lastFrame = null;
    minicapStartAt = Date.now();
    if (minicapRestartTimer)
    {
        clearTimeout(minicapRestartTimer);
        minicapRestartTimer = null;
    }
    //   minicapProc.stderr.on("data", (chunk) => {
    //     logProcessOutput("minicap stderr:", chunk);
    //   });

    //   minicapProc.on("close", (code) => {
    //     minicapProc = null;
    //     if (minicapSocket) {
    //       minicapSocket.destroy();
    //       minicapSocket = null;
    //     }
    //     resetMinicapState();
    //     removeMinicapPortForward();
    //     lastFrame = null;
    //     if (code !== null && code !== 0) {
    //       console.error("Minicap exited with code", code);
    //     }
    //   });
}

// function stopMinicapStream()
// {
//     if (minicapSocket)
//     {
//         minicapSocket.destroy();
//         minicapSocket = null;
//     }
//     if (!minicapProc) return;
//     minicapProc.kill();
//     minicapProc = null;
//     resetMinicapState();
//     if (minicapRestartTimer)
//     {
//         clearTimeout(minicapRestartTimer);
//         minicapRestartTimer = null;
//     }
// }

// setInterval(async () =>
// {
//     const clients = Array.from(wss.clients).filter((ws) => ws.readyState === WebSocket.OPEN);
//     if (!minicapProc && !minicapStartedOnce && clients.length > 0)
//     {
//         try
//         {
//             await startMinicapStream();
//         } catch (err)
//         {
//             console.error("Minicap start failed:", err.message || err);
//             minicapFailures += 1;
//         }
//     }

//     if (minicapProc && minicapStartAt > 0)
//     {
//         const now = Date.now();
//         if (!lastFrame && now - minicapStartAt > MINICAP_TIMEOUT_MS)
//         {
//             minicapFailures += 1;
//         }
//     }
// }, CAPTURE_INTERVAL_MS);

wss.on("connection", (ws) =>
{
    if (!minicapProc && !minicapStartedOnce)
    {
        startMinicapStream().catch((err) =>
        {
            console.error("Minicap start failed:", err.message || err);
            minicapFailures += 1;
        });
    }
    ws.on("message", (msg) =>
    {
        let data;
        try
        {
            data = JSON.parse(msg.toString());
        } catch
        {
            return;
        }

        if (data && data.type === "tap" && Number.isFinite(data.x) && Number.isFinite(data.y))
        {
            const x = Math.round(data.x);
            const y = Math.round(data.y);
            runAdbCommand(["shell", "input", "tap", String(x), String(y)], {}, (err) =>
            {
                if (err)
                {
                    console.error("Tap failed:", err.message || err);
                }
            });
        }

        if (
            data &&
            data.type === "swipe" &&
            Number.isFinite(data.x1) &&
            Number.isFinite(data.y1) &&
            Number.isFinite(data.x2) &&
            Number.isFinite(data.y2)
        )
        {
            const x1 = Math.round(data.x1);
            const y1 = Math.round(data.y1);
            const x2 = Math.round(data.x2);
            const y2 = Math.round(data.y2);
            const duration = Number.isFinite(data.duration) ? Math.max(50, Math.round(data.duration)) : 120;
            runAdbCommand(
                ["shell", "input", "swipe", String(x1), String(y1), String(x2), String(y2), String(duration)],
                {},
                (err) =>
                {
                    if (err)
                    {
                        console.error("Swipe failed:", err.message || err);
                    }
                }
            );
        }

        // longpress: map to input swipe with same start/end to simulate press-and-hold
        if (data && data.type === "longpress" && Number.isFinite(data.x) && Number.isFinite(data.y) && Number.isFinite(data.duration)) {
            const x = Math.round(data.x);
            const y = Math.round(data.y);
            const duration = Math.max(50, Math.round(data.duration));
            runAdbCommand([
                "shell",
                "input",
                "swipe",
                String(x),
                String(y),
                String(x),
                String(y),
                String(duration),
            ], {}, (err) => {
                if (err) {
                    console.error("Longpress failed:", err.message || err);
                }
            });
        }
    });
});
