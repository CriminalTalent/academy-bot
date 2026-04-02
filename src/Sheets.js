// ============================================================
// sheets.js — Google Sheets API 연동 핵심 모듈
// ============================================================
import { google } from "googleapis";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const KEY_PATH       = process.env.GOOGLE_KEY_PATH ?? "./google-key.json";

const SHEET = {
  PLAYERS: "Players",
  ACTIONS: "Actions",
  ITEMS:   "Items",
};

// -- 인증 및 클라이언트 ------------------------------------------
let _sheets = null;

async function getClient() {
  if (_sheets) return _sheets;

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes:  ["https://www.googleapis.com/auth/spreadsheets"],
  });

  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

// -- 범위 읽기 ---------------------------------------------------
async function readRange(range) {
  const sheets = await getClient();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return res.data.values ?? [];
}

// -- 범위 쓰기 ---------------------------------------------------
async function writeRange(range, values) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId:     SPREADSHEET_ID,
    range,
    valueInputOption:  "RAW",
    requestBody:       { values },
  });
}

// -- 행 추가 -----------------------------------------------------
async function appendRow(sheetName, values) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId:     SPREADSHEET_ID,
    range:             `${sheetName}!A1`,
    valueInputOption:  "RAW",
    insertDataOption:  "INSERT_ROWS",
    requestBody:       { values: [values] },
  });
}

// ================================================================
// Actions 시트
// ================================================================
// 헤더: 행동명 | 카테고리 | 최소나이 | 골드 | 지능 | 매력 | 체력 | 감성 | 사회성
//       도덕성 | 야망 | 위험도 | 의존성 | 스트레스 | 평판 | 전투

const STAT_COLS = ["지능", "매력", "체력", "감성", "사회성",
                   "도덕성", "야망", "위험도", "의존성", "스트레스", "평판", "전투"];

const ACTIONS_HEADER = ["행동명", "카테고리", "최소나이", "골드", ...STAT_COLS];

// 캐시 (5분)
let _actionsCache    = null;
let _actionsCacheAt  = 0;
const CACHE_TTL      = 5 * 60 * 1000;

export async function getActions() {
  if (_actionsCache && Date.now() - _actionsCacheAt < CACHE_TTL) {
    return _actionsCache;
  }

  const rows = await readRange(`${SHEET.ACTIONS}!A2:P`);
  const result = {};

  for (const row of rows) {
    if (!row[0]) continue;
    const [name, category, minAge, gold, ...statVals] = row;
    const effects = {};
    STAT_COLS.forEach((stat, i) => {
      const v = Number(statVals[i] ?? 0);
      if (v !== 0) effects[stat] = v;
    });

    result[name] = {
      category,
      minAge:  Number(minAge ?? 0),
      gold:    Number(gold ?? 0),
      effects,
    };
  }

  _actionsCache   = result;
  _actionsCacheAt = Date.now();
  return result;
}

export function clearActionsCache() {
  _actionsCache = null;
}

// ================================================================
// Items 시트
// ================================================================
// 헤더: 아이템명 | 상점 | 가격 | 판매비율 | 슬롯 | 최소나이
//       지능 | 매력 | 체력 | 감성 | 사회성 | 전투 | 평판 | 스트레스 | 위험도 | 설명

const ITEM_STAT_COLS  = ["지능", "매력", "체력", "감성", "사회성", "전투", "평판", "스트레스", "위험도"];

let _itemsCache   = null;
let _itemsCacheAt = 0;

export async function getItems() {
  if (_itemsCache && Date.now() - _itemsCacheAt < CACHE_TTL) {
    return _itemsCache;
  }

  const rows   = await readRange(`${SHEET.ITEMS}!A2:Q`);
  const result = {};

  for (const row of rows) {
    if (!row[0]) continue;
    const [name, shop, price, sellRate, slot, minAge, ...statVals] = row;
    const desc     = row[15] ?? "";
    const effects  = {};

    ITEM_STAT_COLS.forEach((stat, i) => {
      const v = Number(statVals[i] ?? 0);
      if (v !== 0) effects[stat] = v;
    });

    result[name] = {
      shop,
      price:    Number(price  ?? 0),
      sellRate: Number(sellRate ?? 0.5),
      slot,                          // weapon / clothing / none
      minAge:   Number(minAge ?? 0),
      effects,                       // 장착 또는 소모 효과 통합
      desc,
    };
  }

  _itemsCache   = result;
  _itemsCacheAt = Date.now();
  return result;
}

export function clearItemsCache() {
  _itemsCache = null;
}

// ================================================================
// Players 시트
// ================================================================
// 헤더: accountId | name | 지능 | 매력 | 체력 | 감성 | 사회성
//       도덕성 | 야망 | 위험도 | 의존성 | 스트레스 | 평판 | 전투
//       골드 | 턴 | 인벤토리 | 장착

const PUBLIC_STATS  = ["지능", "매력", "체력", "감성", "사회성"];
const HIDDEN_STATS  = ["도덕성", "야망", "위험도", "의존성", "스트레스", "평판", "전투"];
const ALL_STATS     = [...PUBLIC_STATS, ...HIDDEN_STATS];

// 헤더 행 인덱스 매핑
const COL = {
  accountId: 0,
  name:      1,
  // stats: 2~8 (PUBLIC), 9~15 (HIDDEN)
  gold:      16,
  turn:      17,
  inventory: 18,
  equipped:  19,
};

function rowToPlayer(row) {
  const stats  = {};
  const hidden = {};
  PUBLIC_STATS.forEach((s, i) => { stats[s]  = Number(row[2 + i] ?? 20); });
  HIDDEN_STATS.forEach((s, i) => { hidden[s] = Number(row[7 + i] ?? 0); });

  let inventory = [];
  let equipped  = {};
  try { inventory = JSON.parse(row[COL.inventory] || "[]"); } catch { inventory = []; }
  try { equipped  = JSON.parse(row[COL.equipped]  || "{}"); } catch { equipped  = {}; }

  return {
    accountId: row[COL.accountId],
    name:      row[COL.name],
    stats,
    hidden,
    gold:      Number(row[COL.gold] ?? 500),
    turn:      Number(row[COL.turn] ?? 1),
    inventory,
    equipped,
  };
}

function playerToRow(player) {
  const statVals   = PUBLIC_STATS.map((s) => player.stats[s]  ?? 0);
  const hiddenVals = HIDDEN_STATS.map((s) => player.hidden[s] ?? 0);
  return [
    player.accountId,
    player.name,
    ...statVals,
    ...hiddenVals,
    player.gold,
    player.turn,
    JSON.stringify(player.inventory ?? []),
    JSON.stringify(player.equipped  ?? {}),
  ];
}

// 전체 플레이어 로드 (헤더 제외 전 행)
export async function sheetGetAllPlayers() {
  const rows = await readRange(`${SHEET.PLAYERS}!A2:T`);
  return rows.filter((r) => r[0]).map(rowToPlayer);
}

// 단일 플레이어 조회 (없으면 생성)
export async function sheetGetPlayer(accountId, displayName) {
  const rows = await readRange(`${SHEET.PLAYERS}!A2:T`);
  const idx  = rows.findIndex((r) => r[0] === accountId);

  if (idx === -1) {
    // 신규 생성
    const newPlayer = makeDefaultPlayer(accountId, displayName);
    await appendRow(SHEET.PLAYERS, playerToRow(newPlayer));
    return newPlayer;
  }

  return rowToPlayer(rows[idx]);
}

// 플레이어 저장 (이미 존재하면 해당 행 업데이트)
export async function sheetUpdatePlayer(player) {
  const rows = await readRange(`${SHEET.PLAYERS}!A2:T`);
  const idx  = rows.findIndex((r) => r[0] === player.accountId);

  if (idx === -1) {
    await appendRow(SHEET.PLAYERS, playerToRow(player));
  } else {
    const rowNum = idx + 2; // 헤더(1) + 0-index 보정
    await writeRange(`${SHEET.PLAYERS}!A${rowNum}:T${rowNum}`, [playerToRow(player)]);
  }
}

function makeDefaultPlayer(accountId, name) {
  return {
    accountId,
    name,
    stats:     { 지능: 20, 매력: 20, 체력: 20, 감성: 20, 사회성: 20 },
    hidden:    { 도덕성: 50, 야망: 10, 위험도: 0, 의존성: 0, 스트레스: 10, 평판: 20, 전투: 0 },
    gold:      Number(process.env.INITIAL_GOLD ?? 500),
    turn:      1,
    inventory: [],
    equipped:  {},
  };
}


// ================================================================
// Monsters 시트
// ================================================================
// 헤더: 마물명 | 장소 | 최소나이 | HP | 공격력 | 방어력 | 골드최소 | 골드최대 | 설명

let _monstersCache   = null;
let _monstersCacheAt = 0;

export async function getMonsters() {
  if (_monstersCache && Date.now() - _monstersCacheAt < CACHE_TTL) {
    return _monstersCache;
  }

  // 헤더: 마물명 | 장소 | 종류 | 최소나이 | HP | 공격력 | 방어력 | 골드최소 | 골드최대 | 대화텍스트 | 설명
  // 종류: monster | boss | villager
  const rows   = await readRange("Monsters!A2:K");
  const result = {};

  for (const row of rows) {
    if (!row[0]) continue;
    const [name, location, type, minAge, hp, attack, defense, goldMin, goldMax, dialogue, desc] = row;
    result[name] = {
      name,
      location,
      type:     type     ?? "monster",
      minAge:   Number(minAge  ?? 0),
      hp:       Number(hp      ?? 10),
      maxHp:    Number(hp      ?? 10),
      attack:   Number(attack  ?? 3),
      defense:  Number(defense ?? 1),
      goldMin:  Number(goldMin ?? 10),
      goldMax:  Number(goldMax ?? 30),
      dialogue: dialogue ?? "",
      desc:     desc     ?? "",
    };
  }

  _monstersCache   = result;
  _monstersCacheAt = Date.now();
  return result;
}

// 장소별 마물 목록 반환
export async function getMonstersByLocation(location) {
  const monsters = await getMonsters();
  return Object.entries(monsters)
    .filter(([, m]) => m.location === location)
    .map(([name, m]) => ({ name, ...m }));
}

// 장소 목록 (중복 제거)
export async function getLocations(age) {
  const monsters = await getMonsters();
  const locs = new Set();
  for (const m of Object.values(monsters)) {
    if (age >= m.minAge) locs.add(m.location);
  }
  return [...locs];
}
