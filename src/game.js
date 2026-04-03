// ============================================================
// game.js
// ============================================================

export const PUBLIC_STATS = ["지능", "매력", "체력", "감성", "사회성"];
export const HIDDEN_STATS = ["도덕성", "야망", "위험도", "의존성", "스트레스", "평판", "전투"];

export const INITIAL_STATS = {
  지능: 20, 매력: 20, 체력: 20, 감성: 20, 사회성: 20,
};
export const INITIAL_HIDDEN = {
  도덕성: 50, 야망: 10, 위험도: 0, 의존성: 0,
  스트레스: 10, 평판: 20, 전투: 0,
};

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

export const ACTIONS = {

  // 교육
  "기초학습":       { category: "교육", minAge: 8,  gold: -50,  effects: { 지능: 3 } },
  "음악입문":       { category: "교육", minAge: 8,  gold: -70,  effects: { 감성: 2, 매력: 1 } },
  "댄스입문":       { category: "교육", minAge: 8,  gold: -80,  effects: { 매력: 2, 감성: 1 } },
  "검술입문":       { category: "교육", minAge: 8,  gold: -80,  effects: { 체력: 2, 전투: 1 } },
  "요리기초":       { category: "교육", minAge: 8,  gold: -40,  effects: { 감성: 1, 평판: 1 } },
  "예절기초":       { category: "교육", minAge: 8,  gold: -60,  effects: { 사회성: 2, 매력: 1 } },

  "고급학습":       { category: "교육", minAge: 13, gold: -120, effects: { 지능: 5 } },
  "마법수업":       { category: "교육", minAge: 13, gold: -150, effects: { 지능: 3, 감성: 3 } },
  "검술중급":       { category: "교육", minAge: 13, gold: -150, effects: { 체력: 3, 전투: 3 } },
  "예절교육":       { category: "교육", minAge: 13, gold: -100, effects: { 매력: 2, 사회성: 3 } },
  "미술수업":       { category: "교육", minAge: 13, gold: -110, effects: { 감성: 3, 매력: 2 } },
  "상술강좌":       { category: "교육", minAge: 13, gold: -90,  effects: { 사회성: 2, 평판: 2 } },

  "왕실교육":       { category: "교육", minAge: 17, gold: -300, effects: { 매력: 3, 사회성: 3, 평판: 3 } },
  "마법고급":       { category: "교육", minAge: 17, gold: -280, effects: { 지능: 5, 감성: 3 } },
  "기사수련":       { category: "교육", minAge: 17, gold: -280, effects: { 체력: 5, 전투: 5 } },
  "외교술":         { category: "교육", minAge: 17, gold: -250, effects: { 사회성: 5, 평판: 3 } },
  "신학":           { category: "교육", minAge: 17, gold: -200, effects: { 도덕성: 5, 감성: 3 } },
  "연금술":         { category: "교육", minAge: 17, gold: -260, effects: { 지능: 3, 야망: 2 } },

  // 아르바이트
  "심부름":         { category: "아르바이트", minAge: 8,  gold: 30,  effects: { 체력: -1 } },
  "청소도우미":     { category: "아르바이트", minAge: 8,  gold: 40,  effects: { 체력: -1, 스트레스: 1 } },
  "텃밭일손":       { category: "아르바이트", minAge: 8,  gold: 35,  effects: { 체력: -1, 감성: 1 } },
  "제과점보조":     { category: "아르바이트", minAge: 8,  gold: 45,  effects: { 매력: 1, 스트레스: 1 } },
  "빨래배달":       { category: "아르바이트", minAge: 8,  gold: 30,  effects: { 체력: -2 } },
  "급사":           { category: "아르바이트", minAge: 8,  gold: 50,  effects: { 사회성: 1, 스트레스: 1 } },

  "세탁소":         { category: "아르바이트", minAge: 13, gold: 80,  effects: { 체력: -2, 스트레스: 1 } },
  "시장상인보조":   { category: "아르바이트", minAge: 13, gold: 90,  effects: { 사회성: 1, 스트레스: 1 } },
  "사서보조":       { category: "아르바이트", minAge: 13, gold: 70,  effects: { 지능: 1 } },
  "마구간관리":     { category: "아르바이트", minAge: 13, gold: 85,  effects: { 체력: -1, 감성: 1 } },
  "약초상보조":     { category: "아르바이트", minAge: 13, gold: 75,  effects: { 지능: 1, 감성: 1 } },
  "여관서빙":       { category: "아르바이트", minAge: 13, gold: 100, effects: { 매력: 1, 사회성: 1, 스트레스: 1 } },

  "가정교사":       { category: "아르바이트", minAge: 17, gold: 150, effects: { 지능: 1, 사회성: 1 } },
  "경호원":         { category: "아르바이트", minAge: 17, gold: 180, effects: { 체력: -2, 스트레스: 2 } },
  "약초채집":       { category: "아르바이트", minAge: 17, gold: 130, effects: { 체력: -1, 감성: 1 } },
  "통역사보조":     { category: "아르바이트", minAge: 17, gold: 160, effects: { 지능: 1, 사회성: 2 } },
  "기사단훈련보조": { category: "아르바이트", minAge: 17, gold: 170, effects: { 체력: -1, 전투: 1 } },
  "귀족서기":       { category: "아르바이트", minAge: 17, gold: 200, effects: { 지능: 2, 평판: 1 } },

  // 휴식
  "휴식":   { category: "휴식", minAge: 8, gold: 0, effects: { 스트레스: -4, 체력: 1 } },
  "명상":   { category: "휴식", minAge: 8, gold: 0, effects: { 감성: 3, 스트레스: -3, 도덕성: 1 } },
  "산책":   { category: "휴식", minAge: 8, gold: 0, effects: { 스트레스: -2, 감성: 1 } },

  // 사교
  "사교": { category: "사교", minAge: 8, gold: 0,   effects: { 매력: 2, 사회성: 2, 평판: 1, 스트레스: -1 } },
  "연회": { category: "사교", minAge: 8, gold: -50, effects: { 매력: 3, 사회성: 1, 평판: 2, 의존성: 1 } },
  "봉사": { category: "사교", minAge: 8, gold: 0,   effects: { 도덕성: 2, 사회성: 1, 평판: 1 } },

  // 무사수행
  "무사수행": { category: "무사수행", minAge: 8, gold: 0, effects: {} },
};

export function validateSchedule(actions, age) {
  const errors = [];

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

export function applyActions(player, actions) {
  const stats  = { ...player.stats };
  const hidden = { ...player.hidden };
  let   gold   = player.gold;
  const log    = [];

  const counts = {};
  for (const name of actions) counts[name] = (counts[name] ?? 0) + 1;

  for (const name of actions) {
    if (name === "무사수행") {
      log.push({ action: name, changes: [], goldDelta: 0, note: "무사수행 봇에서 진행" });
      continue;
    }

    const action  = ACTIONS[name];
    if (!action) continue;

    const penalty = counts[name] > 1 ? 0.5 : 1;
    const changes = [];

    const goldDelta = Math.round(action.gold * penalty);
    gold = Math.max(0, gold + goldDelta);

    for (const [stat, delta] of Object.entries(action.effects)) {
      const adjusted = Math.round(delta * penalty);
      if (adjusted === 0) continue;

      if (PUBLIC_STATS.includes(stat)) {
        stats[stat] = clamp(stats[stat] + adjusted, 0, 100);
      } else {
        hidden[stat] = clamp(hidden[stat] + adjusted, 0, 100);
      }

      if (PUBLIC_STATS.includes(stat)) {
        changes.push(`${stat}${adjusted > 0 ? "+" : ""}${adjusted}`);
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
    history: [
      ...player.history,
      { turn: player.turn, actions, log },
    ],
  };
}

export function applyEquipment(baseStats, equipped, items) {
  const stats = { ...baseStats };
  for (const itemName of Object.values(equipped)) {
    const item = items[itemName];
    if (!item?.equip) continue;
    for (const [stat, delta] of Object.entries(item.equip)) {
      if (stat in stats) stats[stat] = clamp(stats[stat] + delta, 0, 100);
    }
  }
  return stats;
}

function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, v));
}

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

export function buildStatusLine(player, items = {}) {
  const equippedStats = applyEquipment(player.stats, player.equipped ?? {}, items);
  const { 지능, 매력, 체력, 감성, 사회성 } = equippedStats;
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
