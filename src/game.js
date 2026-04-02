// ============================================================
// game.js — 수치 계산 / 서사체 출력
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
    errors.push("행동은 정확히 세 가지를 선택해야 합니다.");
    return errors;
  }

  const adventureCount = actions.filter((a) => a === "무사수행").length;
  if (adventureCount > 1) {
    errors.push("무사수행은 하루에 한 번만 떠날 수 있습니다.");
  }

  for (const name of actions) {
    const action = ACTIONS[name];
    if (!action) {
      errors.push(`'${name}'은(는) 존재하지 않는 행동입니다.`);
      continue;
    }
    if (age < action.minAge) {
      errors.push(`'${name}'은(는) ${action.minAge}세가 되어야 선택할 수 있습니다.`);
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
      log.push({ action: name, changes: [], goldDelta: 0, note: "무사수행 봇에서 진행됩니다." });
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
        changes.push(`${stat} ${adjusted > 0 ? "+" : ""}${adjusted}`);
      } else {
        hidden[stat] = clamp(hidden[stat] + adjusted, 0, 100);
      }
    }

    log.push({
      action:    name,
      changes,
      goldDelta,
      note:      counts[name] > 1 ? "같은 행동을 반복해 효율이 절반으로 줄었습니다." : "",
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

// ================================================================
// 단어 조합 판정표
// ================================================================
const DESCRIPTORS = {
  지능: [
    { max: 15,       word: "무지한 눈빛을 지닌" },
    { max: 30,       word: "평범한 지성의" },
    { max: 50,       word: "총명한 눈빛을 지닌" },
    { max: 70,       word: "박식한 지혜를 품은" },
    { max: 85,       word: "현명함이 넘쳐흐르는" },
    { max: Infinity, word: "천재적인 재능을 타고난" },
  ],
  매력: [
    { max: 15,       word: "눈에 잘 띄지 않는" },
    { max: 30,       word: "수수한 외모의" },
    { max: 50,       word: "친근한 인상의" },
    { max: 70,       word: "매혹적인 분위기를 풍기는" },
    { max: 85,       word: "우아함이 물씬 풍기는" },
    { max: Infinity, word: "전설에나 등장할 법한 아름다움을 지닌" },
  ],
  체력: [
    { max: 15,       word: "허약한 몸의" },
    { max: 30,       word: "보통의 체력을 지닌" },
    { max: 50,       word: "건강한 기운이 넘치는" },
    { max: 70,       word: "강인한 체력을 자랑하는" },
    { max: Infinity, word: "어떤 역경도 이겨낼 불굴의 체력을 지닌" },
  ],
  감성: [
    { max: 15,       word: "감정이 메마른" },
    { max: 30,       word: "잔잔한 마음을 지닌" },
    { max: 50,       word: "섬세한 감수성의" },
    { max: 70,       word: "풍부한 감성을 품은" },
    { max: Infinity, word: "예술적인 영혼을 지닌" },
  ],
  사회성: [
    { max: 15,       word: "고독을 즐기는" },
    { max: 30,       word: "조용한 성품의" },
    { max: 50,       word: "사교적이고 밝은" },
    { max: 70,       word: "어디서든 인기를 끄는" },
    { max: Infinity, word: "타고난 카리스마로 사람을 끌어모으는" },
  ],
};

const STRESS_DESC = [
  { max: 20,       word: "여유로운 봄날처럼 평온한 상태입니다." },
  { max: 40,       word: "평온한 일상을 보내고 있습니다." },
  { max: 60,       word: "조금 지쳐 있는 듯 보입니다." },
  { max: 80,       word: "많이 지쳐 있습니다. 휴식이 필요합니다." },
  { max: Infinity, word: "한계에 다다른 것 같습니다. 당장 쉬어야 합니다." },
];

function getDescriptor(stat, value) {
  const table = DESCRIPTORS[stat];
  if (!table) return "";
  return table.find((d) => value <= d.max)?.word ?? table.at(-1).word;
}

function getStressDesc(value) {
  return STRESS_DESC.find((d) => value <= d.max)?.word ?? STRESS_DESC.at(-1).word;
}

// ================================================================
// 상태 출력 — 프린세스 메이커 서사체
// ================================================================
export function buildStatusLine(player) {
  const { 지능, 매력, 체력, 감성, 사회성 } = player.stats;
  const age   = getAge(player.turn);
  const phase = getPhase(player.turn);

  const lines = [
    `[ ${player.name}의 성장 기록 ]`,
    `${phase} · ${age}세 · ${player.turn}번째 계절`,
    "",
    `${getDescriptor("지능", 지능)} ${player.name}은(는)`,
    `${getDescriptor("매력", 매력)} 모습으로,`,
    `${getDescriptor("체력", 체력)} 하루하루를 보내고 있습니다.`,
    `${getDescriptor("감성", 감성)} 마음과`,
    `${getDescriptor("사회성", 사회성)} 성품을 지녔습니다.`,
    "",
    `지금의 상태: ${getStressDesc(player.hidden.스트레스)}`,
    `소지금: ${player.gold}G`,
  ];

  return lines.join("\n");
}

// ================================================================
// 턴 결과 텍스트 — 서사체
// ================================================================
export function buildTurnResult(player, lastHistory) {
  const lines = [
    `[ ${player.name}의 ${lastHistory.turn}번째 계절 ]`,
    "",
  ];

  for (const entry of lastHistory.log) {
    if (entry.action === "무사수행") {
      lines.push(`  무사수행 — 별도의 봇에서 탐험이 이어집니다.`);
      continue;
    }

    const parts = [];
    if (entry.changes.length > 0)  parts.push(entry.changes.join(", "));
    if (entry.goldDelta > 0)        parts.push(`${entry.goldDelta}G 획득`);
    if (entry.goldDelta < 0)        parts.push(`${Math.abs(entry.goldDelta)}G 지출`);

    lines.push(`  ${entry.action}: ${parts.join(" / ") || "변화 없음"}`);
    if (entry.note) lines.push(`    (${entry.note})`);
  }

  lines.push("", buildStatusLine(player));
  return lines.join("\n");
}
