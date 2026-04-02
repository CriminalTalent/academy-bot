// ============================================================
// shop-bot.js — 왕립 계승 아카데미 상가 봇
// ============================================================
import "dotenv/config";
import { createRestAPIClient, createStreamingAPIClient } from "masto";
import { buildShopList, buildWallet, isEquippable, isConsumable, isFood } from "./items.js";
import { getItems }                                      from "./sheets.js";
import { getAge }                                        from "./game.js";
import { getPlayer, updatePlayer, getAllPlayers }         from "./storage.js";
import { drawThree, buildTarotReading }                  from "./tarot.js";

const GM_ID        = process.env.GM_ACCOUNT_ID ?? "";
const BOT_TOKEN    = process.env.SHOP_BOT_TOKEN;
const INSTANCE_URL = process.env.MASTODON_URL;

if (!BOT_TOKEN || !INSTANCE_URL) {
  console.error(".env 설정 필요: MASTODON_URL, SHOP_BOT_TOKEN");
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
  console.log("상가 봇 시작: @" + BOT_HANDLE);
}

// -- 전송 유틸 ----------------------------------------------------
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
    return { key: parts[0].trim(), value: parts[1]?.trim() ?? null };
  });
}

function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, v));
}

// -- 아이템 효과 적용 (수치 계산) ---------------------------------
function applyEffects(stats, hidden, effects, sign = 1) {
  const s = { ...stats };
  const h = { ...hidden };
  for (const [stat, delta] of Object.entries(effects ?? {})) {
    const adjusted = delta * sign;
    if (stat in s) s[stat] = clamp(s[stat] + adjusted, 0, 100);
    if (stat in h) h[stat] = clamp(h[stat] + adjusted, 0, 100);
  }
  return { stats: s, hidden: h };
}

// ================================================================
// 명령 처리
// ================================================================
async function handleNotification(notification) {
  if (notification.type !== "mention")               return;
  if (!notification.status || !notification.account) return;

  const accountId   = notification.account.id;
  const displayName = notification.account.displayName || notification.account.acct;
  const isGM        = accountId === GM_ID;
  const tokens      = parseTokens(notification.status.content);

  if (tokens.length === 0) return;

  const player = await getPlayer(accountId, displayName);
  const age    = getAge(player.turn);
  const ITEMS  = await getItems();

  // -- [주머니] ---------------------------------------------------
  if (tokens.some((t) => t.key === "주머니")) {
    await reply(notification, buildWallet(player));
    return;
  }

  // -- [타로] ------------------------------------------------------
  if (tokens.some((t) => t.key === "타로")) {
    const cards   = drawThree();
    const reading = buildTarotReading(cards);
    await reply(notification, reading);
    return;
  }

  // -- [상가/상점명] ----------------------------------------------
  const shopToken = tokens.find((t) => t.key === "상가");
  if (shopToken) {
    const shopName = shopToken.value;
    const valid    = ["무기상", "의상실", "잡화점"];
    if (!valid.includes(shopName)) {
      await reply(notification, `'${shopName}'은(는) 없는 상점입니다.\n상점 목록: ${valid.join(" / ")}`);
      return;
    }
    await reply(notification, await buildShopList(shopName));
    return;
  }

  // -- [레스토랑] -------------------------------------------------
  if (tokens.some((t) => t.key === "레스토랑")) {
    await reply(notification, await buildShopList("레스토랑"));
    return;
  }

  // -- [구매/상품명] -----------------------------------------------
  const buyToken = tokens.find((t) => t.key === "구매");
  if (buyToken) {
    const itemName = buyToken.value;
    const item     = ITEMS[itemName];

    if (!item) {
      await reply(notification, `'${itemName}'은(는) 없는 상품입니다.`);
      return;
    }
    if (item.minAge && age < item.minAge) {
      await reply(notification, `'${itemName}'은(는) ${item.minAge}세 이상만 구매할 수 있습니다.`);
      return;
    }
    if (player.gold < item.price) {
      await reply(notification, `골드가 부족합니다. (보유: ${player.gold}G / 필요: ${item.price}G)`);
      return;
    }

    // 음식(레스토랑) — 즉시 효과, 인벤토리 미저장
    if (isFood(item.slot)) {
      const { stats, hidden } = applyEffects(player.stats, player.hidden, item.effects);
      await updatePlayer({ ...player, stats, hidden, gold: player.gold - item.price });

      const effectText = Object.entries(item.effects ?? {})
        .map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`)
        .join(", ");
      await reply(notification, [
        `[${item.shop}] ${itemName} — ${item.price}G 지출`,
        effectText ? `효과: ${effectText}` : "",
        `잔액: ${player.gold - item.price}G`,
      ].filter(Boolean).join("\n"));
      return;
    }

    // 그 외 — 인벤토리에 추가
    const updated = {
      ...player,
      gold:      player.gold - item.price,
      inventory: [...(player.inventory ?? []), itemName],
    };
    await updatePlayer(updated);

    const slotNote = isConsumable(item.slot) ? "\n[사용/이름] 으로 소비할 수 있습니다." : "";
    await reply(notification, [
      `[구매 완료] ${itemName} — ${item.price}G 지출`,
      `잔액: ${updated.gold}G`,
      slotNote,
    ].filter(Boolean).join("\n"));
    return;
  }

  // -- [판매/상품명] -----------------------------------------------
  const sellToken = tokens.find((t) => t.key === "판매");
  if (sellToken) {
    const itemName = sellToken.value;
    const item     = ITEMS[itemName];
    const inv      = player.inventory ?? [];

    if (!item) {
      await reply(notification, `'${itemName}'은(는) 없는 상품입니다.`);
      return;
    }
    if (!inv.includes(itemName)) {
      await reply(notification, `'${itemName}'을(를) 보유하고 있지 않습니다.`);
      return;
    }
    if (Object.values(player.equipped ?? {}).includes(itemName)) {
      await reply(notification, `장착 중인 아이템은 판매할 수 없습니다. 먼저 [제거/${itemName}] 해주세요.`);
      return;
    }

    const sellPrice = Math.floor(item.price * (item.sellRate ?? 0.5));
    const newInv    = [...inv];
    newInv.splice(newInv.indexOf(itemName), 1);

    await updatePlayer({ ...player, gold: player.gold + sellPrice, inventory: newInv });
    await reply(notification, `[판매 완료] ${itemName} — ${sellPrice}G 수령\n잔액: ${player.gold + sellPrice}G`);
    return;
  }

  // -- [장착/상품명] -----------------------------------------------
  const equipToken = tokens.find((t) => t.key === "장착");
  if (equipToken) {
    const itemName = equipToken.value;
    const item     = ITEMS[itemName];
    const inv      = player.inventory ?? [];

    if (!item) {
      await reply(notification, `'${itemName}'은(는) 없는 상품입니다.`);
      return;
    }
    if (!inv.includes(itemName)) {
      await reply(notification, `'${itemName}'을(를) 보유하고 있지 않습니다.`);
      return;
    }
    if (!isEquippable(item.slot)) {
      await reply(notification, `'${itemName}'은(는) 장착할 수 없습니다.\n소비 아이템은 [사용/${itemName}] 을 사용하세요.`);
      return;
    }

    const slot     = item.slot;
    const prevItem = player.equipped?.[slot];

    // 이전 아이템 효과 제거
    let { stats, hidden } = applyEffects(player.stats, player.hidden,
      prevItem ? (ITEMS[prevItem]?.effects ?? {}) : {}, -1
    );

    // 새 아이템 효과 적용
    ({ stats, hidden } = applyEffects(stats, hidden, item.effects ?? {}, 1));

    const newEquipped = { ...(player.equipped ?? {}), [slot]: itemName };
    await updatePlayer({ ...player, stats, hidden, equipped: newEquipped });

    const effectText = Object.entries(item.effects ?? {}).map(([k, v]) => `${k}+${v}`).join(", ");
    const prevNote   = prevItem ? ` (기존 ${prevItem} 해제)` : "";
    await reply(notification, `[장착 완료] ${itemName}${prevNote}\n효과: ${effectText || "-"}`);
    return;
  }

  // -- [사용/상품명] — consumable 아이템 소비 ----------------------
  const useToken = tokens.find((t) => t.key === "사용");
  if (useToken) {
    const itemName = useToken.value;
    const item     = ITEMS[itemName];
    const inv      = player.inventory ?? [];

    if (!item) {
      await reply(notification, `'${itemName}'은(는) 없는 상품입니다.`);
      return;
    }
    if (!inv.includes(itemName)) {
      await reply(notification, `'${itemName}'을(를) 보유하고 있지 않습니다.`);
      return;
    }
    if (!isConsumable(item.slot)) {
      await reply(notification, `'${itemName}'은(는) 소비 아이템이 아닙니다.`);
      return;
    }

    const { stats, hidden } = applyEffects(player.stats, player.hidden, item.effects ?? {}, 1);
    const newInv            = [...inv];
    newInv.splice(newInv.indexOf(itemName), 1);

    await updatePlayer({ ...player, stats, hidden, inventory: newInv });

    const effectText = Object.entries(item.effects ?? {})
      .map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`)
      .join(", ");
    await reply(notification, `[사용 완료] ${itemName}\n효과: ${effectText || "-"}`);
    return;
  }

  // -- [제거/상품명] -----------------------------------------------
  const unequipToken = tokens.find((t) => t.key === "제거");
  if (unequipToken) {
    const itemName    = unequipToken.value;
    const item        = ITEMS[itemName];
    const equippedMap = player.equipped ?? {};
    const slot        = Object.entries(equippedMap).find(([, v]) => v === itemName)?.[0];

    if (!item) {
      await reply(notification, `'${itemName}'은(는) 없는 상품입니다.`);
      return;
    }
    if (!slot) {
      await reply(notification, `'${itemName}'을(를) 장착하고 있지 않습니다.`);
      return;
    }

    const { stats, hidden } = applyEffects(player.stats, player.hidden, item.effects ?? {}, -1);
    const newEquipped       = { ...equippedMap };
    delete newEquipped[slot];

    await updatePlayer({ ...player, stats, hidden, equipped: newEquipped });
    await reply(notification, `[제거 완료] ${itemName}\n슬롯 [${slot}] 비어있음`);
    return;
  }

  // -- GM 전용: [골드지급/이름/금액] [골드차감/이름/금액] ----------
  if (isGM) {
    const raw     = notification.status.content.replace(/<[^>]+>/g, " ");
    const gmMatch = raw.match(/\[(골드지급|골드차감)\/([^/\]]+)\/(\d+)\]/);
    if (gmMatch) {
      const [, cmd, name, amountStr] = gmMatch;
      const amount  = parseInt(amountStr, 10);
      const players = await getAllPlayers();
      const target  = players.find((p) => p.name === name);

      if (!target) {
        await reply(notification, `'${name}' 플레이어를 찾을 수 없습니다.`);
        return;
      }

      const delta   = cmd === "골드지급" ? amount : -amount;
      const updated = { ...target, gold: Math.max(0, target.gold + delta) };
      await updatePlayer(updated);
      await reply(notification, `[완료] ${name} 골드 ${delta > 0 ? "+" : ""}${delta}G / 잔액: ${updated.gold}G`);
      return;
    }
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
