const path = require("path");
const { execFile, spawn } = require("child_process");
const express = require("express");
const WebSocket = require("ws");

const ADB_PATH = process.env.ADB_PATH || "adb";
const PORT = process.env.PORT || 3000;
const CAPTURE_INTERVAL_MS = Number(process.env.CAPTURE_INTERVAL_MS || 16);
const DEVICE_ID = process.env.ADB_DEVICE || ""; // optional: set device serial
const MINICAP_PATH = process.env.MINICAP_PATH || "/data/local/tmp/minicap";
const MINICAP_QUALITY = Number(process.env.MINICAP_QUALITY || 60);
const MINICAP_TIMEOUT_MS = Number(process.env.MINICAP_TIMEOUT_MS || 3000);

let cachedProjection = null;
let minicapProc = null;
let minicapBuffer = Buffer.alloc(0);
let minicapBannerRead = false;
let minicapBannerLength = 0;
let minicapFrameLength = 0;
let lastFrame = null;
let lastFrameSeq = 0;
let lastFrameAt = 0;
let minicapStartAt = 0;
let minicapFailures = 0;
let useMinicap = true;
let capturing = false;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({ server });

function adbArgs(baseArgs) {
  return DEVICE_ID ? ["-s", DEVICE_ID, ...baseArgs] : baseArgs;
}

function getDeviceSize() {
  return new Promise((resolve, reject) => {
    execFile(ADB_PATH, adbArgs(["shell", "wm", "size"]), { encoding: "utf8" }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      const matches = stdout.match(/(\d+)x(\d+)/g);
      if (!matches || matches.length === 0) {
        reject(new Error("Unable to detect device size"));
        return;
      }
      const last = matches[matches.length - 1];
      const [width, height] = last.split("x").map((v) => Number(v));
      resolve({ width, height });
    });
  });
}

async function getProjection() {
  if (cachedProjection) return cachedProjection;
  const { width, height } = await getDeviceSize();
  cachedProjection = `${width}x${height}@${width}x${height}/0`;
  return cachedProjection;
}

function resetMinicapState() {
  minicapBuffer = Buffer.alloc(0);
  minicapBannerRead = false;
  minicapBannerLength = 0;
  minicapFrameLength = 0;
}

function captureScreencap() {
  return new Promise((resolve, reject) => {
    execFile(ADB_PATH, adbArgs(["exec-out", "screencap", "-p"]), { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

async function startMinicapStream() {
  if (minicapProc) return;
  const projection = await getProjection();
  const quality = Number.isFinite(MINICAP_QUALITY) ? MINICAP_QUALITY : 80;
  const cmd = `LD_LIBRARY_PATH=/data/local/tmp ${MINICAP_PATH} -P ${projection} -Q ${quality}`;
  minicapProc = spawn(ADB_PATH, adbArgs(["exec-out", "sh", "-c", cmd]));
  resetMinicapState();
  lastFrame = null;
  minicapStartAt = Date.now();

  minicapProc.stdout.on("data", (chunk) => {
    minicapBuffer = Buffer.concat([minicapBuffer, chunk]);

    while (true) {
      if (!minicapBannerRead) {
        if (minicapBuffer.length < 2) return;
        minicapBannerLength = minicapBuffer[1];
        if (minicapBuffer.length < minicapBannerLength) return;
        minicapBuffer = minicapBuffer.slice(minicapBannerLength);
        minicapBannerRead = true;
      }

      if (minicapFrameLength === 0) {
        if (minicapBuffer.length < 4) return;
        minicapFrameLength = minicapBuffer.readUInt32LE(0);
        minicapBuffer = minicapBuffer.slice(4);
      }

      if (minicapBuffer.length < minicapFrameLength) return;
      const frame = minicapBuffer.slice(0, minicapFrameLength);
      minicapBuffer = minicapBuffer.slice(minicapFrameLength);
      minicapFrameLength = 0;
      lastFrame = frame;
      lastFrameSeq += 1;
      lastFrameAt = Date.now();
    }
  });

  minicapProc.stderr.on("data", (chunk) => {
    const msg = chunk.toString("utf8").trim();
    if (msg) {
      console.error("minicap:", msg);
    }
  });

  minicapProc.on("close", () => {
    minicapProc = null;
    resetMinicapState();
    lastFrame = null;
  });
}

function stopMinicapStream() {
  if (!minicapProc) return;
  minicapProc.kill();
  minicapProc = null;
  resetMinicapState();
}

setInterval(async () => {
  const clients = Array.from(wss.clients).filter((ws) => ws.readyState === WebSocket.OPEN);
  if (clients.length === 0) {
    stopMinicapStream();
    capturing = false;
    return;
  }

  if (useMinicap) {
    if (!minicapProc) {
      try {
        await startMinicapStream();
      } catch (err) {
        console.error("Minicap start failed:", err.message || err);
        minicapFailures += 1;
      }
    }

    if (minicapProc && minicapStartAt > 0) {
      const now = Date.now();
      if (!lastFrame && now - minicapStartAt > MINICAP_TIMEOUT_MS) {
        minicapFailures += 1;
        stopMinicapStream();
      }
      if (minicapFailures >= 3) {
        console.error("Minicap failed repeatedly, fallback to screencap");
        useMinicap = false;
      }
    }

    if (lastFrame) {
      const payload = lastFrame.toString("base64");
      for (const ws of clients) {
        ws.send(payload);
      }
    }
    return;
  }

  if (capturing) return;
  capturing = true;
  try {
    const frame = await captureScreencap();
    const payload = frame.toString("base64");
    for (const ws of clients) {
      ws.send(payload);
    }
  } catch (err) {
    console.error("Screencap failed:", err.message || err);
  } finally {
    capturing = false;
  }
}, CAPTURE_INTERVAL_MS);

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data && data.type === "tap" && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      const x = Math.round(data.x);
      const y = Math.round(data.y);
      execFile(ADB_PATH, adbArgs(["shell", "input", "tap", String(x), String(y)]), (err) => {
        if (err) {
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
    ) {
      const x1 = Math.round(data.x1);
      const y1 = Math.round(data.y1);
      const x2 = Math.round(data.x2);
      const y2 = Math.round(data.y2);
      const duration = Number.isFinite(data.duration) ? Math.max(50, Math.round(data.duration)) : 120;
      execFile(
        ADB_PATH,
        adbArgs(["shell", "input", "swipe", String(x1), String(y1), String(x2), String(y2), String(duration)]),
        (err) => {
          if (err) {
            console.error("Swipe failed:", err.message || err);
          }
        }
      );
    }
  });
});
