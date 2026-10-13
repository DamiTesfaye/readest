export interface TreeItem {
  key: string;
  parentKey: string | null;
}

export interface TreeSlot {
  depth: number;
  row: number;
}

export const tidyTree = (items: readonly TreeItem[]): Map<string, TreeSlot> => {
  const keys = new Set(items.map((item) => item.key));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const { key, parentKey } of items) {
    if (parentKey !== null && parentKey !== key && keys.has(parentKey)) {
      children.set(parentKey, [...(children.get(parentKey) ?? []), key]);
    } else {
      roots.push(key);
    }
  }
  const slots = new Map<string, TreeSlot>();
  let nextRow = 0;
  const place = (key: string, depth: number): number => {
    slots.set(key, { depth, row: nextRow });
    const rows: number[] = [];
    for (const child of children.get(key) ?? []) {
      if (!slots.has(child)) rows.push(place(child, depth + 1));
    }
    const row = rows.length > 0 ? (rows[0]! + rows[rows.length - 1]!) / 2 : nextRow++;
    slots.set(key, { depth, row });
    return row;
  };
  for (const key of [...roots, ...keys]) if (!slots.has(key)) place(key, 0);
  return slots;
};
