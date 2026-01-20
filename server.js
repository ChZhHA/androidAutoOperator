const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
const express = require("express");
const WebSocket = require("ws");
const net = require("net");

// Prefer an `adb` binary shipped in the project `adb/` folder by default.
// Allow override via environment variable `ADB_PATH`.
const DEFAULT_ADB_NAME = process.platform === "win32" ? "adb.exe" : "adb";

function resolveAdbPath() {
    // 1. env override
    if (process.env.ADB_PATH) return process.env.ADB_PATH;

    // 2. when packaged via electron-builder, extraResources are unpacked to process.resourcesPath
    try {
        const resBase = process.resourcesPath || __dirname;
        const candidate = path.join(resBase, 'adb', DEFAULT_ADB_NAME);
        if (fs.existsSync(candidate)) return candidate;
    } catch (e) { }

    // 3. fallback to project-relative adb (useful during development)
    const fallback = path.resolve(__dirname, 'adb', DEFAULT_ADB_NAME);
    return fallback;
}

let ADB_PATH = resolveAdbPath();

// Try to ensure executable permission on non-Windows platforms, only if file exists.
if (process.platform !== "win32") {
    try {
        if (fs.existsSync(ADB_PATH)) fs.chmodSync(ADB_PATH, 0o755);
    } catch (err) {
        // ignore errors (file may not exist yet or permission change may fail)
    }
}

console.log("ADB path:", ADB_PATH);
// Resolve paths under packaged `minicap-build` (supports extraResources unpacked to process.resourcesPath)
function resolveMinicapBuildPaths(ABI, SDK) {
    const base = process.resourcesPath || __dirname;
    const candidateMinicap = path.join(base, 'minicap-build', 'libs', ABI, 'minicap');
    const candidateSo = path.join(base, 'minicap-build', 'jni', 'libs', `android-${SDK}`, ABI, 'minicap.so');
    // fallback to project-relative (development)
    const fallbackMinicap = path.resolve(__dirname, 'minicap_build', 'libs', ABI, 'minicap');
    const fallbackSo = path.resolve(__dirname, 'minicap_build', 'jni', 'libs', `android-${SDK}`, ABI, 'minicap.so');
    const minicapPath = fs.existsSync(candidateMinicap) ? candidateMinicap : fallbackMinicap;
    const soPath = fs.existsSync(candidateSo) ? candidateSo : fallbackSo;
    return { minicapPath, soPath };
}
const PORT = process.env.PORT || 3000;
const CAPTURE_INTERVAL_MS = Number(process.env.CAPTURE_INTERVAL_MS || 1020);
const DEVICE_ID = process.env.ADB_DEVICE || ""; // optional: set device serial
const MINICAP_PATH = process.env.MINICAP_PATH || "/data/local/tmp/minicap";
const MINICAP_QUALITY = Number(process.env.MINICAP_QUALITY || 60);
const MINICAP_SOCKET_PORT = Number(process.env.MINICAP_SOCKET_PORT || 1717);
const MINICAP_HOST = process.env.MINICAP_SOCKET_HOST || "127.0.0.1";
const MESSAGE_TARGETS = ["windows"];
const DEFAULT_MESSAGE_TARGET = "windows";

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

let wss = null;
wss = new WebSocket.Server({ server });

// API: install minicap into connected device
app.post('/install-minicap', async (req, res) => {
    const messages = [];
    try {
        const abiResult = await runAdbCommandPromise(['shell', 'getprop', 'ro.product.cpu.abi'], { encoding: 'utf8' });
        const sdkResult = await runAdbCommandPromise(['shell', 'getprop', 'ro.build.version.sdk'], { encoding: 'utf8' });
        const ABI = (abiResult.stdout || '').toString().trim().replace(/\r/g, '');
        const SDK = (sdkResult.stdout || '').toString().trim().replace(/\r/g, '');
        messages.push(`Detected ABI: ${ABI}`);
        messages.push(`Detected SDK: ${SDK}`);

        const { minicapPath: localMinicap, soPath: localSo } = resolveMinicapBuildPaths(ABI, SDK);

        const fsExists = (p) => {
            try {
                return fs.existsSync(p);
            } catch (e) { return false; }
        };

        if (!fsExists(localMinicap)) {
            res.status(400).json({ success: false, error: 'local minicap binary not found', messages, path: localMinicap });
            return;
        }
        if (!fsExists(localSo)) {
            res.status(400).json({ success: false, error: 'local minicap.so not found', messages, path: localSo });
            return;
        }

        // push minicap
        messages.push(`Pushing ${localMinicap} -> /data/local/tmp/`);
        // ensure executable bit locally when available (non-win)
        try {
            if (process.platform !== 'win32' && fs.existsSync(localMinicap)) {
                fs.chmodSync(localMinicap, 0o755);
            }
        } catch (e) { /* ignore */ }
        await runAdbCommandPromise(['push', localMinicap, '/data/local/tmp/']);
        messages.push('Pushed minicap binary');

        // push so
        messages.push(`Pushing ${localSo} -> /data/local/tmp/`);
        await runAdbCommandPromise(['push', localSo, '/data/local/tmp/']);
        messages.push('Pushed minicap.so');

        // chmod
        messages.push('Setting executable permission on /data/local/tmp/minicap');
        await runAdbCommandPromise(['shell', 'chmod', '755', '/data/local/tmp/minicap']);

        res.json({ success: true, messages });
    } catch (err) {
        console.error('install-minicap failed', err);
        res.status(500).json({ success: false, error: err && err.message ? err.message : String(err), messages });
    }
});

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

function execTapAction(x, y)
{
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const tx = Math.round(x);
    const ty = Math.round(y);
    runAdbCommand(["shell", "input", "tap", String(tx), String(ty)], {}, (err) =>
    {
        if (err)
        {
            console.error("Tap failed:", err.message || err);
        }
    });
}

function execSwipeAction({ x1, y1, x2, y2, duration })
{
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
    const durationMs = Number.isFinite(duration) ? Math.max(50, Math.round(duration)) : 120;
    runAdbCommand([
        "shell",
        "input",
        "swipe",
        String(Math.round(x1)),
        String(Math.round(y1)),
        String(Math.round(x2)),
        String(Math.round(y2)),
        String(durationMs),
    ], {}, (err) =>
    {
        if (err)
        {
            console.error("Swipe failed:", err.message || err);
        }
    });
}

function execInputText(text)
{
    if (typeof text !== "string") return;
    let txt = String(text);
    txt = txt.replace(/%/g, "%25").replace(/ /g, "%s");
    runAdbCommand(["shell", "input", "text", txt], {}, (err) =>
    {
        if (err)
        {
            console.error("Input text failed:", err.message || err);
        }
    });
}

function execKeyAction(key)
{
    if (!key) return;
    const map = {
        Enter: "66",
        Backspace: "67",
        Tab: "61",
        Escape: "111",
        Home: "3",
        Back: "4",
        Menu: "82",
        VolumeUp: "24",
        VolumeDown: "25",
        PageUp: "92",
        PageDown: "93",
        Insert: "124",
        Delete: "112",
        Space: "62",
    };
    const code = map[key];
    if (code)
    {
        runAdbCommand(["shell", "input", "keyevent", code], {}, (err) =>
        {
            if (err)
            {
                console.error("Key event failed:", err.message || err);
            }
        });
        return;
    }
    if (key.length === 1)
    {
        const ch = key === " " ? "%s" : key;
        runAdbCommand(["shell", "input", "text", ch], {}, (err) =>
        {
            if (err)
            {
                console.error("Char input failed:", err.message || err);
            }
        });
    }
}

function execPowerAction({ long, duration })
{
    const isLong = !!long;
    const dur = Number(duration || 0);
    if (isLong)
    {
        runAdbCommand(["shell", "input", "keyevent", "--longpress", "26"], {}, (err) =>
        {
            if (err)
            {
                console.warn("Longpress keyevent not supported, falling back to short press:", err.message || err);
                runAdbCommand(["shell", "input", "keyevent", "26"], {}, (fallbackErr) =>
                {
                    if (fallbackErr)
                    {
                        console.error("Power key failed:", fallbackErr.message || fallbackErr);
                    }
                });
            }
        });
        return;
    }
    runAdbCommand(["shell", "input", "keyevent", "26"], {}, (err) =>
    {
        if (err)
        {
            console.error("Power key failed:", err.message || err);
        }
    });
}

function execLongpressAction({ x, y, duration })
{
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(duration)) return;
    const dur = Math.max(50, Math.round(duration));
    const tx = Math.round(x);
    const ty = Math.round(y);
    runAdbCommand([
        "shell",
        "input",
        "swipe",
        String(tx),
        String(ty),
        String(tx),
        String(ty),
        String(dur),
    ], {}, (err) =>
    {
        if (err)
        {
            console.error("Longpress failed:", err.message || err);
        }
    });
}

function performDeviceAction(action)
{
    if (!action || typeof action !== "object") return;
    switch (action.type)
    {
        case "tap":
            execTapAction(action.x, action.y);
            break;
        case "swipe":
            execSwipeAction(action);
            break;
        case "input":
            execInputText(String(action.text || ""));
            break;
        case "key":
            execKeyAction(String(action.key || ""));
            break;
        case "power":
            execPowerAction(action);
            break;
        case "longpress":
            execLongpressAction(action);
            break;
        default:
            break;
    }
}

function sendJson(ws, payload)
{
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try
    {
        ws.send(JSON.stringify(payload));
    }
    catch (err)
    {
        console.warn("Unable to send ws payload:", err && err.message ? err.message : err);
    }
}

function sendRawToAllClients(message)
{
    if (!message || !wss) return;
    for (const client of wss.clients)
    {
        if (client.readyState === WebSocket.OPEN)
        {
            try
            {
                client.send(message);
            }
            catch (err)
            {
                console.warn("Broadcast send failed:", err && err.message ? err.message : err);
            }
        }
    }
}

function broadcastJson(payload)
{
    try
    {
        sendRawToAllClients(JSON.stringify(payload));
    }
    catch (err)
    {
        console.warn("Broadcast json failed:", err && err.message ? err.message : err);
    }
}

const schedulerTransport = {
    readyState: WebSocket.OPEN,
    send(message)
    {
        sendRawToAllClients(message);
    },
};

const scheduleState = {
    active: false,
    timeline: null,
    interval: 0,
    loopsLeft: 0,
    totalLoops: 0,
    nextTimer: null,
};

function scheduleRemainingLoops()
{
    return scheduleState.loopsLeft === Infinity ? null : scheduleState.loopsLeft;
}

function clearScheduleTimer()
{
    if (scheduleState.nextTimer)
    {
        clearTimeout(scheduleState.nextTimer);
        scheduleState.nextTimer = null;
    }
}

function stopSchedule(options)
{
    const opts = options || {};
    const reason = opts.reason || "stopped";
    const wasActive = scheduleState.active;
    clearScheduleTimer();
    const playbackState = getClientState(schedulerTransport);
    if (reason !== "finished" && playbackState.playbackActive)
    {
        stopBackendPlayback(schedulerTransport, { force: true, reason: "stopped" });
    }
    scheduleState.active = false;
    scheduleState.timeline = null;
    scheduleState.interval = 0;
    scheduleState.loopsLeft = 0;
    scheduleState.totalLoops = 0;
    if (opts.silent) return;
    if (!wasActive && reason === "stopped")
    {
        broadcastJson({ type: "schedule:stopped" });
        return;
    }
    switch (reason)
    {
        case "finished":
            broadcastJson({ type: "schedule:finished" });
            break;
        case "error":
            broadcastJson({ type: "schedule:error", error: opts.error || "unknown" });
            break;
        default:
            broadcastJson({ type: "schedule:stopped" });
            break;
    }
}

function runScheduleLoop()
{
    scheduleState.nextTimer = null;
    if (!scheduleState.active)
    {
        return;
    }
    if (!scheduleState.timeline || scheduleState.timeline.length === 0)
    {
        stopSchedule({ reason: "error", error: "timeline missing" });
        return;
    }
    if (scheduleState.loopsLeft !== Infinity)
    {
        if (scheduleState.loopsLeft <= 0)
        {
            stopSchedule({ reason: "finished" });
            return;
        }
        scheduleState.loopsLeft -= 1;
    }
    broadcastJson({ type: "schedule:loopStarted", remaining: scheduleRemainingLoops() });
    const started = startBackendPlayback(schedulerTransport, scheduleState.timeline, "schedule", () =>
    {
        if (!scheduleState.active)
        {
            return;
        }
        broadcastJson({ type: "schedule:loopCompleted", remaining: scheduleRemainingLoops() });
        if (scheduleState.loopsLeft === 0)
        {
            stopSchedule({ reason: "finished" });
            return;
        }
        scheduleState.nextTimer = setTimeout(runScheduleLoop, scheduleState.interval);
    });
    if (!started)
    {
        stopSchedule({ reason: "error", error: "unable to start playback" });
    }
}

function handleScheduleStart(ws, payload)
{
    const timeline = sanitizeTimeline(payload && Array.isArray(payload.timeline) ? payload.timeline : []);
    if (!timeline.length)
    {
        sendJson(ws, { type: "schedule:error", error: "timeline empty" });
        return;
    }
    const interval = Math.max(0, Number(payload && payload.interval ? payload.interval : 0));
    const delay = Math.max(0, Number(payload && payload.delay ? payload.delay : 0));
    let loopsValue = Number(payload && payload.loops ? payload.loops : 0);
    loopsValue = Number.isFinite(loopsValue) ? Math.max(0, loopsValue) : 0;
    const loopsConfig = loopsValue === 0 ? Infinity : loopsValue;
    stopSchedule({ reason: "stopped", silent: true });
    scheduleState.active = true;
    scheduleState.timeline = timeline;
    scheduleState.interval = interval;
    scheduleState.totalLoops = loopsConfig;
    scheduleState.loopsLeft = loopsConfig;
    scheduleState.nextTimer = setTimeout(runScheduleLoop, delay);
    broadcastJson({
        type: "schedule:started",
        delay,
        interval,
        loops: loopsValue === 0 ? null : loopsValue,
        remaining: loopsConfig === Infinity ? null : loopsConfig,
    });
}

function notifyScheduleState(ws)
{
    if (!scheduleState.active || !ws || ws.readyState !== WebSocket.OPEN) return;
    sendJson(ws, {
        type: "schedule:started",
        delay: 0,
        interval: scheduleState.interval,
        loops: scheduleState.totalLoops === Infinity ? null : scheduleState.totalLoops,
        remaining: scheduleRemainingLoops(),
    });
    const schedulerPlaybackState = getClientState(schedulerTransport);
    if (schedulerPlaybackState.playbackActive)
    {
        sendJson(ws, { type: "schedule:loopStarted", remaining: scheduleRemainingLoops() });
    }
}

const clientStateStore = new WeakMap();

function getClientState(ws)
{
    if (!clientStateStore.has(ws))
    {
        clientStateStore.set(ws, {
            playbackTimers: [],
            playbackActive: false,
            playbackContext: null,
            playbackCompleteHandler: null,
        });
    }
    return clientStateStore.get(ws);
}

function clearPlaybackTimers(state)
{
    if (!state) return;
    if (Array.isArray(state.playbackTimers))
    {
        state.playbackTimers.forEach((timer) =>
        {
            if (timer) clearTimeout(timer);
        });
    }
    state.playbackTimers = [];
}

function sanitizeTimeline(entries)
{
    if (!Array.isArray(entries)) return [];
    const limit = Number(process.env.PLAYBACK_MAX_ENTRIES || 5000);
    const sanitized = [];
    for (const rawEntry of entries.slice(0, limit))
    {
        if (!rawEntry || typeof rawEntry !== "object") continue;
        const type = rawEntry.type;
        const delay = Math.max(0, Math.round(Number(rawEntry.delay || 0)));
        if (!type || !Number.isFinite(delay)) continue;
        if (type === "tap" && Number.isFinite(rawEntry.x) && Number.isFinite(rawEntry.y))
        {
            sanitized.push({ type, delay, x: Number(rawEntry.x), y: Number(rawEntry.y) });
            continue;
        }
        if (type === "swipe" && Number.isFinite(rawEntry.x1) && Number.isFinite(rawEntry.y1) && Number.isFinite(rawEntry.x2) && Number.isFinite(rawEntry.y2))
        {
            const duration = Number.isFinite(rawEntry.duration) ? Number(rawEntry.duration) : 120;
            sanitized.push({ type, delay, x1: Number(rawEntry.x1), y1: Number(rawEntry.y1), x2: Number(rawEntry.x2), y2: Number(rawEntry.y2), duration });
            continue;
        }
        if (type === "input" && typeof rawEntry.text === "string")
        {
            sanitized.push({ type, delay, text: rawEntry.text });
            continue;
        }
        if (type === "key" && typeof rawEntry.key === "string")
        {
            sanitized.push({ type, delay, key: rawEntry.key });
            continue;
        }
        if (type === "message")
        {
            const channel = String(rawEntry.channel || "");
            const payload = typeof rawEntry.payload === "string" ? rawEntry.payload : String(rawEntry.payload || "");
            const target = MESSAGE_TARGETS.includes(rawEntry.target) ? rawEntry.target : DEFAULT_MESSAGE_TARGET;
            sanitized.push({ type, delay, channel, payload, target });
            continue;
        }
        if (type === "power")
        {
            sanitized.push({ type, delay, long: !!rawEntry.long, duration: Number(rawEntry.duration || 0) });
            continue;
        }
        if (type === "longpress" && Number.isFinite(rawEntry.x) && Number.isFinite(rawEntry.y) && Number.isFinite(rawEntry.duration))
        {
            sanitized.push({ type, delay, x: Number(rawEntry.x), y: Number(rawEntry.y), duration: Number(rawEntry.duration) });
            continue;
        }
    }
    return sanitized;
}

function finishPlayback(ws, reason, extra)
{
    const state = getClientState(ws);
    clearPlaybackTimers(state);
    if (!state.playbackActive && reason !== "completed" && reason !== "error") return;
    const context = state.playbackContext;
    state.playbackActive = false;
    state.playbackContext = null;
    const handler = state.playbackCompleteHandler;
    state.playbackCompleteHandler = null;
    if (reason === "completed")
    {
        sendJson(ws, { type: "playback:completed", context });
    }
    else if (reason === "error")
    {
        sendJson(ws, { type: "playback:error", context, error: extra && extra.error ? extra.error : "unknown" });
    }
    else if (reason === "stopped")
    {
        sendJson(ws, { type: "playback:stopped", context });
    }
    if (typeof handler === "function")
    {
        try
        {
            handler(reason);
        }
        catch (err)
        {
            console.warn("playback completion handler failed:", err && err.message ? err.message : err);
        }
    }
}

function stopBackendPlayback(ws, options)
{
    const state = getClientState(ws);
    if (!state.playbackActive && (!state.playbackTimers || state.playbackTimers.length === 0))
    {
        clearPlaybackTimers(state);
        return false;
    }
    const opts = options || {};
    if (opts && opts.context && state.playbackContext && state.playbackContext !== opts.context && !opts.force)
    {
        return false;
    }
    finishPlayback(ws, opts && opts.reason ? opts.reason : "stopped");
    return true;
}

function startBackendPlayback(ws, timelineEntries, context, onDone)
{
    const timeline = sanitizeTimeline(timelineEntries);
    if (!timeline.length)
    {
        sendJson(ws, { type: "playback:error", context: context || "manual", error: "timeline empty" });
        return false;
    }
    const state = getClientState(ws);
    stopBackendPlayback(ws, { force: true });
    state.playbackActive = true;
    state.playbackContext = context || "manual";
    state.playbackCompleteHandler = typeof onDone === "function" ? onDone : null;
    const timers = [];
    let maxDelay = 0;
    const playbackContext = state.playbackContext;
    timeline.forEach((entry) =>
    {
        maxDelay = Math.max(maxDelay, entry.delay);
        const timer = setTimeout(() =>
        {
            try
            {
                sendJson(ws, { type: "playback:action", context: playbackContext, action: entry });
                performDeviceAction(entry);
            }
            catch (err)
            {
                console.error("Playback action failed:", err && err.message ? err.message : err);
            }
        }, entry.delay);
        timers.push(timer);
    });
    timers.push(setTimeout(() => finishPlayback(ws, "completed"), maxDelay + 50));
    state.playbackTimers = timers;
    sendJson(ws, { type: "playback:started", context: state.playbackContext });
    return true;
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
    for (let chunk; (chunk = minicapSocket.read());)
    {
        // console.info('chunk(length=%d)', chunk.length);

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
                // console.log("minicap frame", lastFrameSeq, "bytes", lastFrame.length);
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
    minicapSocket = net.connect({host:MINICAP_HOST, port: MINICAP_SOCKET_PORT });
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
}

function stopMinicapStream()
{
    // destroy socket
    try {
        if (minicapSocket) {
            minicapSocket.removeAllListeners();
            minicapSocket.destroy();
            minicapSocket = null;
        }
    } catch (e) {
        console.warn("Error destroying minicapSocket:", e && e.message || e);
    }

    // kill process
    try {
        if (minicapProc) {
            minicapProc.removeAllListeners();
            // best-effort kill
            try { minicapProc.kill(); } catch (e) { /* ignore */ }
            minicapProc = null;
        }
    } catch (e) {
        console.warn("Error killing minicapProc:", e && e.message || e);
    }

    // clear timers and state
    try {
        resetMinicapState();
        lastFrame = null;
        if (minicapRestartTimer) {
            clearTimeout(minicapRestartTimer);
            minicapRestartTimer = null;
        }
        // allow restart on future connections
        minicapStartedOnce = false;
    } catch (e) { /* ignore */ }

    // remove adb port forward
    try {
        removeMinicapPortForward();
    } catch (e) { /* ignore */ }

    console.log("minicap stream stopped and cleaned up");
}

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

    notifyScheduleState(ws);

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

        if (data && data.type === "playback:start")
        {
            startBackendPlayback(ws, Array.isArray(data.timeline) ? data.timeline : [], data.context || "manual");
            return;
        }

        if (data && data.type === "playback:stop")
        {
            stopBackendPlayback(ws, { context: data.context || "manual" });
            return;
        }

        if (data && data.type === "schedule:start")
        {
            handleScheduleStart(ws, data);
            return;
        }

        if (data && data.type === "schedule:stop")
        {
            stopSchedule({ reason: "stopped" });
            return;
        }

        if (data && data.type === "tap" && Number.isFinite(data.x) && Number.isFinite(data.y))
        {
            execTapAction(data.x, data.y);
        }

        // text input -> adb shell input text
        if (data && data.type === 'input' && typeof data.text === 'string') {
            execInputText(String(data.text));
        }

        // generic key events -> map common keys to Android keycodes
        if (data && data.type === 'key' && data.key) {
            execKeyAction(String(data.key));
        }

        // power key (support short / long when requested)
        if (data && data.type === "power") {
            execPowerAction({ long: !!data.long, duration: data.duration });
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
            execSwipeAction({ x1: data.x1, y1: data.y1, x2: data.x2, y2: data.y2, duration: data.duration });
        }

        // longpress: map to input swipe with same start/end to simulate press-and-hold
        if (data && data.type === "longpress" && Number.isFinite(data.x) && Number.isFinite(data.y) && Number.isFinite(data.duration)) {
            execLongpressAction({ x: data.x, y: data.y, duration: data.duration });
        }
    });

    ws.on("close", () =>
    {
        try
        {
            stopBackendPlayback(ws, { force: true });
            const clients = Array.from(wss.clients).filter((c) => c.readyState === WebSocket.OPEN);
            if (clients.length === 0)
            {
                // no active clients, stop minicap
                stopMinicapStream();
            }
        } catch (e)
        {
            console.warn("Error handling ws close:", e && e.message || e);
        }
    });
});

wss.on("close", () =>
{
    try
    {
        stopSchedule({ reason: "stopped" });
        stopMinicapStream();
    }
    catch (e)
    {
        console.warn("Error handling wss close:", e && e.message || e);
    }
});
