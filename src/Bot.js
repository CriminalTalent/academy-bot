// ============================================================
// bot.js — 왕립 계승 아카데미 스케줄 봇
// ============================================================
import "dotenv/config";
import { createRestAPIClient, createStreamingAPIClient } from "masto";
import {
  applyActions, buildStatusLine, buildTurnResult,
  validateSchedule, getAge,
} from "./game.js";
import {
  getPlayer, updatePlayer, getAllPlayers,
  processPlayer, hasSubmittedThisTurn, isEnded,
} from "./storage.js";
import { getActions }     from "./sheets.js";
import { startAdventure } from "./combat-bot.js";

const GM_ID        = process.env.GM_ACCOUNT_ID ?? "";
const BOT_TOKEN    = process.env.MASTODON_TOKEN;
const INSTANCE_URL = process.env.MASTODON_URL;

if (!BOT_TOKEN || !INSTANCE_URL) {
  console.error(".env 설정 필요: MASTODON_URL, MASTODON_TOKEN");
  process.exit(1);
}

const rest      = createRestAPIClient({ url: INSTANCE_URL, accessToken: BOT_TOKEN });
const streaming = createStreamingAPIClient({
  streamingApiUrl: INSTANCE_URL.replace(/\/$/, "") + "/api/v1/streaming",
  accessToken: BOT_TOKEN,
});

let BOT_HANDLE = "";

async function init() {
  const me   = await rest.v1.accounts.verifyCredentials();
  BOT_HANDLE = me.username;
  console.log("스케줄 봇 시작: @" + BOT_HANDLE);
}

async function reply(notification, text) {
  const chunks = splitText(text, 480);
  let replyId  = notification.status?.id;
  for (const chunk of chunks) {
    const s = await rest.v1.statuses.create({
      status:      `@${notification.account.acct} ${chunk}`,
      inReplyToId: replyId,
      visibility:  notification.status?.visibility ?? "unlisted",
    });
    replyId = s.id;
  }
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
    return {
      key:   parts[0].trim(),
      value: parts[1]?.trim() ?? null,
      sub:   parts[2]?.replace(/[()]/g, "").trim() ?? null,
    };
  });
}

async function handleNotification(notification) {
  if (notification.type !== "mention")               return;
  if (!notification.status || !notification.account) return;

  const accountId   = notification.account.id;
  const acct        = notification.account.acct;
  const displayName = notification.account.displayName || acct;
  const isGM        = accountId === GM_ID;
  const tokens      = parseTokens(notification.status.content);

  if (tokens.length === 0) return;

  // -- [상태] -------------------------------------------------------
  if (tokens.some((t) => t.key === "상태")) {
    const player = await getPlayer(accountId, displayName);
    await reply(notification, buildStatusLine(player));
    return;
  }

  // -- [스케줄/행동명] x3 -------------------------------------------
  const scheduleTokens = tokens.filter((t) => t.key === "스케줄");

  if (scheduleTokens.length > 0) {
    if (await isEnded(accountId, displayName)) {
      await reply(notification, "이미 졸업식을 마쳤습니다. 커뮤니티가 종료되었습니다.");
      return;
    }
    if (await hasSubmittedThisTurn(accountId, displayName)) {
      await reply(notification, "이번 계절의 일과는 이미 정해져 있습니다. 다음 턴을 기다려주세요.");
      return;
    }

    const player            = await getPlayer(accountId, displayName);
    const age               = getAge(player.turn);
    const actions           = scheduleTokens.map((t) => t.value).filter(Boolean);
    const adventureToken    = scheduleTokens.find((t) => t.value === "무사수행");
    const adventureLocation = adventureToken?.sub ?? null;

    if (actions.includes("무사수행") && !adventureLocation) {
      await reply(notification, "무사수행을 떠나려면 목적지를 정해야 합니다.\n예) [스케줄/무사수행/(서부사막)]");
      return;
    }

    const errors = await validateSchedule(actions, age);
    if (errors.length > 0) {
      await reply(notification, `일과 제출에 실패했습니다.\n${errors.join("\n")}`);
      return;
    }

    const updated     = await processPlayer(accountId, (p) => applyActions(p, actions));
    if (!updated) return;

    const lastHistory = updated.history.at(-1);
    const resultText  = buildTurnResult(updated, lastHistory);

    await rest.v1.statuses.create({
      status:     resultText.slice(0, 490),
      visibility: "public",
    });

    await reply(notification, `${lastHistory.turn}번째 계절의 기록이 완성되었습니다.`);

    if (actions.includes("무사수행") && adventureLocation) {
      await startAdventure(accountId, acct, displayName, adventureLocation);
    }

    return;
  }

  // -- GM 전용 명령 -------------------------------------------------
  if (!isGM) {
    await reply(notification, "알 수 없는 명령입니다.");
    return;
  }

  // [현황]
  if (tokens.some((t) => t.key === "현황")) {
    const players = await getAllPlayers();
    if (players.length === 0) {
      await reply(notification, "아직 등록된 플레이어가 없습니다.");
      return;
    }
    const lines = players.map((p) => {
      const lastTurn = p.history.at(-1)?.turn ?? 0;
      const flag     = lastTurn === p.turn - 1 ? "[완료]" : "[대기]";
      return `${flag} ${p.name} — ${p.turn - 1}번째 계절 완료 / 스트레스 ${p.hidden.스트레스} / 위험도 ${p.hidden.위험도}`;
    });
    await reply(notification, `[ 전체 현황 ]\n${lines.join("\n")}`);
    return;
  }

  // [상세] / [상세/이름]
  if (tokens.some((t) => t.key === "상세")) {
    const targetName = tokens.find((t) => t.key === "상세")?.value;
    const players    = await getAllPlayers();
    const list       = targetName
      ? players.filter((p) => p.name === targetName)
      : players;

    if (targetName && list.length === 0) {
      await reply(notification, `'${targetName}' 플레이어를 찾을 수 없습니다.`);
      return;
    }

    for (const p of list) {
      const pub    = Object.entries(p.stats).map(([k, v])  => `${k} ${v}`).join(" / ");
      const hidden = Object.entries(p.hidden).map(([k, v]) => `${k} ${v}`).join(" / ");
      await reply(notification, [
        `[ ${p.name} 상세 기록 ]`,
        `공개 수치: ${pub}`,
        `숨겨진 수치: ${hidden}`,
        `소지금: ${p.gold}G`,
        "",
        buildStatusLine(p),
      ].join("\n"));
    }
    return;
  }

  // [강제진행]
  if (tokens.some((t) => t.key === "강제진행")) {
    const players = await getAllPlayers();
    const targets = players.filter((p) => {
      const lastTurn = p.history.at(-1)?.turn ?? 0;
      return lastTurn < p.turn;
    });

    if (targets.length === 0) {
      await reply(notification, "처리할 플레이어가 없습니다.");
      return;
    }

    for (const p of targets) {
      await updatePlayer({ ...p, turn: p.turn + 1 });
    }
    await reply(notification, `${targets.length}명의 계절을 강제로 넘겼습니다.`);
    return;
  }

  await reply(notification, "알 수 없는 명령입니다.");
}

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
