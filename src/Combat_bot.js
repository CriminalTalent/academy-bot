// ============================================================
// combat-bot.js — 왕립 계승 아카데미 무사수행 봇
// ============================================================
import "dotenv/config";
import { createRestAPIClient, createStreamingAPIClient } from "masto";
import { getMonstersByLocation, getLocations }           from "./sheets.js";
import { getPlayer, updatePlayer, getAllPlayers }         from "./storage.js";
import { getAge }                                        from "./game.js";
import {
  getDungeonSession, setDungeonSession,
  clearDungeonSession, createDungeonSession,
  getActiveRaid, getRaid, setRaid, createRaid,
  getDuelByAccount, getDuel, setDuel, createDuel,
  calcHp, calcDamage, randomBetween,
} from "./sessions.js";

const GM_ID        = process.env.GM_ACCOUNT_ID ?? "";
const BOT_TOKEN    = process.env.COMBAT_BOT_TOKEN;
const INSTANCE_URL = process.env.MASTODON_URL;

if (!BOT_TOKEN || !INSTANCE_URL) {
  console.error(".env 설정 필요: MASTODON_URL, COMBAT_BOT_TOKEN");
  process.exit(1);
}

const rest      = createRestAPIClient({ url: INSTANCE_URL, accessToken: BOT_TOKEN });
const streaming = createStreamingAPIClient({
  streamingApiUrl: INSTANCE_URL.replace(/\/$/, "") + "/api/v1/streaming",
  accessToken: BOT_TOKEN,
});

let BOT_HANDLE = "";
let BOT_ID     = "";

async function init() {
  const me   = await rest.v1.accounts.verifyCredentials();
  BOT_HANDLE = me.username;
  BOT_ID     = me.id;
  console.log("무사수행 봇 시작: @" + BOT_HANDLE);
}

// -- 답글 / DM 전송 -----------------------------------------------
async function reply(notification, text, visibility) {
  const chunks = splitText(text, 480);
  let replyId  = notification.status?.id;
  const vis    = visibility ?? notification.status?.visibility ?? "unlisted";

  for (const chunk of chunks) {
    const status = await rest.v1.statuses.create({
      status:      `@${notification.account.acct} ${chunk}`,
      inReplyToId: replyId,
      visibility:  vis,
    });
    replyId = status.id;
  }
}

async function sendDM(acct, text) {
  const chunks = splitText(text, 480);
  let replyId  = null;
  for (const chunk of chunks) {
    const status = await rest.v1.statuses.create({
      status:      `@${acct} ${chunk}`,
      inReplyToId: replyId,
      visibility:  "direct",
    });
    replyId = status.id;
  }
}

async function postPublic(text) {
  return rest.v1.statuses.create({ status: text.slice(0, 490), visibility: "public" });
}

function splitText(text, limit) {
  if (text.length <= limit) return [text];
  const chunks = [];
  while (text.length > 0) {
    chunks.push(text.slice(0, limit));
    text = text.slice(limit);
  }
  return chunks;
}

function parseTokens(content) {
  const plain   = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const matches = [...plain.matchAll(/\[([^\]]+)\]/g)];
  return matches.map((m) => {
    const parts = m[1].split("/");
    return { key: parts[0].trim(), value: parts[1]?.trim() ?? null };
  });
}

// ================================================================
// 무사수행 시작 — 스케줄 봇에서 호출 (DM 발신)
// ================================================================
export async function startAdventure(accountId, acct, displayName) {
  const player    = await getPlayer(accountId, displayName);
  const age       = getAge(player.turn);
  const locations = await getLocations(age);

  if (locations.length === 0) {
    await sendDM(acct, "현재 나잇대에서 진입 가능한 장소가 없습니다.");
    return;
  }

  const hp = calcHp(player.stats.체력);
  createDungeonSession(accountId, hp);

  const locList = locations.map((l) => `  [장소/${l}]`).join("\n");
  await sendDM(acct,
    `[무사수행 시작]\n체력: ${hp}/${hp} | 소지금: ${player.gold}G\n\n장소를 선택하세요:\n${locList}`
  );
}

// ================================================================
// 명령 처리
// ================================================================
async function handleNotification(notification) {
  if (notification.type !== "mention")               return;
  if (!notification.status || !notification.account) return;

  const accountId   = notification.account.id;
  const acct        = notification.account.acct;
  const displayName = notification.account.displayName || acct;
  const isGM        = accountId === GM_ID;
  const tokens      = parseTokens(notification.status.content);
  const isDM        = notification.status.visibility === "direct";

  if (tokens.length === 0) return;

  const player  = await getPlayer(accountId, displayName);
  const session = getDungeonSession(accountId);

  // ================================================================
  // DM 전투 명령
  // ================================================================

  // [장소/장소명] — 장소 선택
  const locToken = tokens.find((t) => t.key === "장소");
  if (locToken && isDM) {
    if (!session || session.phase !== "location") {
      await reply(notification, "무사수행이 시작되지 않았습니다.", "direct");
      return;
    }

    const locationName = locToken.value;
    const age          = getAge(player.turn);
    const monsters     = await getMonstersByLocation(locationName);

    if (monsters.length === 0) {
      await reply(notification, `'${locationName}'은(는) 없는 장소입니다.`, "direct");
      return;
    }
    if (monsters[0].minAge > age) {
      await reply(notification, `'${locationName}'은(는) ${monsters[0].minAge}세 이상만 진입할 수 있습니다.`, "direct");
      return;
    }

    // 마물 랜덤 선택
    const m = monsters[Math.floor(Math.random() * monsters.length)];
    const monster = { name: m.name, hp: m.hp, maxHp: m.hp, attack: m.attack, defense: m.defense, goldMin: m.goldMin, goldMax: m.goldMax };

    setDungeonSession(accountId, {
      ...session,
      phase:    "battle",
      location: locationName,
      monster,
    });

    await reply(notification,
      `[${locationName}] 에 진입했습니다.\n\n${monster.name}이(가) 나타났습니다!\nHP: ${monster.hp}/${monster.hp}\n\n행동을 선택하세요:\n  [공격]\n  [탐색]\n  [도망]`,
      "direct"
    );
    return;
  }

  // [공격] — 전투 중 공격
  if (tokens.some((t) => t.key === "공격") && isDM) {
    if (!session || session.phase !== "battle") {
      await reply(notification, "진행 중인 전투가 없습니다.", "direct");
      return;
    }

    const monster       = session.monster;
    const playerAttack  = player.hidden.전투;
    const monsterAttack = monster.attack;

    // 플레이어 공격
    const playerDmg  = calcDamage(playerAttack, monster.defense);
    monster.hp       = Math.max(0, monster.hp - playerDmg);

    const lines = [`내가 공격! ${monster.name}에게 ${playerDmg} 데미지`];

    // 마물 사망
    if (monster.hp <= 0) {
      const gold = randomBetween(monster.goldMin, monster.goldMax);
      await updatePlayer({ ...player, gold: player.gold + gold });
      clearDungeonSession(accountId);

      lines.push(`${monster.name}을(를) 쓰러뜨렸습니다!`, `${gold}G 획득`);
      await reply(notification, lines.join("\n"), "direct");

      await postPublic(`[무사수행 승리] ${player.name}이(가) ${monster.name}을(를) 처치하고 ${gold}G를 획득했습니다.`);
      return;
    }

    // 마물 반격
    const monsterDmg  = calcDamage(monsterAttack, 0);
    session.playerHp  = Math.max(0, session.playerHp - monsterDmg);
    lines.push(`${monster.name}의 반격! ${monsterDmg} 데미지`);
    lines.push(`내 HP: ${session.playerHp}/${session.playerMaxHp} | ${monster.name} HP: ${monster.hp}/${monster.maxHp}`);

    // 플레이어 사망
    if (session.playerHp <= 0) {
      const penalty = Math.floor(player.gold * 0.1);
      await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
      clearDungeonSession(accountId);

      lines.push(`쓰러졌습니다... ${penalty}G를 잃었습니다.`);
      await reply(notification, lines.join("\n"), "direct");
      return;
    }

    // 전투 계속
    session.monster   = monster;
    session.turnCount = (session.turnCount ?? 0) + 1;
    setDungeonSession(accountId, session);

    lines.push("\n행동을 선택하세요:\n  [공격]\n  [탐색]\n  [도망]");
    await reply(notification, lines.join("\n"), "direct");
    return;
  }

  // [탐색] — 아이템/골드 발견 시도
  if (tokens.some((t) => t.key === "탐색") && isDM) {
    if (!session || session.phase !== "battle") {
      await reply(notification, "진행 중인 전투가 없습니다.", "direct");
      return;
    }

    const roll = Math.random();
    let result;

    if (roll < 0.4) {
      const found = randomBetween(10, 50);
      await updatePlayer({ ...player, gold: player.gold + found });
      result = `숨겨진 골드를 발견했습니다! ${found}G 획득`;
    } else if (roll < 0.6) {
      result = "아무것도 발견하지 못했습니다.";
    } else {
      // 마물 반격 확률
      const monster    = session.monster;
      const monsterDmg = calcDamage(monster.attack, 0);
      session.playerHp = Math.max(0, session.playerHp - monsterDmg);
      setDungeonSession(accountId, session);
      result = `탐색 중 ${monster.name}의 기습을 받았습니다! ${monsterDmg} 데미지\nHP: ${session.playerHp}/${session.playerMaxHp}`;
    }

    await reply(notification,
      `[탐색]\n${result}\n\n행동을 선택하세요:\n  [공격]\n  [탐색]\n  [도망]`,
      "direct"
    );
    return;
  }

  // [도망] — 전투 이탈
  if (tokens.some((t) => t.key === "도망") && isDM) {
    if (!session || session.phase !== "battle") {
      await reply(notification, "진행 중인 전투가 없습니다.", "direct");
      return;
    }

    const success = Math.random() < 0.6;
    if (success) {
      clearDungeonSession(accountId);
      await reply(notification, "도망에 성공했습니다.", "direct");
    } else {
      const monster    = session.monster;
      const monsterDmg = calcDamage(monster.attack, 0);
      session.playerHp = Math.max(0, session.playerHp - monsterDmg);

      if (session.playerHp <= 0) {
        const penalty = Math.floor(player.gold * 0.1);
        await updatePlayer({ ...player, gold: Math.max(0, player.gold - penalty) });
        clearDungeonSession(accountId);
        await reply(notification, `도망 실패! ${monsterDmg} 데미지를 입고 쓰러졌습니다. ${penalty}G 손실.`, "direct");
        return;
      }

      setDungeonSession(accountId, session);
      await reply(notification,
        `도망 실패! ${monsterDmg} 데미지\nHP: ${session.playerHp}/${session.playerMaxHp}\n\n행동을 선택하세요:\n  [공격]\n  [탐색]\n  [도망]`,
        "direct"
      );
    }
    return;
  }

  // ================================================================
  // 퍼블릭 — 레이드
  // ================================================================

  // [레이드/보스명] — 레이드 개설 (GM 전용)
  const raidToken = tokens.find((t) => t.key === "레이드");
  if (raidToken && !isDM) {
    if (!isGM) {
      await reply(notification, "레이드 개설은 GM만 가능합니다.");
      return;
    }

    const bossName = raidToken.value;
    if (!bossName) {
      await reply(notification, "사용법: [레이드/보스명]");
      return;
    }

    const existing = getActiveRaid();
    if (existing) {
      await reply(notification, `이미 진행 중인 레이드가 있습니다: ${existing.bossName}`);
      return;
    }

    // 보스 기본 데이터 (추후 시트에서 로드 가능)
    const bossData = { hp: 500, attack: 20, defense: 10, reward: 300 };
    const raid     = createRaid(bossName, bossData);

    await postPublic(
      `[레이드 모집]\n보스: ${bossName}\nHP: ${raid.bossHp}\n\n[참가] 로 레이드에 참여하세요!`
    );

    await reply(notification, `레이드 '${bossName}' 개설 완료.`);
    return;
  }

  // [참가] — 레이드 참가
  if (tokens.some((t) => t.key === "참가") && !isDM) {
    const raid = getActiveRaid();
    if (!raid) {
      await reply(notification, "현재 모집 중인 레이드가 없습니다.");
      return;
    }
    if (raid.phase !== "recruiting") {
      await reply(notification, "레이드가 이미 시작되었습니다.");
      return;
    }
    if (raid.participants[accountId]) {
      await reply(notification, "이미 참가했습니다.");
      return;
    }

    raid.participants[accountId] = { name: displayName, damage: 0 };
    setRaid(raid);

    const count = Object.keys(raid.participants).length;
    await reply(notification, `레이드 참가 완료. 현재 참가자: ${count}명`);
    return;
  }

  // [레이드시작] — GM이 레이드 전투 시작
  if (tokens.some((t) => t.key === "레이드시작") && !isDM) {
    if (!isGM) {
      await reply(notification, "GM 전용 명령입니다.");
      return;
    }

    const raid = getActiveRaid();
    if (!raid || raid.phase !== "recruiting") {
      await reply(notification, "모집 중인 레이드가 없습니다.");
      return;
    }

    const count = Object.keys(raid.participants).length;
    if (count === 0) {
      await reply(notification, "참가자가 없습니다.");
      return;
    }

    raid.phase = "battle";
    setRaid(raid);

    await postPublic(
      `[레이드 시작] ${raid.bossName}\n참가자: ${count}명\nHP: ${raid.bossHp}/${raid.bossMaxHp}\n\n[공격] 으로 보스를 공격하세요!`
    );
    return;
  }

  // [공격] — 레이드 공격 (퍼블릭)
  if (tokens.some((t) => t.key === "공격") && !isDM) {
    const raid = getActiveRaid();

    // 레이드 참가자 확인
    if (raid && raid.phase === "battle" && raid.participants[accountId]) {
      const dmg        = calcDamage(player.hidden.전투, raid.bossDefense);
      raid.bossHp      = Math.max(0, raid.bossHp - dmg);
      raid.participants[accountId].damage += dmg;

      const lines = [
        `${displayName}이(가) ${raid.bossName}에게 ${dmg} 데미지!`,
        `${raid.bossName} HP: ${raid.bossHp}/${raid.bossMaxHp}`,
      ];

      if (raid.bossHp <= 0) {
        // 레이드 승리
        raid.phase = "ended";
        setRaid(raid);

        const participants = Object.values(raid.participants);
        const share        = Math.floor(raid.reward / participants.length);

        for (const [pid, pdata] of Object.entries(raid.participants)) {
          const p2 = await getPlayer(pid, pdata.name);
          await updatePlayer({ ...p2, gold: p2.gold + share });
        }

        const rankLines = participants
          .sort((a, b) => b.damage - a.damage)
          .map((p, i) => `  ${i + 1}위 ${p.name}: ${p.damage} 데미지`)
          .join("\n");

        lines.push(`\n${raid.bossName} 처치!`, `참가자 1인당 ${share}G 지급`, `\n[피해 순위]\n${rankLines}`);
        await postPublic(lines.join("\n"));
        return;
      }

      // 보스 반격 (전체 참가자에게)
      const bossDmg = calcDamage(raid.bossAttack, 0);
      lines.push(`${raid.bossName}의 반격! 전원에게 ${bossDmg} 데미지`);

      setRaid(raid);
      await postPublic(lines.join("\n"));
      return;
    }

    // 결투 공격 (아래에서 처리)
  }

  // ================================================================
  // 퍼블릭 — 1:1 결투
  // ================================================================

  // [결투/상대계정] — 결투 신청
  const duelToken = tokens.find((t) => t.key === "결투");
  if (duelToken && !isDM) {
    const targetAcct = duelToken.value;
    if (!targetAcct) {
      await reply(notification, "사용법: [결투/상대계정]");
      return;
    }

    const existing = getDuelByAccount(accountId);
    if (existing) {
      await reply(notification, "이미 진행 중인 결투가 있습니다.");
      return;
    }

    const challenger = { accountId, name: displayName, acct, stats: player.stats };
    const duel       = createDuel(challenger, targetAcct);

    await postPublic(
      `[결투 신청]\n${displayName}이(가) @${targetAcct}에게 결투를 신청했습니다!\n\n@${targetAcct} [수락] 으로 응하세요.`
    );
    return;
  }

  // [수락] — 결투 수락
  if (tokens.some((t) => t.key === "수락") && !isDM) {
    const allDuels = Object.values(require("./sessions.js").loadJson?.("./data/duels.json") ?? {});
    // 직접 파일 로드 대신 함수 사용
    const pending = getDuelByAccount(accountId);

    // acct 기반으로 대기 중인 결투 찾기
    const duelsData = JSON.parse(
      (await import("fs")).default.readFileSync(
        process.env.DUELS_PATH ?? "./data/duels.json", "utf-8"
      ).catch?.(() => "{}")  ?? "{}"
    );
    const targetDuel = Object.values(duelsData).find(
      (d) => d.phase === "waiting" && d.targetAcct === acct
    );

    if (!targetDuel) {
      await reply(notification, "수락할 결투 신청이 없습니다.");
      return;
    }

    targetDuel.targetId   = accountId;
    targetDuel.targetName = displayName;
    targetDuel.targetHp   = calcHp(player.stats.체력);
    targetDuel.phase      = "battle";
    setDuel(targetDuel);

    await postPublic(
      `[결투 시작]\n${targetDuel.challengerName} vs ${displayName}\n\n${targetDuel.challengerName}의 선공!\n[공격] 을 입력하세요.`
    );
    return;
  }

  // [공격] — 결투 공격 (퍼블릭, 레이드 아닌 경우)
  if (tokens.some((t) => t.key === "공격") && !isDM) {
    const duel = getDuelByAccount(accountId);
    if (!duel || duel.phase !== "battle") {
      await reply(notification, "진행 중인 결투가 없습니다.");
      return;
    }
    if (duel.currentTurn !== accountId) {
      await reply(notification, "상대방의 차례입니다.");
      return;
    }

    const isChallenger = duel.challengerId === accountId;
    const myHpKey      = isChallenger ? "challengerHp" : "targetHp";
    const oppHpKey     = isChallenger ? "targetHp"     : "challengerHp";
    const myName       = isChallenger ? duel.challengerName : duel.targetName;
    const oppName      = isChallenger ? duel.targetName     : duel.challengerName;
    const oppAcct      = isChallenger ? duel.targetAcct     : duel.challengerAcct;

    const myPlayer   = player;
    const oppId      = isChallenger ? duel.targetId : duel.challengerId;
    const oppPlayer  = await getPlayer(oppId, oppName);

    const dmg        = calcDamage(myPlayer.hidden.전투, 0);
    duel[oppHpKey]   = Math.max(0, duel[oppHpKey] - dmg);

    const lines = [
      `${myName}의 공격! ${dmg} 데미지`,
      `${oppName} HP: ${duel[oppHpKey]}`,
    ];

    if (duel[oppHpKey] <= 0) {
      duel.phase = "ended";
      setDuel(duel);

      lines.push(`\n${myName} 승리!`);
      await postPublic(lines.join("\n"));
      return;
    }

    duel.currentTurn = oppId;
    setDuel(duel);

    lines.push(`\n@${oppAcct} [공격] 차례입니다.`);
    await postPublic(lines.join("\n"));
    return;
  }

  // ================================================================
  // GM 전용
  // ================================================================
  if (isGM && tokens.some((t) => t.key === "레이드종료")) {
    const raid = getActiveRaid();
    if (!raid) {
      await reply(notification, "진행 중인 레이드가 없습니다.");
      return;
    }
    raid.phase = "ended";
    setRaid(raid);
    await reply(notification, `레이드 '${raid.bossName}' 강제 종료.`);
    return;
  }

  await reply(notification, "알 수 없는 명령입니다.");
}

// -- 스트리밍 루프 --------------------------------------------------
async function main() {
  await init();
  console.log("스트리밍 연결 중...");

  const stream = await streaming.user.subscribe();

  for await (const event of stream) {
    if (event.event !== "notification") continue;

    const notification = event.payload;
    try {
      await handleNotification(notification);
      await rest.v1.notifications.dismiss({ id: notification.id });
    } catch (err) {
      console.error("알림 처리 오류:", err);
    }
  }
}

main().catch((err) => {
  console.error("봇 오류:", err);
  process.exit(1);
});
