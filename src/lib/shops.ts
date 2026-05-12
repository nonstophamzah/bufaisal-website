// Phase 6.4 PR B — canonical shop config for the public site.
//
// Maps the BF1–BF5 `worker_shop_id` values stored on `shop_items` to
// display strings and Google Business Profile / Maps deep links.
// Consumed by `/item/[id]` for the spec-table Location link.
//
// Not imported by `/admin*` (sacred) — legacy `shop_source` / `shop_label`
// reads in admin pages continue to work without this config.

export type ShopId = 'BF1' | 'BF2' | 'BF3' | 'BF4' | 'BF5';

export interface Shop {
  id: ShopId;
  label: string;
  branch: string;
  displayName: string;
  mapUrl: string;
}

export const SHOPS: Record<ShopId, Shop> = {
  BF1: {
    id: 'BF1',
    label: 'Shop A',
    branch: 'Main Branch',
    displayName: 'Shop A, Ajman',
    mapUrl: 'https://share.google/JEuH3Tr8MAoubmM69',
  },
  BF2: {
    id: 'BF2',
    label: 'Shop B',
    branch: 'Branch 2',
    displayName: 'Shop B, Ajman',
    mapUrl: 'https://share.google/MsIvwoV9qzcW1DpGM',
  },
  BF3: {
    id: 'BF3',
    label: 'Shop C',
    branch: 'Branch 3',
    displayName: 'Shop C, Ajman',
    mapUrl: 'https://share.google/AZTXlZxyMeF9RSEu8',
  },
  BF4: {
    id: 'BF4',
    label: 'Shop D',
    branch: 'Branch 4',
    displayName: 'Shop D, Ajman',
    mapUrl: 'https://share.google/Zq0gxkFHh3Wk9efhn',
  },
  BF5: {
    id: 'BF5',
    label: 'Shop E',
    branch: 'Branch 5',
    displayName: 'Shop E, Ajman',
    mapUrl: 'https://share.google/u97fMw3hL6ocrDjfR',
  },
};

export function getShop(id: string | null | undefined): Shop | null {
  if (!id) return null;
  return SHOPS[id as ShopId] ?? null;
}
