const statusEl = document.getElementById("status");
const screenEl = document.getElementById("screen");
const screenCtx = screenEl.getContext("2d");
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
const addType = document.getElementById("addType");
const addX = document.getElementById("addX");
const addY = document.getElementById("addY");
const addX2 = document.getElementById("addX2");
const addY2 = document.getElementById("addY2");
const addDuration = document.getElementById("addDuration");
const addWaitDuration = document.getElementById("addWaitDuration");
const addLabelName = document.getElementById("addLabelName");
const addEventBtn = document.getElementById("addEventBtn");
// removed top-level goto input/button (now handled in modal)
const addCondType = document.getElementById("addCondType");
const addCondTimes = document.getElementById("addCondTimes");
const addCondColor = document.getElementById("addCondColor");
const addCondColorPreview = document.getElementById("addCondColorPreview");
const addCondPickBtn = document.getElementById("addCondPickBtn");
const addCondTol = document.getElementById("addCondTol");
const addCondRadius = document.getElementById("addCondRadius");
const editIndexEl = document.getElementById("editIndex");
let pickActive = false;
let addCondSampleX = null;
let addCondSampleY = null;
let pickTarget = null; // { mode: 'modal'|'inline', input: HTMLElement, index?: number, field?: string }
let pickReturnModal = false;
const addCondX = document.getElementById("addCondX");
const addCondY = document.getElementById("addCondY");
const cursorInfoEl = document.getElementById("cursorInfo");

const DEFAULT_INTERVAL = 500; // ms 用于新添加/goto事件的默认间隔
const LONGPRESS_THRESHOLD = 600; // ms 长按判断阈值
const openAddModalBtn = document.getElementById("openAddModalBtn");
const closeAddModalBtn = document.getElementById("closeAddModalBtn");
const addModal = document.getElementById("addModal");

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
ws.binaryType = "blob";

// --- i18n support ---
const I18N = {
  zh: {
    "app.title": "ADB 远程画面与点击",
    "app.desc": "本页面通过 ADB 实时拉取手机截图，并支持点击画面进行远程点击。",
    "status.connected": "已连接",
    "status.disconnected": "连接已断开",
    "btn.themeToggle": "切换浅色",
    "btn.record.start": "开始录制",
    "btn.record.stop": "停止录制",
    "btn.pause": "暂停录制",
    "btn.resume": "继续录制",
    "btn.play": "回放",
    "btn.save": "保存 JSON",
    "btn.load": "读取 JSON",
    "btn.addOperation": "添加操作",
    "card.events": "操作列表",
    "card.logs": "执行日志",
    "card.theme": "主题",
    "card.record": "录制与回放",
    "card.schedule": "定时任务",
    "modal.title": "添加操作",
    "modal.add": "添加",
    "modal.cancel": "取消",
    "picker.pick": "取色",
    "picker.cancel": "取消取色",
    "picker.infoColor": "取色中：在画面点击采样，或再次点击\"取消取色\"",
    "picker.infoPoint": "取点中：在画面点击采样，或按 Esc 取消",
    "log.websocketConnected": "WebSocket 已连接",
    "log.websocketDisconnected": "WebSocket 已断开",
    "log.colorSampled": "已采样颜色 {hex}",
    "log.coordSampled": "已采样坐标 ({x},{y})",
    "log.startRecord": "开始录制",
    "log.stopRecord": "停止录制",
    "log.pauseRecord": "录制已暂停",
    "log.resumeRecord": "录制继续",
    "log.startPlayback": "开始回放",
    "log.stopPlayback": "停止回放",
    "log.playbackDone": "回放完成",
    "log.loadedJson": "已加载 JSON",
    "log.scheduledRoundComplete": "本轮回放完成，等待下次执行",
    "log.scheduledStart": "定时任务已启动",
    "log.scheduledStopped": "定时任务已停止",
    "btn.delete": "删除",
    "btn.pickPoint": "取点",
    "label.lang": "言/Language",
    "evt.tap": "点击",
    "evt.swipe": "滑动",
    "evt.label": "标签",
    "evt.goto": "跳转",
    "evt.longpress": "长按",
    "evt.wait": "等待",
    "field.x": "X",
    "field.y": "Y",
    "opt.tap": "点击",
    "opt.swipe": "滑动",
    "opt.longpress": "长按",
    "opt.label": "标签",
    "opt.goto": "跳转",
    "opt.wait": "等待",
    "field.x1": "X1",
    "field.y1": "Y1",
    "field.x2": "X2",
    "field.y2": "Y2",
    "field.duration": "时长(s)",
    "label.labelName": "标签名",
    "field.wait_duration": "时长(s)",
    "field.interval": "间隔(s)",
    "field.wait_ms": "时长(ms)",
    "cond.repeat": " 条件: 执行 {n} 次",
    "cond.colorDesc": " 条件: 颜色 {color} 容差 {tol} 半径 {radius}{coords}",
    "cond.coords": " 坐标({x},{y})",
    "log.add.tap": "添加 TAP ({x}, {y})",
    "log.update.tap": "更新 TAP ({x}, {y})",
    "log.add.swipe": "添加 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.update.swipe": "更新 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.add.label": "添加 标签 {name}",
    "log.update.label": "更新 标签 {name}",
    "log.add.goto": "添加 GOTO {name}{cond}",
    "log.update.goto": "更新 GOTO {name}{cond}",
    "log.add.longpress": "添加 LONGPRESS ({x}, {y}) {duration}ms",
    "log.update.longpress": "更新 LONGPRESS ({x}, {y}) {duration}ms",
    "log.add.wait": "添加 WAIT {dur}ms",
    "log.update.wait": "更新 WAIT {dur}ms",
    "log.playEvent.tap": "回放 TAP ({x}, {y})",
    "log.playEvent.swipe": "回放 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.playEvent.longpress": "回放 LONGPRESS ({x}, {y}) {duration}ms",
    "log.gotoEncounter": "遇到 GOTO {name}",
    "log.gotoColorCond": "GOTO {name} 条件 color: 采样 {sampled} 距离 {dist}",
    "log.gotoColorNotMet": "GOTO {name} 条件 color 未满足，跳过",
    "log.gotoRepeatExec": "GOTO {name} 条件 repeat: 第 {n} 次，执行跳转",
    "log.gotoRepeatSkip": "GOTO {name} 条件 repeat: 已达到次数，跳过",
    "log.gotoNoCond": "GOTO {name} 无条件，执行跳转",
    "log.tagNotFound": "未找到标签 {name}",
    "log.playFromTagStart": "从标签 {name} 开始回放",
    "log.playFromTagDone": "从标签 {name} 回放完成",
    "label.hasCond": " （有条件）",
    "log.exec.tap": "执行 TAP ({x}, {y})",
    "log.exec.swipe": "执行 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.exec.longpress": "执行 LONGPRESS ({x}, {y}) {duration}ms",
    "empty.events": "暂无操作记录",
    "empty.logs": "暂无执行日志",
    "opt.repeat": "执行 n 次",
    "opt.colorCond": "屏幕模糊取色",
    "label.startTime": "开始时间(24小时制，含毫秒)",
    "label.interval": "间隔(ms)",
    "label.loopCount": "循环次数(0=无限)",
    "btn.scheduleStart": "开始定时",
    "btn.scheduleStop": "停止定时",
    "label.type": "类型",
    "label.times": "次数",
    "label.color": "颜色",
    "label.tolerance": "容差",
    "label.radius": "采样半径",
    "label.sampleCoords": "采样坐标",
    "hint.sampleNote": "提示：可手动填写或使用“取色”在画面上点击采样。",
  },
  en: {
    "app.title": "ADB Remote Screen & Touch",
    "app.desc": "This page pulls screenshots from a device via ADB and supports remote touch actions.",
    "status.connected": "Connected",
    "status.disconnected": "Disconnected",
    "btn.themeToggle": "Toggle Light",
    "btn.record.start": "Start Recording",
    "btn.record.stop": "Stop Recording",
    "btn.pause": "Pause Recording",
    "btn.resume": "Resume Recording",
    "btn.play": "Play",
    "btn.save": "Save JSON",
    "btn.load": "Load JSON",
    "btn.addOperation": "Add Action",
    "card.events": "Actions",
    "card.logs": "Logs",
    "card.theme": "Theme",
    "card.record": "Record & Playback",
    "card.schedule": "Schedule",
    "modal.title": "Add Action",
    "modal.add": "Add",
    "modal.cancel": "Cancel",
    "picker.pick": "Pick Color",
    "picker.cancel": "Cancel",
    "picker.infoColor": "Picking color: click on the screen to sample, or click Cancel",
    "picker.infoPoint": "Picking point: click on the screen to sample, or press Esc to cancel",
    "log.websocketConnected": "WebSocket connected",
    "log.websocketDisconnected": "WebSocket disconnected",
    "log.colorSampled": "Color sampled {hex}",
    "log.coordSampled": "Sampled coordinate ({x},{y})",
    "log.startRecord": "Start recording",
    "log.stopRecord": "Stop recording",
    "log.pauseRecord": "Recording paused",
    "log.resumeRecord": "Recording resumed",
    "log.startPlayback": "Start playback",
    "log.stopPlayback": "Stop playback",
    "log.playbackDone": "Playback finished",
    "log.loadedJson": "JSON loaded",
    "log.scheduledRoundComplete": "Round finished, waiting for next run",
    "log.scheduledStart": "Schedule started",
    "log.scheduledStopped": "Schedule stopped",
    "empty.events": "No recorded actions",
    "empty.logs": "No logs",
    "opt.repeat": "Repeat n times",
    "opt.colorCond": "Screen color sample",
    "label.startTime": "Start time (24h, with milliseconds)",
    "label.interval": "Interval (ms)",
    "label.loopCount": "Loop count (0 = infinite)",
    "btn.scheduleStart": "Start Schedule",
    "btn.scheduleStop": "Stop Schedule",
    "label.type": "Type",
    "label.times": "Times",
    "label.color": "Color",
    "label.tolerance": "Tolerance",
    "label.radius": "Radius",
    "label.sampleCoords": "Sample Coordinates",
    "hint.sampleNote": "Hint: fill manually or use 'Pick' to sample on screen.",
    "btn.delete": "Delete",
    "btn.pickPoint": "Pick",
    "label.lang": "言/Language",
    "opt.tap": "Tap",
    "opt.swipe": "Swipe",
    "opt.longpress": "Long press",
    "opt.label": "Label",
    "opt.goto": "Goto",
    "opt.wait": "Wait",
    "evt.tap": "Tap",
    "evt.swipe": "Swipe",
    "evt.label": "Label",
    "evt.goto": "Goto",
    "evt.longpress": "Long press",
    "evt.wait": "Wait",
    "field.x": "X",
    "field.y": "Y",
    "field.x1": "X1",
    "field.y1": "Y1",
    "field.x2": "X2",
    "field.y2": "Y2",
    "field.duration": "Duration(s)",
    "label.labelName": "Label Name",
    "field.wait_duration": "Duration(s)",
    "field.interval": "Interval(s)",
    "field.wait_ms": "Duration(ms)",
    "cond.repeat": " Condition: repeat {n} times",
    "cond.colorDesc": " Condition: color {color} tol {tol} radius {radius}{coords}",
    "cond.coords": " ({x},{y})",
    "log.add.tap": "Added TAP ({x}, {y})",
    "log.update.tap": "Updated TAP ({x}, {y})",
    "log.add.swipe": "Added SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.update.swipe": "Updated SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.add.label": "Added label {name}",
    "log.update.label": "Updated label {name}",
    "log.add.goto": "Added GOTO {name}{cond}",
    "log.update.goto": "Updated GOTO {name}{cond}",
    "log.add.longpress": "Added LONGPRESS ({x}, {y}) {duration}ms",
    "log.update.longpress": "Updated LONGPRESS ({x}, {y}) {duration}ms",
    "log.add.wait": "Added WAIT {dur}ms",
    "log.update.wait": "Updated WAIT {dur}ms",
    "log.playEvent.tap": "Play TAP ({x}, {y})",
    "log.playEvent.swipe": "Play SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.playEvent.longpress": "Play LONGPRESS ({x}, {y}) {duration}ms",
    "log.gotoEncounter": "Encounter GOTO {name}",
    "log.gotoColorCond": "GOTO {name} color cond: sampled {sampled} dist {dist}",
    "log.gotoColorNotMet": "GOTO {name} color cond not met, skip",
    "log.gotoRepeatExec": "GOTO {name} repeat cond: exec #{n}, jumping",
    "log.gotoRepeatSkip": "GOTO {name} repeat cond reached, skip",
    "log.gotoNoCond": "GOTO {name} no cond, jumping",
    "log.tagNotFound": "Tag {name} not found",
    "log.playFromTagStart": "Playback from tag {name} started",
    "log.playFromTagDone": "Playback from tag {name} done",
    "label.hasCond": " (cond)",
    "log.exec.tap": "Play TAP ({x}, {y})",
    "log.exec.swipe": "Play SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.exec.longpress": "Play LONGPRESS ({x}, {y}) {duration}ms",
  },
  ja: {
    "app.title": "ADB リモート画面とタッチ",
    "app.desc": "ADB を介してデバイスのスクリーンショットを取得し、リモートタッチ操作を行えます。",
    "status.connected": "接続済み",
    "status.disconnected": "切断されました",
    "btn.themeToggle": "ライト切替",
    "btn.record.start": "録画開始",
    "btn.record.stop": "録画停止",
    "btn.pause": "録画を一時停止",
    "btn.resume": "録画を再開",
    "btn.play": "再生",
    "btn.save": "JSON を保存",
    "btn.load": "JSON を読み込む",
    "btn.addOperation": "操作を追加",
    "card.events": "操作リスト",
    "card.logs": "実行ログ",
    "card.theme": "テーマ",
    "card.record": "録画と再生",
    "card.schedule": "スケジュール",
    "modal.title": "操作を追加",
    "modal.add": "追加",
    "modal.cancel": "キャンセル",
    "picker.pick": "色を取得",
    "picker.cancel": "取得をキャンセル",
    "picker.infoColor": "色取得中: 画面をクリックしてサンプル、またはキャンセルをクリック",
    "picker.infoPoint": "座標取得中: 画面をクリックしてサンプル、または Esc キーでキャンセル",
    "log.websocketConnected": "WebSocket に接続しました",
    "log.websocketDisconnected": "WebSocket から切断されました",
    "log.colorSampled": "色を取得しました {hex}",
    "log.coordSampled": "座標を取得しました ({x},{y})",
    "log.startRecord": "録画開始",
    "log.stopRecord": "録画停止",
    "log.pauseRecord": "録画を一時停止しました",
    "log.resumeRecord": "録画を再開しました",
    "log.startPlayback": "再生を開始しました",
    "log.stopPlayback": "再生を停止しました",
    "log.playbackDone": "再生が完了しました",
    "log.loadedJson": "JSON を読み込みました",
    "log.scheduledRoundComplete": "ラウンドが完了しました。次の実行を待機します",
    "log.scheduledStart": "スケジュールを開始しました",
    "log.scheduledStopped": "スケジュールを停止しました",
    "empty.events": "操作がありません",
    "empty.logs": "ログがありません",
    "opt.repeat": "n 回実行",
    "opt.colorCond": "画面の色サンプリング",
    "label.startTime": "開始時刻（24時間表記、ミリ秒含む）",
    "label.interval": "間隔(ms)",
    "label.loopCount": "ループ回数(0=無限)",
    "btn.scheduleStart": "スケジュール開始",
    "btn.scheduleStop": "スケジュール停止",
    "label.type": "タイプ",
    "label.times": "回数",
    "label.color": "色",
    "label.tolerance": "許容値",
    "label.radius": "サンプリング半径",
    "label.sampleCoords": "サンプリング座標",
    "hint.sampleNote": "ヒント: 手動で入力するか、画面上の「取得」でサンプリングしてください。",
    "btn.delete": "削除",
    "btn.pickPoint": "取得",
    "label.lang": "言/Language",
    "evt.tap": "タップ",
    "evt.swipe": "スワイプ",
    "evt.label": "ラベル",
    "evt.goto": "移動",
    "evt.longpress": "長押し",
    "evt.wait": "待機",
    "opt.tap": "タップ",
    "opt.swipe": "スワイプ",
    "opt.longpress": "長押し",
    "opt.label": "ラベル",
    "opt.goto": "移動",
    "opt.wait": "待機",
    "field.x": "X",
    "field.y": "Y",
    "field.x1": "X1",
    "field.y1": "Y1",
    "field.x2": "X2",
    "field.y2": "Y2",
    "field.duration": "時長(s)",
    "label.labelName": "ラベル名",
    "field.wait_duration": "時長(s)",
    "field.interval": "間隔(s)",
    "field.wait_ms": "時長(ms)",
    "cond.repeat": " 条件: 実行 {n} 回",
    "cond.colorDesc": " 条件: 色 {color} 許容 {tol} 半径 {radius}{coords}",
    "cond.coords": " 座標({x},{y})",
    "log.add.tap": "追加 TAP ({x}, {y})",
    "log.update.tap": "更新 TAP ({x}, {y})",
    "log.add.swipe": "追加 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.update.swipe": "更新 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.add.label": "ラベルを追加 {name}",
    "log.update.label": "ラベルを更新 {name}",
    "log.add.goto": "GOTO を追加 {name}{cond}",
    "log.update.goto": "GOTO を更新 {name}{cond}",
    "log.add.longpress": "追加 LONGPRESS ({x}, {y}) {duration}ms",
    "log.update.longpress": "更新 LONGPRESS ({x}, {y}) {duration}ms",
    "log.add.wait": "追加 WAIT {dur}ms",
    "log.update.wait": "更新 WAIT {dur}ms",
    "log.playEvent.tap": "再生 TAP ({x}, {y})",
    "log.playEvent.swipe": "再生 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.playEvent.longpress": "再生 LONGPRESS ({x}, {y}) {duration}ms",
    "log.gotoEncounter": "GOTO に到達 {name}",
    "log.gotoColorCond": "GOTO {name} 条件 color: サンプル {sampled} 距離 {dist}",
    "log.gotoColorNotMet": "GOTO {name} 条件 color 未達、スキップ",
    "log.gotoRepeatExec": "GOTO {name} 条件 repeat: {n} 回目、ジャンプ実行",
    "log.gotoRepeatSkip": "GOTO {name} 条件 repeat: 回数に達したためスキップ",
    "log.gotoNoCond": "GOTO {name} 条件なし、ジャンプ実行",
    "log.tagNotFound": "タグ {name} が見つかりません",
    "log.playFromTagStart": "タグ {name} から再生開始",
    "log.playFromTagDone": "タグ {name} からの再生完了",
    "label.hasCond": " （条件あり）",
    "log.exec.tap": "実行 TAP ({x}, {y})",
    "log.exec.swipe": "実行 SWIPE ({x1}, {y1}) → ({x2}, {y2})",
    "log.exec.longpress": "実行 LONGPRESS ({x}, {y}) {duration}ms",
  },
};

function detectLangKey() {
  const nav = navigator.language || navigator.userLanguage || "";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("en")) return "en";
  return "zh";
}

let LANG = detectLangKey();

function t(key, vars) {
  const dict = I18N[LANG] || I18N.zh;
  let v = dict[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      v = v.replace(new RegExp(`\{${k}\}`, "g"), String(vars[k]));
    });
  }
  return v;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n-key]").forEach((el) => {
    const key = el.dataset.i18nKey;
    if (!key) return;
    // if element is input placeholder
    if (el.tagName === "INPUT" && el.placeholder !== undefined) {
      el.placeholder = t(key);
    } else {
      el.textContent = t(key);
    }
  });
}

function updateDynamicTexts() {
  // update dynamic button labels and stateful texts
  if (recordBtn) recordBtn.textContent = isRecording ? t('btn.record.stop') : t('btn.record.start');
  if (pauseBtn) pauseBtn.textContent = isPaused ? t('btn.resume') : t('btn.pause');
  if (playBtn) playBtn.textContent = t('btn.play');
  if (saveBtn) saveBtn.textContent = t('btn.save');
  const loadLabel = document.querySelector('label[for="loadInput"]');
  if (loadLabel) loadLabel.textContent = t('btn.load');
  if (themeToggleBtn) themeToggleBtn.textContent = t('btn.themeToggle');
  // ensure status text respects current connection state when language changes
  if (typeof statusEl !== 'undefined' && statusEl) {
    const connected = typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN;
    statusEl.textContent = connected ? t('status.connected') : t('status.disconnected');
  }
}

function setLang(l) {
  if (!I18N[l]) return;
  LANG = l;
  applyI18n();
  updateDynamicTexts();
  const sel = document.getElementById('langSelect');
  if (sel) sel.value = l;
}

// apply immediately and wire selector
document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  updateDynamicTexts();
  const sel = document.getElementById('langSelect');
  if (sel) {
    sel.value = LANG;
    sel.addEventListener('change', (e) => {
      const v = e.target.value;
      setLang(v);
    });
  }
});

ws.addEventListener("open", () => {
  statusEl.textContent = t('status.connected');
  addLog(t('log.websocketConnected'));
});

ws.addEventListener("close", () => {
  statusEl.textContent = t('status.disconnected');
  addLog(t('log.websocketDisconnected'));
});

const BLANK_IMG =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

let lastObjectUrl = null;
ws.addEventListener("message", (event) => {
  const blob = new Blob([event.data], { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    screenEl.width = img.width;
    screenEl.height = img.height;
    screenCtx.drawImage(img, 0, 0);
    img.onload = null;
    img.src = BLANK_IMG;
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
    }
    lastObjectUrl = url;
  };
  img.src = url;
});

function sendTap(x, y, meta = {}) {
  // 在取色模式下屏蔽发送到手机
  if (pickActive) return;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    ws.send(JSON.stringify({ type: "tap", x, y, ...meta }));
  }
}

function sendSwipe(x1, y1, x2, y2, duration, meta = {}) {
  // 在取色模式下屏蔽发送到手机
  if (pickActive) return;
  if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
    ws.send(JSON.stringify({ type: "swipe", x1, y1, x2, y2, duration, ...meta }));
  }
}

function sendLongPress(x, y, duration, meta = {}) {
  if (pickActive) return;
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(duration)) {
    ws.send(JSON.stringify({ type: "longpress", x, y, duration, ...meta }));
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
  const abs = performance.now() - recordStart;
  const lastAbs = recordedEvents.reduce((s, e) => s + Number(e.t || 0), 0);
  let interval = Math.max(0, abs - lastAbs);
  // ensure at least 1ms
  if (interval < 1) interval = 1;
  recordedEvents.push({ t: interval, ...event });
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
  return events.reduce((s, e) => s + Number(e.t || 0), 0) + 50;
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

  let cum = 0;
  events.forEach((evt) => {
    cum += Math.max(0, Number(evt.t || 0));
    const id = setTimeout(() => {
      if (!isPlaying) return;
      if (evt.type === "tap") {
        sendTap(evt.x, evt.y, { playback: true });
        if (options.logEvents) addLog(t('log.playEvent.tap', { x: Math.round(evt.x), y: Math.round(evt.y) }));
      } else if (evt.type === "swipe") {
        sendSwipe(evt.x1, evt.y1, evt.x2, evt.y2, evt.duration, { playback: true });
        if (options.logEvents)
          addLog(t('log.playEvent.swipe', { x1: Math.round(evt.x1), y1: Math.round(evt.y1), x2: Math.round(evt.x2), y2: Math.round(evt.y2) }));
      } else if (evt.type === "longpress") {
        sendLongPress(evt.x, evt.y, evt.duration, { playback: true });
        if (options.logEvents) addLog(t('log.playEvent.longpress', { x: Math.round(evt.x), y: Math.round(evt.y), duration: Math.round(evt.duration) }));
      } else if (evt.type === "goto") {
        // 当回放遇到 goto，先评估条件（若存在），满足则停止当前回放并从标签处继续
        if (options.logEvents) addLog(t('log.gotoEncounter', { name: evt.name }));
        const cond = evt.cond || null;
        // 优先处理 color 条件并直接返回，避免后续重复处理
        if (cond && cond.type === "color") {
          const sampled = sampleAtCond(cond);
          const dist = colorDistanceHex(sampled, String(cond.color || ""));
          if (options.logEvents) addLog(t('log.gotoColorCond', { name: evt.name, sampled, dist: Math.round(dist) }));
          const tol = Number(cond.tol || 0);
          if (dist <= tol) {
            stopPlayback();
            gotoTag(evt.name);
          } else {
            if (options.logEvents) addLog(t('log.gotoColorNotMet', { name: evt.name }));
          }
          return;
        }
        if (cond) {
          if (cond.type === "repeat") {
            cond._executed = cond._executed || 0;
            const times = Number(cond.times || 0);
            if (cond._executed < times) {
              cond._executed += 1;
              if (options.logEvents) addLog(t('log.gotoRepeatExec', { name: evt.name, n: cond._executed }));
              stopPlayback();
              gotoTag(evt.name);
            } else {
              if (options.logEvents) addLog(t('log.gotoRepeatSkip', { name: evt.name }));
            }
          } else if (cond.type === "color") {
            // 在屏幕中心采样
            const cx = Math.floor((screenEl.width || 0) / 2);
            const cy = Math.floor((screenEl.height || 0) / 2);
            const radius = Math.max(0, Math.floor(Number(cond.radius || 3)));
            const sampled = sampleAverageColor(cx, cy, radius);
            const dist = colorDistanceHex(sampled, String(cond.color || ""));
            if (options.logEvents) addLog(t('log.gotoColorCond', { name: evt.name, sampled, dist: Math.round(dist) }));
            const tol = Number(cond.tol || 0);
            if (dist <= tol) {
              stopPlayback();
              gotoTag(evt.name);
            } else {
              if (options.logEvents) addLog(t('log.gotoColorNotMet', { name: evt.name }));
            }
          } else {
            // 未知条件类型，直接跳转
            stopPlayback();
            gotoTag(evt.name);
          }
        } else {
          // 无条件直接跳转
          if (options.logEvents) addLog(t('log.gotoNoCond', { name: evt.name }));
          stopPlayback();
          gotoTag(evt.name);
        }
      }
      else if (evt.type === "longpress") {
        // handled above
      }
    }, cum);
    playbackTimers.push(id);
  });

  const duration = getPlaybackDuration(events);
  const endId = setTimeout(() => {
    isPlaying = false;
    if (options.markButton) playBtn.classList.remove("active");
    if (typeof options.onDone === "function") options.onDone();
  }, duration);
  playbackTimers.push(endId);
  return duration;
}

function formatTime(ms) {
  const s = Math.max(0, Math.round(ms)) / 1000;
  return `${s.toFixed(2)}s`;
}

function formatSeconds(ms) {
  const s = Math.max(0, Number(ms || 0)) / 1000;
  return s.toFixed(2);
}

function getEventIntervals(events) {
  return events.map((e) => Math.max(0, Number(e.t || 0)));
}

function renderEventList() {
  if (!recordedEvents.length) {
    eventListEl.innerHTML = `<div class="empty">${t('empty.events')}</div>`;
    return;
  }
  const intervals = getEventIntervals(recordedEvents);
  const items = recordedEvents
    .slice(0, 200)
    .map((evt, index) => {
      const deleteHtml = `<button class="evt-del" data-index="${index}" aria-label="${t('btn.delete')}">×</button>`;
      if (evt.type === "tap") {
        return `<li class="event-item" draggable="true" data-index="${index}">
          ${deleteHtml}
          <div class="event-main">
            <span class="tag">${t('evt.tap')}</span>
            <span class="event-label">${t('field.x')}</span>
            <span class="event-value" data-index="${index}" data-field="x" data-step="0.1">${Number(evt.x ?? 0).toFixed(1)}</span>
            <span class="event-label">${t('field.y')}</span>
            <span class="event-value" data-index="${index}" data-field="y" data-step="0.1">${Number(evt.y ?? 0).toFixed(1)}</span>
          </div>
          <div class="event-meta">
            <span class="event-label">${t('field.interval')}</span>
            <span class="event-value" data-index="${index}" data-field="interval" data-unit="s" data-step="0.01">${formatSeconds(intervals[index])}</span>
          </div>
        </li>`;
      }
      if (evt.type === "swipe") {
        return `<li class="event-item" draggable="true" data-index="${index}">
          ${deleteHtml}
          <div class="event-main">
            <span class="tag">${t('evt.swipe')}</span>
            <span class="event-label">${t('field.x1')}</span>
            <span class="event-value" data-index="${index}" data-field="x1" data-step="0.1">${Number(evt.x1 ?? 0).toFixed(1)}</span>
            <span class="event-label">${t('field.y1')}</span>
            <span class="event-value" data-index="${index}" data-field="y1" data-step="0.1">${Number(evt.y1 ?? 0).toFixed(1)}</span>
            <span class="event-label">${t('field.x2')}</span>
            <span class="event-value" data-index="${index}" data-field="x2" data-step="0.1">${Number(evt.x2 ?? 0).toFixed(1)}</span>
            <span class="event-label">${t('field.y2')}</span>
            <span class="event-value" data-index="${index}" data-field="y2" data-step="0.1">${Number(evt.y2 ?? 0).toFixed(1)}</span>
            <span class="event-label">${t('field.duration')}</span>
            <span class="event-value" data-index="${index}" data-field="duration" data-step="0.01">${formatSeconds(evt.duration)}</span>
          </div>
          <div class="event-meta">
            <span class="event-label">${t('field.interval')}</span>
            <span class="event-value" data-index="${index}" data-field="interval" data-unit="s" data-step="0.01">${formatSeconds(intervals[index])}</span>
          </div>
        </li>`;
      }
      if (evt.type === "label") {
        return `<li class="event-item" draggable="true" data-index="${index}">
          ${deleteHtml}
          <div class="event-main">
            <span class="tag">${t('evt.label')}</span>
            <span class="event-value" data-index="${index}" data-field="name">${(evt.name || "").toString().replace(/</g, "&lt;")}</span>
          </div>
          <div class="event-meta">
            <span class="event-label">${t('field.interval')}</span>
            <span class="event-value" data-index="${index}" data-field="interval" data-unit="s" data-step="0.01">${formatSeconds(intervals[index])}</span>
          </div>
        </li>`;
      }
      if (evt.type === "goto") {
        let condDesc = "";
        if (evt.cond) {
          if (evt.cond.type === "repeat") condDesc = t('cond.repeat', { n: Number(evt.cond.times || 0) });
          else if (evt.cond.type === "color") {
            const cx = evt.cond.x != null ? t('cond.coords', { x: Math.round(evt.cond.x), y: Math.round(evt.cond.y) }) : "";
            condDesc = t('cond.colorDesc', { color: String(evt.cond.color || ""), tol: Number(evt.cond.tol || 0), radius: Number(evt.cond.radius || 0), coords: cx });
          }
        }
        return `<li class="event-item" draggable="true" data-index="${index}">
          ${deleteHtml}
          <div class="event-main">
            <span class="tag">${t('evt.goto')}</span>
            <span class="event-value" data-index="${index}" data-field="name">${(evt.name || "").toString().replace(/</g, "&lt;")}</span>
            <span class="cond-desc">${condDesc}</span>
          </div>
          <div class="event-meta">
            <span class="event-label">${t('field.interval')}</span>
            <span class="event-value" data-index="${index}" data-field="interval" data-unit="s" data-step="0.01">${formatSeconds(intervals[index])}</span>
          </div>
        </li>`;
      }
      if (evt.type === "longpress") {
        return `<li class="event-item" draggable="true" data-index="${index}">
          ${deleteHtml}
          <div class="event-main">
            <span class="tag">${t('evt.longpress')}</span>
            <span class="event-label">${t('field.x')}</span>
            <span class="event-value" data-index="${index}" data-field="x" data-step="0.1">${Number(evt.x ?? 0).toFixed(1)}</span>
            <span class="event-label">${t('field.y')}</span>
            <span class="event-value" data-index="${index}" data-field="y" data-step="0.1">${Number(evt.y ?? 0).toFixed(1)}</span>
            <span class="event-label">${t('field.duration')}</span>
            <span class="event-value" data-index="${index}" data-field="duration" data-step="0.01">${formatSeconds(evt.duration)}</span>
          </div>
          <div class="event-meta">
            <span class="event-label">${t('field.interval')}</span>
            <span class="event-value" data-index="${index}" data-field="interval" data-unit="s" data-step="0.01">${formatSeconds(intervals[index])}</span>
          </div>
        </li>`;
      }
      if (evt.type === "wait") {
        return `<li class="event-item" draggable="true" data-index="${index}">
          ${deleteHtml}
          <div class="event-main">
            <span class="tag">${t('evt.wait')}</span>
            <span class="event-label">${t('field.wait_ms')}</span>
            <span class="event-value" data-index="${index}" data-field="interval" data-step="1">${formatSeconds(intervals[index])}</span>
          </div>
          <div class="event-meta">
            <span class="event-label">${t('field.interval')}</span>
            <span class="event-value" data-index="${index}" data-field="interval" data-unit="s" data-step="0.01">${formatSeconds(intervals[index])}</span>
          </div>
        </li>`;
      }
      return `<li><span><span class="tag">EVENT</span> #${index + 1}</span><span>${formatTime(evt.t)}</span></li>`;
    })
    .join("");
  eventListEl.innerHTML = `<ul>${items}</ul>`;
}

function commitEventEdit(inputEl) {
  const index = Number(inputEl.dataset.index);
  const field = inputEl.dataset.field;
  if (!Number.isFinite(index) || !field) return;
  const evt = recordedEvents[index];
  if (!evt) return;
  const rawValueRaw = inputEl.value;
  if (field === "label" || field === "name") {
    evt.name = String(rawValueRaw || "").trim();
  } else {
    const rawValue = Number(rawValueRaw);
    if (!Number.isFinite(rawValue)) return;
    if (field === "interval") {
      // 存储为间隔(ms)
      evt.t = Math.max(0, rawValue * 1000);
    } else if (field === "duration") {
      // inline 编辑的 duration 以秒为单位，存储时转换为 ms
      evt.duration = Math.max(0, Math.round(rawValue * 1000));
    } else {
      evt[field] = rawValue;
    }
  }
  renderEventList();
}

eventListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  // 删除按钮（右上角圆点）
  if (target.classList.contains("evt-del")) {
    const idx = Number(target.dataset.index);
    if (Number.isFinite(idx)) {
      recordedEvents.splice(idx, 1);
      renderEventList();
    }
    return;
  }
  if (!target.classList.contains("event-value")) return;
  if (target.classList.contains("editing")) return;

  const index = target.dataset.index;
  const field = target.dataset.field;
  const step = target.dataset.step || "1";
  if (!index || !field) return;

  const input = document.createElement("input");
  input.dataset.index = index;
  input.dataset.field = field;
  input.className = "event-input-inline";
  if (field === "label" || field === "name") {
    input.type = "text";
    input.value = target.textContent?.trim() || "";
  } else {
    input.type = "number";
    input.step = step;
    input.min = "0";
    input.value = target.textContent?.trim() || "0";
  }

  const finish = (commit) => {
    if (commit) {
      commitEventEdit(input);
    } else {
      renderEventList();
    }
  };

  input.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") finish(true);
    if (evt.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));

  

  target.classList.add("editing");
  target.textContent = "";
  // append input and an explicit inline pick button for coordinate fields
  target.appendChild(input);
  if (["x", "y", "x1", "y1", "x2", "y2"].includes(field)) {
    const pickBtn = document.createElement("button");
    pickBtn.type = "button";
    pickBtn.className = "inline-pick-btn btn";
    pickBtn.textContent = t('btn.pickPoint');
    pickBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      startPointPickForInput(input);
    });
    target.appendChild(pickBtn);
  }
  input.focus();
  input.select();
});

function addCustomEvent() {
  if (!addType) return;
  const type = addType.value;
  const defaultInterval = 500;
  const editIndex = Number(editIndexEl ? editIndexEl.value : -1);
  if (type === "tap") {
    const x = Number(addX.value) || 0;
    const y = Number(addY.value) || 0;
    if (editIndex >= 0 && recordedEvents[editIndex]) {
      recordedEvents[editIndex] = { ...recordedEvents[editIndex], type: "tap", x, y, t: recordedEvents[editIndex].t || defaultInterval };
      addLog(t('log.update.tap', { x: Math.round(x), y: Math.round(y) }));
    } else {
      recordedEvents.push({ type: "tap", x, y, t: defaultInterval });
      addLog(t('log.add.tap', { x: Math.round(x), y: Math.round(y) }));
    }
  } else if (type === "swipe") {
    const x1 = Number(addX.value) || 0;
    const y1 = Number(addY.value) || 0;
    const x2 = Number(addX2.value) || 0;
    const y2 = Number(addY2.value) || 0;
    // modal 输入为秒 -> 存储为 ms
    const durationSec = Number(addDuration.value) || 0.3;
    const duration = Math.max(0, Math.round(durationSec * 1000));
    if (editIndex >= 0 && recordedEvents[editIndex]) {
      recordedEvents[editIndex] = { ...recordedEvents[editIndex], type: "swipe", x1, y1, x2, y2, duration, t: recordedEvents[editIndex].t || defaultInterval };
      addLog(t('log.update.swipe', { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) }));
    } else {
      recordedEvents.push({ type: "swipe", x1, y1, x2, y2, duration, t: defaultInterval });
      addLog(t('log.add.swipe', { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) }));
    }
  } else if (type === "label") {
    const name = String(addLabelName.value || "").trim() || `label${Date.now()}`;
    if (editIndex >= 0 && recordedEvents[editIndex]) {
      recordedEvents[editIndex] = { ...recordedEvents[editIndex], type: "label", name, t: recordedEvents[editIndex].t || defaultInterval };
      addLog(t('log.update.label', { name }));
    } else {
      recordedEvents.push({ type: "label", name, t: defaultInterval });
      addLog(t('log.add.label', { name }));
    }
  } else if (type === "goto") {
    const name = String(addLabelName.value || "").trim() || `label${Date.now()}`;
    const condType = (addCondType && addCondType.value) || "none";
    let cond = null;
    if (condType === "repeat") {
      const times = Math.max(0, Math.floor(Number(addCondTimes.value || 0)));
      cond = { type: "repeat", times };
    } else if (condType === "color") {
      const color = String(addCondColor.value || "").trim();
      const tol = Number(addCondTol.value || 0);
      const radius = Math.max(0, Math.floor(Number(addCondRadius.value || 3)));
      const cx = addCondX && addCondX.value ? Number(addCondX.value) : addCondSampleX;
      const cy = addCondY && addCondY.value ? Number(addCondY.value) : addCondSampleY;
      cond = { type: "color", color, tol, radius, x: Number.isFinite(cx) ? cx : null, y: Number.isFinite(cy) ? cy : null };
    }
    const condText = cond ? t('label.hasCond') : '';
    if (editIndex >= 0 && recordedEvents[editIndex]) {
      recordedEvents[editIndex] = { ...recordedEvents[editIndex], type: "goto", name, t: recordedEvents[editIndex].t || defaultInterval, cond };
      addLog(t('log.update.goto', { name, cond: condText }));
    } else {
      recordedEvents.push({ type: "goto", name, t: defaultInterval, cond });
      addLog(t('log.add.goto', { name, cond: condText }));
    }
  }
  else if (type === "longpress") {
    const x = Number(addX.value) || 0;
    const y = Number(addY.value) || 0;
    const durationSec = Number(addDuration.value) || 0.6;
    const duration = Math.max(0, Math.round(durationSec * 1000));
    if (editIndex >= 0 && recordedEvents[editIndex]) {
      recordedEvents[editIndex] = { ...recordedEvents[editIndex], type: "longpress", x, y, duration, t: recordedEvents[editIndex].t || defaultInterval };
      addLog(t('log.update.longpress', { x: Math.round(x), y: Math.round(y), duration }));
    } else {
      recordedEvents.push({ type: "longpress", x, y, duration, t: defaultInterval });
      addLog(t('log.add.longpress', { x: Math.round(x), y: Math.round(y), duration }));
    }
  }
  else if (type === "wait") {
    // modal 输入为秒（s），内部存储为毫秒（ms）
    const sec = Number(addWaitDuration && addWaitDuration.value ? addWaitDuration.value : 1);
    const dur = Math.max(0, Math.floor(sec * 1000));
    if (editIndex >= 0 && recordedEvents[editIndex]) {
      recordedEvents[editIndex] = { ...recordedEvents[editIndex], type: "wait", t: dur };
      addLog(t('log.update.wait', { dur }));
    } else {
      recordedEvents.push({ type: "wait", t: dur });
      addLog(t('log.add.wait', { dur }));
    }
  }
  renderEventList();
  if (addModal) {
    addModal.setAttribute("aria-hidden", "true");
    // reset edit index and sample coords
    if (editIndexEl) editIndexEl.value = "-1";
    addCondSampleX = null;
    addCondSampleY = null;
    pickActive = false;
    if (addCondPickBtn) addCondPickBtn.classList.remove("active");
  }
}

if (addEventBtn) addEventBtn.addEventListener("click", addCustomEvent);

// modal open/close
if (openAddModalBtn && addModal) {
  openAddModalBtn.addEventListener("click", () => addModal.setAttribute("aria-hidden", "false"));
}
function closeAddModal() {
  if (!addModal) return;
  addModal.setAttribute("aria-hidden", "true");
  if (editIndexEl) editIndexEl.value = "-1";
  pickActive = false;
  addCondSampleX = null;
  addCondSampleY = null;
  if (addCondPickBtn) addCondPickBtn.classList.remove("active");
}
if (closeAddModalBtn && addModal) {
  closeAddModalBtn.addEventListener("click", closeAddModal);
}
if (addModal) {
  addModal.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal-backdrop")) {
      addModal.setAttribute("aria-hidden", "true");
    }
  });
}

// Modal 表单按类型显示不同字段
function updateAddModalFields() {
  if (!addModal) return;
  const typeEl = document.getElementById("addType");
  if (!typeEl) return;
  const val = typeEl.value;
  const groups = addModal.querySelectorAll('.modal-group');
  groups.forEach((g) => {
    const forAttr = (g.dataset.for || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (forAttr.length === 0) {
      g.style.display = "none";
      return;
    }
    g.style.display = forAttr.includes(val) ? "flex" : "none";
  });

  // 显示/隐藏 goto 的内部条件控件（repeat / color）
  const condEl = document.getElementById("addCondType");
  if (condEl) {
    const cval = condEl.value;
    addModal.querySelectorAll('.cond-repeat').forEach((n) => (n.style.display = cval === 'repeat' ? 'inline-flex' : 'none'));
    addModal.querySelectorAll('.cond-color').forEach((n) => (n.style.display = cval === 'color' ? 'flex' : 'none'));
  }
}

// 初始化并监听类型变化
const typeEl = document.getElementById("addType");
if (typeEl) {
  typeEl.addEventListener("change", updateAddModalFields);
}
if (addCondType) {
  addCondType.addEventListener("change", updateAddModalFields);
}
if (openAddModalBtn) {
  openAddModalBtn.addEventListener("click", () => {
    if (addModal) addModal.setAttribute("aria-hidden", "false");
    // 确保显示正确字段
    setTimeout(updateAddModalFields, 0);
  });
}

    function openEditModal(index) {
      const evt = recordedEvents[index];
      if (!evt) return;
      if (!addModal) return;
      // set type
      const typeEl = document.getElementById("addType");
      if (typeEl) typeEl.value = evt.type === "goto" ? "goto" : evt.type === "label" ? "label" : evt.type;
      // fill fields
      if (evt.type === "tap") {
        addX.value = Math.round(evt.x || 0);
        addY.value = Math.round(evt.y || 0);
      } else if (evt.type === "swipe") {
        addX.value = Math.round(evt.x1 || 0);
        addY.value = Math.round(evt.y1 || 0);
        addX2.value = Math.round(evt.x2 || 0);
        addY2.value = Math.round(evt.y2 || 0);
        // duration 存为 ms，modal 显示为秒
        if (addDuration) addDuration.value = ((Number(evt.duration) || 300) / 1000).toFixed(2);
      }
      if (evt.type === "label" || evt.type === "goto") {
        addLabelName.value = String(evt.name || "");
      }
      if (evt.type === "wait") {
        if (addWaitDuration) addWaitDuration.value = ((Number(evt.t) || 0) / 1000).toFixed(2);
      }
      // cond
      if (evt.cond) {
        addCondType.value = evt.cond.type || "none";
        if (evt.cond.type === "repeat") {
          addCondTimes.value = Number(evt.cond.times || 1);
        } else if (evt.cond.type === "color") {
          addCondColor.value = String(evt.cond.color || "");
          addCondTol.value = Number(evt.cond.tol || 0);
          addCondRadius.value = Number(evt.cond.radius || 0);
          addCondSampleX = Number(evt.cond.x ?? evt.cond.cx ?? null);
          addCondSampleY = Number(evt.cond.y ?? evt.cond.cy ?? null);
          if (addCondX) addCondX.value = addCondSampleX != null ? String(Math.round(addCondSampleX)) : "";
          if (addCondY) addCondY.value = addCondSampleY != null ? String(Math.round(addCondSampleY)) : "";
          if (addCondColorPreview) addCondColorPreview.style.background = addCondColor.value || "transparent";
        }
      } else {
        addCondType.value = "none";
      }
      // mark edit index
      editIndexEl.value = String(index);
      addModal.setAttribute("aria-hidden", "false");
      setTimeout(updateAddModalFields, 0);
    }

    // dblclick 打开编辑 modal
    eventListEl.addEventListener("dblclick", (e) => {
      const li = e.target.closest && e.target.closest("li.event-item");
      if (!li) return;
      const idx = Number(li.dataset.index);
      if (!Number.isFinite(idx)) return;
      openEditModal(idx);
    });

if (addCondPickBtn) {
  addCondPickBtn.addEventListener("click", () => {
    // 开始取色时隐藏 modal（不重置编辑索引），等待画面点击采样；取消取色则重新打开 modal
    if (!pickActive) {
        pickActive = true;
        if (addModal) addModal.setAttribute("aria-hidden", "true");
        if (cursorInfoEl) {
          cursorInfoEl.innerHTML = `<div>${t('picker.infoColor')}</div>`;
          cursorInfoEl.classList.remove("hidden");
          cursorInfoEl.setAttribute("aria-hidden", "false");
        }
        if (addCondPickBtn) addCondPickBtn.textContent = t('picker.cancel');
      } else {
        pickActive = false;
        addCondPickBtn.classList.remove("active");
        addCondPickBtn.textContent = t('picker.pick');
        if (addModal) {
          addModal.setAttribute("aria-hidden", "false");
          setTimeout(updateAddModalFields, 0);
        }
        if (cursorInfoEl) {
          cursorInfoEl.classList.add("hidden");
          cursorInfoEl.setAttribute("aria-hidden", "true");
        }
      }
  });
}

// modal coordinate pick buttons (explicit trigger)
const addCoordPickBtn = document.getElementById("addCoordPickBtn");
if (addCoordPickBtn) addCoordPickBtn.addEventListener("click", () => startPointPickForModalField("addX"));
const addCoordPickBtn2 = document.getElementById("addCoordPickBtn2");
if (addCoordPickBtn2) addCoordPickBtn2.addEventListener("click", () => startPointPickForModalField("addX2"));
if (addCondColor) {
  addCondColor.addEventListener("input", () => {
    if (addCondColorPreview) addCondColorPreview.style.background = addCondColor.value || "transparent";
  });
}

// 鼠标在画面上移动时显示坐标与取色（实时）
if (cursorInfoEl && screenEl) {
  const showCursorInfo = (clientX, clientY, text, color) => {
    cursorInfoEl.style.left = `${clientX + 12}px`;
    cursorInfoEl.style.top = `${clientY + 12}px`;
    cursorInfoEl.innerHTML = `<div>${text}</div><div style="margin-top:4px;color:${color};">${color}</div>`;
    cursorInfoEl.classList.remove("hidden");
    cursorInfoEl.setAttribute("aria-hidden", "false");
  };
  const hideCursorInfo = () => {
    cursorInfoEl.classList.add("hidden");
    cursorInfoEl.setAttribute("aria-hidden", "true");
  };

  screenEl.addEventListener("pointermove", (ev) => {
    const rect = screenEl.getBoundingClientRect();
    const px = ev.clientX;
    const py = ev.clientY;
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) {
      hideCursorInfo();
      return;
    }
    const p = mapPoint(ev);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const hex = sampleAverageColor(p.x, p.y, 1);
    // only show cursor info while picking or when ctrl pressed
    if (pickActive || ev.ctrlKey) {
      showCursorInfo(ev.clientX, ev.clientY, `x:${x} y:${y}`, hex);
    } else {
      hideCursorInfo();
    }
  });
  screenEl.addEventListener("pointerleave", hideCursorInfo);
  screenEl.addEventListener("pointerout", hideCursorInfo);
}

// allow Esc to cancel pick
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pickActive) {
    pickActive = false;
    pickTarget = null;
    if (addModal && pickReturnModal) {
      addModal.setAttribute("aria-hidden", "false");
      setTimeout(updateAddModalFields, 0);
    }
    pickReturnModal = false;
    if (cursorInfoEl) {
      cursorInfoEl.classList.add("hidden");
      cursorInfoEl.setAttribute("aria-hidden", "true");
    }
  }
});

function gotoTag(name) {
  if (!name) return;
  const idx = recordedEvents.findIndex((e) => e && e.type === "label" && e.name === name);
  if (idx === -1) {
    addLog(t('log.tagNotFound', { name }));
    return;
  }
  const slice = recordedEvents.slice(idx).map((e) => ({ ...e }));
  startPlayback(slice, { markButton: true, logEvents: true, onDone: () => addLog(t('log.playFromTagDone', { name })) });
  addLog(t('log.playFromTagStart', { name }));
}

// goto input/button removed; use modal to add goto events

// modal open/close (已有声明 earlier)
if (openAddModalBtn && addModal) {
  openAddModalBtn.addEventListener("click", () => addModal.setAttribute("aria-hidden", "false"));
}
if (closeAddModalBtn && addModal) {
  closeAddModalBtn.addEventListener("click", closeAddModal);
}
if (addModal) {
  addModal.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal-backdrop")) {
      closeAddModal();
    }
  });
}

// 拖拽重排支持（委托）
eventListEl.addEventListener("dragstart", (e) => {
  const li = e.target.closest && e.target.closest("li");
  if (!li) return;
  e.dataTransfer.setData("text/plain", String(li.dataset.index));
  li.classList.add("dragging");
});
eventListEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  const li = e.target.closest && e.target.closest("li");
  eventListEl.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
  if (li) li.classList.add("drag-over");
});
eventListEl.addEventListener("dragleave", (e) => {
  const li = e.target.closest && e.target.closest("li");
  if (li) li.classList.remove("drag-over");
});
eventListEl.addEventListener("drop", (e) => {
  e.preventDefault();
  const from = Number(e.dataTransfer.getData("text/plain"));
  const li = e.target.closest && e.target.closest("li");
  const to = li ? Number(li.dataset.index) : recordedEvents.length - 1;
  if (Number.isFinite(from) && Number.isFinite(to) && from !== to) {
    const item = recordedEvents.splice(from, 1)[0];
    recordedEvents.splice(to, 0, item);
    renderEventList();
  }
  eventListEl.querySelectorAll(".dragging").forEach((n) => n.classList.remove("dragging"));
  eventListEl.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
});

function renderLogList() {
  if (!logs.length) {
    logListEl.innerHTML = `<div class="empty">${t('empty.logs')}</div>`;
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
  const scaleX = screenEl.width / rect.width;
  const scaleY = screenEl.height / rect.height;
  return {
    x: clickX * scaleX,
    y: clickY * scaleY,
  };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sampleAverageColor(cx, cy, radius) {
  radius = Math.max(0, Math.floor(radius || 3));
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const w = Math.min(screenEl.width - x0, radius * 2 + 1);
  const h = Math.min(screenEl.height - y0, radius * 2 + 1);
  if (w <= 0 || h <= 0) return "#000000";
  try {
    const data = screenCtx.getImageData(x0, y0, w, h).data;
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
    if (count === 0) return "#000000";
    return rgbToHex(r / count, g / count, b / count);
  } catch (err) {
    return "#000000";
  }
}

// 在可用的情况下，优先使用给定坐标(x,y)采样，否则使用屏幕中心
function sampleAtCond(cond) {
  if (!cond) return "#000000";
  const cx = Number(cond.x) >= 0 && Number(cond.x) <= screenEl.width ? Number(cond.x) : Math.floor((screenEl.width || 0) / 2);
  const cy = Number(cond.y) >= 0 && Number(cond.y) <= screenEl.height ? Number(cond.y) : Math.floor((screenEl.height || 0) / 2);
  const radius = Math.max(0, Math.floor(Number(cond.radius || 3)));
  return sampleAverageColor(cx, cy, radius);
}

function startPointPickForInput(inputEl) {
  if (!inputEl) return;
  pickActive = true;
  pickTarget = { mode: "inline", input: inputEl };
  // if modal is open, hide it and remember to reopen
  if (addModal && addModal.getAttribute("aria-hidden") === "false") {
    pickReturnModal = true;
    addModal.setAttribute("aria-hidden", "true");
  } else {
    pickReturnModal = false;
  }
  if (cursorInfoEl) {
    cursorInfoEl.innerHTML = `<div>${t('picker.infoPoint')}</div>`;
    cursorInfoEl.classList.remove("hidden");
    cursorInfoEl.setAttribute("aria-hidden", "false");
  }
}

function startPointPickForModalField(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  pickActive = true;
  pickTarget = { mode: "modal", inputId: fieldId };
  if (addModal && addModal.getAttribute("aria-hidden") === "false") {
    pickReturnModal = true;
    addModal.setAttribute("aria-hidden", "true");
  } else {
    pickReturnModal = false;
  }
  if (cursorInfoEl) {
    cursorInfoEl.innerHTML = `<div>${t('picker.infoPoint')}</div>`;
    cursorInfoEl.classList.remove("hidden");
    cursorInfoEl.setAttribute("aria-hidden", "false");
  }
}

function hexToRgb(hex) {
  if (!hex) return null;
  const m = hex.replace("#", "").trim();
  if (m.length === 3) {
    const r = parseInt(m[0] + m[0], 16);
    const g = parseInt(m[1] + m[1], 16);
    const b = parseInt(m[2] + m[2], 16);
    return { r, g, b };
  }
  if (m.length === 6) {
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function colorDistanceHex(aHex, bHex) {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  if (!a || !b) return Infinity;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

screenEl.addEventListener("pointerdown", (event) => {
  if (!screenEl.width || !screenEl.height) return;
  // if in pick mode, handle different pick targets
  if (pickActive) {
    const { x, y } = mapPoint(event);
    // color pick for goto condition
    if (pickTarget == null && addCondRadius) {
      // default legacy color pick path (when user clicked the color pick button)
      const radius = Number(addCondRadius.value || 3);
      const hex = sampleAverageColor(x, y, radius);
      if (addCondColor) addCondColor.value = hex;
      if (addCondColorPreview) addCondColorPreview.style.background = hex;
      pickActive = false;
      addCondSampleX = x;
      addCondSampleY = y;
      if (addCondX) addCondX.value = Math.round(x);
      if (addCondY) addCondY.value = Math.round(y);
      if (addCondPickBtn) addCondPickBtn.classList.remove("active");
      addLog(t('log.colorSampled', { hex }));
      // return to modal
      if (addModal && pickReturnModal) {
        addModal.setAttribute("aria-hidden", "false");
        setTimeout(() => {
          updateAddModalFields();
          if (addCondColor) addCondColor.focus();
        }, 0);
      }
      if (cursorInfoEl) {
        cursorInfoEl.classList.add("hidden");
        cursorInfoEl.setAttribute("aria-hidden", "true");
      }
      event.preventDefault();
      pickTarget = null;
      pickReturnModal = false;
      return;
    }

    // generic point pick target (modal or inline)
    if (pickTarget) {
      if (pickTarget.mode === "modal") {
        const id = pickTarget.inputId;
        const rx = Math.round(x);
        const ry = Math.round(y);
        if (id === "addX") {
          if (addX) addX.value = rx;
          if (addY) addY.value = ry;
        } else if (id === "addX2") {
          if (addX2) addX2.value = rx;
          if (addY2) addY2.value = ry;
        }
        addLog(t('log.coordSampled', { x: rx, y: ry }));
        pickActive = false;
        if (cursorInfoEl) {
          cursorInfoEl.classList.add("hidden");
          cursorInfoEl.setAttribute("aria-hidden", "true");
        }
        if (addModal && pickReturnModal) {
          addModal.setAttribute("aria-hidden", "false");
          setTimeout(updateAddModalFields, 0);
        }
        pickTarget = null;
        pickReturnModal = false;
        event.preventDefault();
        return;
      } else if (pickTarget.mode === "inline") {
        const inputEl = pickTarget.input;
        const idx = Number(inputEl.dataset.index);
        const field = inputEl.dataset.field;
        const rx = Math.round(x);
        const ry = Math.round(y);
        // try to set both coords on the event if possible
        const evt = recordedEvents[idx];
        if (evt) {
          if (field === "x" || field === "y") {
            evt.x = rx;
            evt.y = ry;
          } else if (field === "x1" || field === "y1") {
            evt.x1 = rx;
            evt.y1 = ry;
          } else if (field === "x2" || field === "y2") {
            evt.x2 = rx;
            evt.y2 = ry;
          }
          renderEventList();
          addLog(t('log.coordSampled', { x: rx, y: ry }));
        }
        pickActive = false;
        if (cursorInfoEl) {
          cursorInfoEl.classList.add("hidden");
          cursorInfoEl.setAttribute("aria-hidden", "true");
        }
        pickTarget = null;
        pickReturnModal = false;
        event.preventDefault();
        return;
      }
    }
  }
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
  if (!screenEl.width || !screenEl.height) return;
  if (!dragStart) return;
  event.preventDefault();

  const point = dragLast || mapPoint(event);
  const { x, y } = point;
  const dx = x - dragStart.x;
  const dy = y - dragStart.y;
  const distance = Math.hypot(dx, dy);
  const duration = Math.min(800, Math.max(80, performance.now() - lastDragTime));

  if (!dragMoved || distance < 6) {
    const holdTime = performance.now() - lastDragTime;
    if (holdTime >= LONGPRESS_THRESHOLD) {
      // 长按
      const dur = Math.round(holdTime);
      sendLongPress(dragStart.x, dragStart.y, dur);
      recordEvent({ type: "longpress", x: dragStart.x, y: dragStart.y, duration: dur });
      addLog(t('log.exec.longpress', { x: Math.round(dragStart.x), y: Math.round(dragStart.y), duration: dur }));
    } else {
      sendTap(dragStart.x, dragStart.y);
      recordEvent({ type: "tap", x: dragStart.x, y: dragStart.y });
      addLog(t('log.exec.tap', { x: Math.round(dragStart.x), y: Math.round(dragStart.y) }));
    }
  } else {
    sendSwipe(dragStart.x, dragStart.y, x, y, duration);
    recordEvent({ type: "swipe", x1: dragStart.x, y1: dragStart.y, x2: x, y2: y, duration });
    addLog(t('log.exec.swipe', { x1: Math.round(dragStart.x), y1: Math.round(dragStart.y), x2: Math.round(x), y2: Math.round(y) }));
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
    recordBtn.textContent = t('btn.record.stop');
    recordBtn.classList.add("active");
    pauseBtn.disabled = false;
    pauseBtn.textContent = t('btn.pause');
    pauseBtn.classList.remove("active");
    renderEventList();
    addLog(t('log.startRecord'));
  } else {
    isRecording = false;
    isPaused = false;
    recordBtn.textContent = t('btn.record.start');
    recordBtn.classList.remove("active");
    pauseBtn.disabled = true;
    pauseBtn.textContent = t('btn.pause');
    pauseBtn.classList.remove("active");
    addLog(t('log.stopRecord'));
  }
});

pauseBtn.addEventListener("click", () => {
  if (!isRecording) return;
  isPaused = !isPaused;
  if (isPaused) {
    pauseBtn.textContent = t('btn.resume');
    pauseBtn.classList.add("active");
    addLog(t('log.pauseRecord'));
  } else {
    pauseBtn.textContent = t('btn.pause');
    pauseBtn.classList.remove("active");
    addLog(t('log.resumeRecord'));
  }
});

playBtn.addEventListener("click", () => {
  if (isPlaying) {
    stopPlayback();
    addLog(t('log.stopPlayback'));
    return;
  }
  if (!recordedEvents.length) return;

  startPlayback(recordedEvents, {
    markButton: true,
    logEvents: true,
    onDone: () => {
      addLog(t('log.playbackDone'));
    },
  });
  addLog(t('log.startPlayback'));
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
    // 支持两种格式：
    // - 旧格式：t 为录制时的绝对时间（单调递增）
    // - 新格式：t 为间隔(ms)
    let parsed = events.map((e) => ({ ...e }));
    if (parsed.length && parsed.every((e, i) => i === 0 || Number(e.t) >= Number(parsed[i - 1].t))) {
      // 看起来是单调递增，视为旧格式，转换为间隔
      parsed = parsed.map((e, i, arr) => ({ ...e, t: i === 0 ? Number(e.t || 0) : Math.max(0, Number(e.t || 0) - Number(arr[i - 1].t || 0)) }));
    }
    recordedEvents = parsed.filter((e) => e && (e.type === "tap" || e.type === "swipe" || e.type === "label" || e.type === "goto" || e.type === "wait" || e.type === "longpress"));
    renderEventList();
    addLog(t('log.loadedJson'));
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
        addLog(t('log.scheduledRoundComplete'));
      scheduleTimerId = setTimeout(runScheduledLoop, interval);
    },
  });
    addLog(t('log.scheduledStart'));
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
  addLog(t('log.scheduledStart'));
});

stopScheduleBtn.addEventListener("click", () => {
  clearSchedule();
  if (isPlaying) {
    stopPlayback({ keepButton: true });
  }
  addLog(t('log.scheduledStopped'));
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
