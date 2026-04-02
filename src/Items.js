// ============================================================
// items.js — 상점 목록 / 주머니 출력
// ============================================================
// 슬롯 종류 (시트 드롭다운 값 기준):
//   무기     — 무기 슬롯, 장착형
//   의상     — 의상 슬롯, 장착형
//   악세서리 — 악세서리 슬롯, 장착형
//   방패     — 방패 슬롯, 장착형
//   소비     — 인벤토리 보관, [사용/이름] 으로 소비
//   음식     — 레스토랑 음식, 즉시 효과 (인벤토리 미저장)
// ============================================================
import { getItems } from "./sheets.js";

export const EQUIP_SLOTS = ["무기", "의상", "악세서리", "방패"];

export function isEquippable(slot) {
  return EQUIP_SLOTS.includes(slot);
}

export function isConsumable(slot) {
  return slot === "소비";
}

export function isFood(slot) {
  return slot === "음식";
}

// -- 상점별 목록 출력 ---------------------------------------------
export async function buildShopList(shopName) {
  const ITEMS = await getItems();
  const list  = Object.entries(ITEMS).filter(([, v]) => v.shop === shopName);
  if (list.length === 0) return `${shopName}에 등록된 상품이 없습니다.`;

  const lines = list.map(([name, item]) => {
    const ageNote    = item.minAge ? ` / ${item.minAge}세 이상` : "";
    const effectNote = Object.entries(item.effects ?? {})
      .map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`)
      .join(", ") || "-";
    const slotNote   = isConsumable(item.slot) ? " [소지 후 사용]"
                     : isFood(item.slot)        ? " [즉시 효과]"
                     : "";
    return `  ${name} — ${item.price}G / ${effectNote}${slotNote}${ageNote}\n    ${item.desc}`;
  });

  return `[${shopName}]\n${lines.join("\n")}`;
}

// -- 주머니 출력 --------------------------------------------------
export function buildWallet(player) {
  const equippedNames = Object.values(player.equipped ?? {});

  const equippedLines = Object.entries(player.equipped ?? {})
    .map(([slot, name]) => `  ${slot}: ${name}`)
    .join("\n") || "  없음";

  const bagItems = (player.inventory ?? []).filter((n) => !equippedNames.includes(n));
  const bagLines = bagItems.length > 0
    ? bagItems.map((n) => `  ${n}`).join("\n")
    : "  없음";

  return [
    `[${player.name}의 주머니]`,
    `소지금: ${player.gold}G`,
    "",
    "[장착 중]",
    equippedLines,
    "",
    "[소지품]",
    bagLines,
  ].join("\n");
}
