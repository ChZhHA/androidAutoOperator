const statusEl = document.getElementById("status");
const screenEl = document.getElementById("screen");
const recordBtn = document.getElementById("recordBtn");
const pauseBtn = document.getElementById("pauseBtn");
const playBtn = document.getElementById("playBtn");
const saveBtn = document.getElementById("saveBtn");
const loadInput = document.getElementById("loadInput");
const eventListEl = document.getElementById("eventList");
const logListEl = document.getElementById("logList");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const logPanel = document.getElementById("logPanel");
const logHandle = document.getElementById("logHandle");
const timeInput = document.getElementById("timeInput");
const intervalInput = document.getElementById("intervalInput");
const loopInput = document.getElementById("loopInput");
const scheduleBtn = document.getElementById("scheduleBtn");
const stopScheduleBtn = document.getElementById("stopScheduleBtn");

let dragStart = null;
let dragLast = null;
let dragMoved = false;
let lastDragTime = 0;
let isRecording = false;
let isPaused = false;
let recordStart = 0;
let recordedEvents = [];
let isPlaying = false;
let playbackTimers = [];
let scheduleActive = false;
let scheduleTimerId = null;
let scheduleLoopsLeft = 0;
let logs = [];

const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${wsProtocol}://${location.host}`);

ws.addEventListener("open", () => {
  statusEl.textContent = "已连接";
  addLog("WebSocket 已连接");
});

ws.addEventListener("close", () => {
  statusEl.textContent = "连接已断开";
  addLog("WebSocket 已断开");
});

ws.addEventListener("message", (event) => {
  const base64 = event.data;
  screenEl.src = `data:image/jpeg;base64,${base64}`;
});

function sendTap(x, y, meta = {}) {
  if (Number.isFinite(x) && Number.isFinite(y)) {
    ws.send(JSON.stringify({ type: "tap", x, y, ...meta }));
  }
}

function sendSwipe(x1, y1, x2, y2, duration, meta = {}) {
  if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
    ws.send(JSON.stringify({ type: "swipe", x1, y1, x2, y2, duration, ...meta }));
  }
}

function addLog(message) {
  const time = new Date();
  const stamp = time.toLocaleTimeString("zh-CN", { hour12: false });
  logs.unshift({ stamp, message });
  if (logs.length > 200) logs = logs.slice(0, 200);
  renderLogList();
}

function recordEvent(event) {
  if (!isRecording || isPaused) return;
  const t = performance.now() - recordStart;
  recordedEvents.push({ t, ...event });
  renderEventList();
}

function stopPlayback(options = {}) {
  playbackTimers.forEach((id) => clearTimeout(id));
  playbackTimers = [];
  isPlaying = false;
  if (!options.keepButton) {
    playBtn.classList.remove("active");
  }
}

function getPlaybackDuration(events) {
  if (!events.length) return 0;
  return Math.max(...events.map((e) => e.t)) + 50;
}

function startPlayback(events, options = {}) {
  if (!events.length) return 0;
  if (isPlaying) {
    stopPlayback({ keepButton: !options.markButton });
  }
  isPlaying = true;
  if (options.markButton) {
    playBtn.classList.add("active");
  }

  events.forEach((evt) => {
    const delay = Math.max(0, evt.t);
    const id = setTimeout(() => {
      if (!isPlaying) return;
      if (evt.type === "tap") {
        sendTap(evt.x, evt.y, { playback: true });
        if (options.logEvents) {
          addLog(`回放 TAP (${Math.round(evt.x)}, ${Math.round(evt.y)})`);
        }
      } else if (evt.type === "swipe") {
        sendSwipe(evt.x1, evt.y1, evt.x2, evt.y2, evt.duration, { playback: true });
        if (options.logEvents) {
          addLog(
            `回放 SWIPE (${Math.round(evt.x1)}, ${Math.round(evt.y1)}) → (${Math.round(evt.x2)}, ${Math.round(evt.y2)})`
          );
        }
      }
    }, delay);
    playbackTimers.push(id);
  });

  const duration = getPlaybackDuration(events);
  const endId = setTimeout(() => {
    isPlaying = false;
    if (options.markButton) {
      playBtn.classList.remove("active");
    }
    if (typeof options.onDone === "function") {
      options.onDone();
    }
  }, duration);
  playbackTimers.push(endId);
  return duration;
}

function formatTime(ms) {
  const s = Math.max(0, Math.round(ms)) / 1000;
  return `${s.toFixed(2)}s`;
}

function renderEventList() {
  if (!recordedEvents.length) {
    eventListEl.innerHTML = '<div class="empty">暂无操作记录</div>';
    return;
  }
  const items = recordedEvents
    .slice(0, 200)
    .map((evt, index) => {
      if (evt.type === "tap") {
        return `<li><span><span class="tag">TAP</span> (${Math.round(evt.x)}, ${Math.round(evt.y)})</span><span>${formatTime(evt.t)}</span></li>`;
      }
      if (evt.type === "swipe") {
        return `<li><span><span class="tag">SWIPE</span> (${Math.round(evt.x1)}, ${Math.round(evt.y1)}) → (${Math.round(evt.x2)}, ${Math.round(evt.y2)})</span><span>${formatTime(evt.t)}</span></li>`;
      }
      return `<li><span><span class="tag">EVENT</span> #${index + 1}</span><span>${formatTime(evt.t)}</span></li>`;
    })
    .join("");
  eventListEl.innerHTML = `<ul>${items}</ul>`;
}

function renderLogList() {
  if (!logs.length) {
    logListEl.innerHTML = '<div class="empty">暂无执行日志</div>';
    return;
  }
  const items = logs
    .map((log) => `<li><span>${log.message}</span><span>${log.stamp}</span></li>`)
    .join("");
  logListEl.innerHTML = `<ul>${items}</ul>`;
}

function mapPoint(event) {
  const rect = screenEl.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  const scaleX = screenEl.naturalWidth / rect.width;
  const scaleY = screenEl.naturalHeight / rect.height;
  return {
    x: clickX * scaleX,
    y: clickY * scaleY,
  };
}

screenEl.addEventListener("pointerdown", (event) => {
  if (!screenEl.naturalWidth || !screenEl.naturalHeight) return;
  event.preventDefault();
  screenEl.setPointerCapture(event.pointerId);
  const { x, y } = mapPoint(event);
  dragStart = { x, y };
  dragLast = { x, y };
  dragMoved = false;
  lastDragTime = performance.now();
});

screenEl.addEventListener("pointermove", (event) => {
  if (!dragStart) return;
  event.preventDefault();
  const { x, y } = mapPoint(event);
  dragLast = { x, y };
  const dx = x - dragStart.x;
  const dy = y - dragStart.y;
  if (!dragMoved && Math.hypot(dx, dy) > 3) {
    dragMoved = true;
  }
});

screenEl.addEventListener("pointerup", (event) => {
  if (!screenEl.naturalWidth || !screenEl.naturalHeight) return;
  if (!dragStart) return;
  event.preventDefault();

  const point = dragLast || mapPoint(event);
  const { x, y } = point;
  const dx = x - dragStart.x;
  const dy = y - dragStart.y;
  const distance = Math.hypot(dx, dy);
  const duration = Math.min(800, Math.max(80, performance.now() - lastDragTime));

  if (!dragMoved || distance < 6) {
    sendTap(dragStart.x, dragStart.y);
    recordEvent({ type: "tap", x: dragStart.x, y: dragStart.y });
    addLog(`执行 TAP (${Math.round(dragStart.x)}, ${Math.round(dragStart.y)})`);
  } else {
    sendSwipe(dragStart.x, dragStart.y, x, y, duration);
    recordEvent({ type: "swipe", x1: dragStart.x, y1: dragStart.y, x2: x, y2: y, duration });
    addLog(
      `执行 SWIPE (${Math.round(dragStart.x)}, ${Math.round(dragStart.y)}) → (${Math.round(x)}, ${Math.round(y)})`
    );
  }

  dragStart = null;
  dragLast = null;
  dragMoved = false;
});

screenEl.addEventListener("pointercancel", () => {
  dragStart = null;
});

recordBtn.addEventListener("click", () => {
  if (!isRecording) {
    recordedEvents = [];
    recordStart = performance.now();
    isRecording = true;
    isPaused = false;
    recordBtn.textContent = "停止录制";
    recordBtn.classList.add("active");
    pauseBtn.disabled = false;
    pauseBtn.textContent = "暂停录制";
    pauseBtn.classList.remove("active");
    renderEventList();
    addLog("开始录制");
  } else {
    isRecording = false;
    isPaused = false;
    recordBtn.textContent = "开始录制";
    recordBtn.classList.remove("active");
    pauseBtn.disabled = true;
    pauseBtn.textContent = "暂停录制";
    pauseBtn.classList.remove("active");
    addLog("停止录制");
  }
});

pauseBtn.addEventListener("click", () => {
  if (!isRecording) return;
  isPaused = !isPaused;
  if (isPaused) {
    pauseBtn.textContent = "继续录制";
    pauseBtn.classList.add("active");
    addLog("录制已暂停");
  } else {
    pauseBtn.textContent = "暂停录制";
    pauseBtn.classList.remove("active");
    addLog("录制继续");
  }
});

playBtn.addEventListener("click", () => {
  if (isPlaying) {
    stopPlayback();
    addLog("停止回放");
    return;
  }
  if (!recordedEvents.length) return;

  startPlayback(recordedEvents, {
    markButton: true,
    logEvents: true,
    onDone: () => {
      addLog("回放完成");
    },
  });
  addLog("开始回放");
});

saveBtn.addEventListener("click", () => {
  const data = JSON.stringify({ version: 1, events: recordedEvents }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `adb-record-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

loadInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const events = Array.isArray(json.events) ? json.events : Array.isArray(json) ? json : [];
    recordedEvents = events
      .filter((e) => e && Number.isFinite(e.t) && (e.type === "tap" || e.type === "swipe"))
      .map((e) => ({ ...e }));
    renderEventList();
    addLog("已加载 JSON");
  } catch {
    return;
  } finally {
    loadInput.value = "";
  }
});

function clearSchedule() {
  if (scheduleTimerId) {
    clearTimeout(scheduleTimerId);
    scheduleTimerId = null;
  }
  scheduleActive = false;
  scheduleBtn.classList.remove("active");
  stopScheduleBtn.disabled = true;
}

function runScheduledLoop() {
  if (!scheduleActive) return;
  if (!recordedEvents.length) {
    clearSchedule();
    return;
  }

  if (scheduleLoopsLeft !== Infinity) {
    if (scheduleLoopsLeft <= 0) {
      clearSchedule();
      return;
    }
    scheduleLoopsLeft -= 1;
  }

  startPlayback(recordedEvents, {
    markButton: false,
    logEvents: true,
    onDone: () => {
      if (!scheduleActive) return;
      const interval = Math.max(0, Number(intervalInput.value || 0));
      addLog("本轮回放完成，等待下次执行");
      scheduleTimerId = setTimeout(runScheduledLoop, interval);
    },
  });
  addLog("定时任务开始执行");
}

function getDelayFromTimeValue(timeValue) {
  if (!timeValue) return 0;
  const parts = timeValue.split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  let second = 0;
  let milli = 0;
  if (parts.length >= 3) {
    const secPart = parts[2];
    if (secPart.includes(".")) {
      const [secStr, msStr] = secPart.split(".");
      second = Number(secStr);
      milli = Number((msStr || "0").padEnd(3, "0").slice(0, 3));
    } else {
      second = Number(secPart);
    }
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second) || !Number.isFinite(milli)) return 0;

  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, second, milli);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

scheduleBtn.addEventListener("click", () => {
  if (!recordedEvents.length) return;
  if (scheduleActive) return;
  scheduleActive = true;
  scheduleBtn.classList.add("active");
  stopScheduleBtn.disabled = false;

  const delay = getDelayFromTimeValue(timeInput.value);
  const loops = Math.max(0, Number(loopInput.value || 0));
  scheduleLoopsLeft = loops === 0 ? Infinity : loops;

  scheduleTimerId = setTimeout(runScheduledLoop, delay);
  addLog("定时任务已启动");
});

stopScheduleBtn.addEventListener("click", () => {
  clearSchedule();
  if (isPlaying) {
    stopPlayback({ keepButton: true });
  }
  addLog("定时任务已停止");
});

renderEventList();
renderLogList();

function setTheme(mode) {
  const theme = mode === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "切换浅色" : "切换深色";
}

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light" || savedTheme === "dark") {
  setTheme(savedTheme);
} else {
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  setTheme(prefersLight ? "light" : "dark");
}

themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === "light" ? "dark" : "light");
});

function setLogPanelCollapsed(collapsed) {
  logPanel.classList.toggle("collapsed", collapsed);
  localStorage.setItem("logPanelCollapsed", collapsed ? "1" : "0");
}

function setLogPanelWidth(width) {
  logPanel.style.width = `${width}px`;
  localStorage.setItem("logPanelWidth", String(width));
}

const savedCollapsed = localStorage.getItem("logPanelCollapsed") === "1";
const savedWidth = Number(localStorage.getItem("logPanelWidth") || 0);
if (savedWidth > 120) {
  setLogPanelWidth(savedWidth);
}
setLogPanelCollapsed(savedCollapsed);

let dragActive = false;
let dragStartX = 0;
let dragStartWidth = 0;

logHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dragActive = true;
  dragStartX = event.clientX;
  dragStartWidth = logPanel.getBoundingClientRect().width;
  logHandle.setPointerCapture(event.pointerId);
});

logHandle.addEventListener("pointermove", (event) => {
  if (!dragActive) return;
  const delta = dragStartX - event.clientX;
  const newWidth = Math.min(520, Math.max(44, dragStartWidth + delta));
  if (newWidth <= 60) {
    setLogPanelCollapsed(true);
    setLogPanelWidth(44);
  } else {
    setLogPanelCollapsed(false);
    setLogPanelWidth(newWidth);
  }
});

logHandle.addEventListener("pointerup", () => {
  dragActive = false;
});

logHandle.addEventListener("pointercancel", () => {
  dragActive = false;
});
