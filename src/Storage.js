// ============================================================
// storage.js — 플레이어 데이터 (Google Sheets 기반)
//              히스토리만 로컬 JSON에 저장
// ============================================================
import fs   from "fs";
import path from "path";
import {
  sheetGetPlayer,
  sheetUpdatePlayer,
  sheetGetAllPlayers,
} from "./sheets.js";

const HISTORY_PATH = process.env.HISTORY_PATH ?? "./data/history.json";
const MAX_TURNS    = Number(process.env.MAX_TURNS ?? 24);

// -- 히스토리 로컬 저장 -------------------------------------------
function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadHistory() {
  ensureDir(HISTORY_PATH);
  if (!fs.existsSync(HISTORY_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8")); }
  catch { return {}; }
}

function saveHistory(data) {
  ensureDir(HISTORY_PATH);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function getPlayerHistory(accountId) {
  return loadHistory()[accountId] ?? [];
}

function appendHistory(accountId, entry) {
  const data          = loadHistory();
  data[accountId]     = [...(data[accountId] ?? []), entry];
  saveHistory(data);
}

// -- 플레이어 조회 / 생성 -----------------------------------------
export async function getPlayer(accountId, displayName) {
  const player  = await sheetGetPlayer(accountId, displayName);
  player.history = getPlayerHistory(accountId);
  return player;
}

// -- 플레이어 저장 ------------------------------------------------
export async function updatePlayer(player) {
  const { history, ...sheetData } = player;
  await sheetUpdatePlayer(sheetData);
}

// -- 전체 플레이어 조회 -------------------------------------------
export async function getAllPlayers() {
  const players = await sheetGetAllPlayers();
  return players.map((p) => ({ ...p, history: getPlayerHistory(p.accountId) }));
}

// -- 턴 즉시 처리 -------------------------------------------------
export async function processPlayer(accountId, applyFn) {
  const player  = await getPlayer(accountId, "");
  if (!player)  return null;

  const updated = await applyFn(player);

  // 히스토리는 로컬에만
  const lastEntry = updated.history.at(-1);
  if (lastEntry) appendHistory(accountId, lastEntry);

  // 시트에는 히스토리 제외
  const { history, ...sheetData } = updated;
  await sheetUpdatePlayer(sheetData);

  return updated;
}

// -- 이미 이번 턴을 제출했는지 확인 --------------------------------
export async function hasSubmittedThisTurn(accountId, displayName) {
  const player = await getPlayer(accountId, displayName);
  const last   = player.history.at(-1);
  return last?.turn === player.turn;
}

// -- 커뮤니티 종료 여부 확인 ---------------------------------------
export async function isEnded(accountId, displayName) {
  const player = await getPlayer(accountId, displayName);
  return player.turn > MAX_TURNS;
}
