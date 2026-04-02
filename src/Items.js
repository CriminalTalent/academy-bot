// ============================================================
// items.js — 상가 아이템 (Google Sheets 기반)
// ============================================================
import { getItems } from "./sheets.js";

// -- 상점별 목록 출력 ---------------------------------------------
export async function buildShopList(shopName) {
  const ITEMS = await getItems();
  const list  = Object.entries(ITEMS).filter(([, v]) => v.shop === shopName);
  if (list.length === 0) return `${shopName}에 등록된 상품이 없습니다.`;

  const lines = list.map(([name, item]) => {
    const ageNote    = item.minAge ? ` / ${item.minAge}세 이상` : "";
    const effectNote = Object.entries(item.effects)
      .map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`)
      .join(", ");
    return `  ${name} — ${item.price}G / ${effectNote || "-"}${ageNote}\n    ${item.desc}`;
  });

  return `[${shopName}]\n${lines.join("\n")}`;
}

// -- 주머니 출력 --------------------------------------------------
export function buildWallet(player) {
  const equipped = Object.entries(player.equipped ?? {})
    .map(([slot, name]) => `  ${slot}: ${name}`)
    .join("\n") || "  없음";

  const equippedNames = Object.values(player.equipped ?? {});
  const unequipped    = (player.inventory ?? []).filter((n) => !equippedNames.includes(n));
  const invLines      = unequipped.length > 0
    ? unequipped.map((n) => `  ${n}`).join("\n")
    : "  없음";

  return [
    `[${player.name}의 주머니]`,
    `소지금: ${player.gold}G`,
    "",
    "[장착 중]",
    equipped,
    "",
    "[보관 중]",
    invLines,
  ].join("\n");
}
