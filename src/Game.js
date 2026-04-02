// ============================================================
// game.js — 수치 계산 / 단어 조합 판정
// ============================================================
import { getActions } from "./sheets.js";

export const PUBLIC_STATS = ["지능", "매력", "체력", "감성", "사회성"];
export const HIDDEN_STATS = ["도덕성", "야망", "위험도", "의존성", "스트레스", "평판", "전투"];

// -- 나잇대 계산 --------------------------------------------------
export function getAge(turn) {
  if (turn <= 8)  return 8  + Math.floor((turn - 1) / 2);
  if (turn <= 16) return 12 + Math.floor((turn - 9) / 2);
  return 16 + Math.floor((turn - 17) / 2);
}

export function getPhase(turn) {
  if (turn <= 8)  return "초기 성장기";
  if (turn <= 16) return "확장 단계";
  return "완성 단계";
}

// -- 유효성 검사 --------------------------------------------------
export async function validateSchedule(actions, age) {
  const ACTIONS = await getActions();
  const errors  = [];

  if (actions.length !== 3) {
    errors.push("행동은 정확히 3개여야 합니다");
    return errors;
  }

  const adventureCount = actions.filter((a) => a === "무사수행").length;
  if (adventureCount > 1) {
    errors.push("무사수행은 턴당 1회만 선택할 수 있습니다");
  }

  for (const name of actions) {
    const action = ACTIONS[name];
    if (!action) {
      errors.push(`'${name}'은(는) 없는 행동입니다`);
      continue;
    }
    if (age < action.minAge) {
      errors.push(`'${name}'은(는) ${action.minAge}세 이상만 선택할 수 있습니다`);
    }
  }

  return errors;
}

// -- 행동 적용 ----------------------------------------------------
export async function applyActions(player, actions) {
  const ACTIONS = await getActions();
  const stats   = { ...player.stats };
  const hidden  = { ...player.hidden };
  let   gold    = player.gold;
  const log     = [];

  const counts = {};
  for (const name of actions) counts[name] = (counts[name] ?? 0) + 1;

  for (const name of actions) {
    if (name === "무사수행") {
      log.push({ action: name, changes: [], goldDelta: 0, note: "무사수행 봇에서 진행" });
      continue;
    }

    const action = ACTIONS[name];
    if (!action) continue;

    const penalty   = counts[name] > 1 ? 0.5 : 1;
    const changes   = [];
    const goldDelta = Math.round(action.gold * penalty);
    gold = Math.max(0, gold + goldDelta);

    for (const [stat, delta] of Object.entries(action.effects)) {
      const adjusted = Math.round(delta * penalty);
      if (adjusted === 0) continue;

      if (PUBLIC_STATS.includes(stat)) {
        stats[stat] = clamp(stats[stat] + adjusted, 0, 100);
        changes.push(`${stat}${adjusted > 0 ? "+" : ""}${adjusted}`);
      } else {
        hidden[stat] = clamp(hidden[stat] + adjusted, 0, 100);
      }
    }

    log.push({
      action:    name,
      changes,
      goldDelta,
      note:      counts[name] > 1 ? "반복 페널티 적용" : "",
    });
  }

  return {
    ...player,
    stats,
    hidden,
    gold,
    turn:    player.turn + 1,
    history: [...(player.history ?? []), { turn: player.turn, actions, log }],
  };
}

function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, v));
}

// -- 단어 조합 판정표 ---------------------------------------------
const DESCRIPTORS = {
  지능: [
    { max: 15,       word: "무지한" },
    { max: 30,       word: "평범한" },
    { max: 50,       word: "총명한" },
    { max: 70,       word: "박식한" },
    { max: 85,       word: "현명한" },
    { max: Infinity, word: "천재적인" },
  ],
  매력: [
    { max: 15,       word: "눈에 띄지 않는" },
    { max: 30,       word: "평범한" },
    { max: 50,       word: "친근한" },
    { max: 70,       word: "매혹적인" },
    { max: 85,       word: "우아한" },
    { max: Infinity, word: "전설적인" },
  ],
  체력: [
    { max: 15,       word: "허약한" },
    { max: 30,       word: "보통의" },
    { max: 50,       word: "건강한" },
    { max: 70,       word: "강인한" },
    { max: Infinity, word: "불굴의" },
  ],
  감성: [
    { max: 15,       word: "무감각한" },
    { max: 30,       word: "평온한" },
    { max: 50,       word: "섬세한" },
    { max: 70,       word: "풍부한" },
    { max: Infinity, word: "예술적인" },
  ],
  사회성: [
    { max: 15,       word: "고독한" },
    { max: 30,       word: "조용한" },
    { max: 50,       word: "사교적인" },
    { max: 70,       word: "인기있는" },
    { max: Infinity, word: "카리스마 넘치는" },
  ],
};

const STRESS_DESC = [
  { max: 20,       word: "여유로운" },
  { max: 40,       word: "보통의" },
  { max: 60,       word: "피로한" },
  { max: 80,       word: "지친" },
  { max: Infinity, word: "한계에 달한" },
];

export function getDescriptor(stat, value) {
  const table = DESCRIPTORS[stat];
  if (!table) return "";
  return table.find((d) => value <= d.max)?.word ?? table.at(-1).word;
}

export function buildStatusLine(player) {
  const { 지능, 매력, 체력, 감성, 사회성 } = player.stats;
  return [
    `[${player.name}] ${getPhase(player.turn)} / ${getAge(player.turn)}세 / ${player.turn}턴`,
    `${getDescriptor("지능", 지능)} 지성`,
    `${getDescriptor("매력", 매력)} 외모`,
    `${getDescriptor("체력", 체력)} 체력`,
    `${getDescriptor("감성", 감성)} 감각`,
    `${getDescriptor("사회성", 사회성)} 대인관계`,
    `컨디션: ${STRESS_DESC.find((d) => player.hidden.스트레스 <= d.max)?.word}`,
    `소지금: ${player.gold}G`,
  ].join("\n");
}
