import type { MapRecord } from '@/services/mindmap/schema/types';
import {
  type Diff,
  type FieldChange,
  type MapStore,
  fieldsEqual,
  isEmptyDiff,
  readField,
} from '@/services/mindmap/store/mapStore';

export interface History {
  mark(): string;
  bailToMark(mark: string): void;
  squashToMark(mark: string): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  dispose(): void;
}

interface OpenMark {
  token: string;
  at: number;
}

const changeKey = (change: FieldChange): string => `${change.id}\u0000${change.field}`;

const invertChange = (change: FieldChange): FieldChange => ({
  ...change,
  from: change.to,
  to: change.from,
});

export const combineDiffs = (diffs: Diff[]): Diff => {
  const added = new Map<string, MapRecord>();
  const changed = new Map<string, FieldChange>();
  const discarded = new Set<string>();
  for (const diff of diffs) {
    for (const record of diff.added) added.set(record.id, record);
    for (const change of diff.changed) {
      const created = added.get(change.id);
      if (created) {
        added.set(change.id, { ...created, [change.field]: change.to } as MapRecord);
        continue;
      }
      const prior = changed.get(changeKey(change));
      changed.set(changeKey(change), prior ? { ...prior, to: change.to } : change);
    }
    for (const id of diff.discarded) {
      added.delete(id);
      discarded.add(id);
    }
  }
  return {
    added: [...added.values()].filter((record) => record.deleted === null),
    changed: [...changed.values()].filter(
      (change) => !discarded.has(change.id) && !fieldsEqual(change.from, change.to),
    ),
    discarded: [...discarded],
  };
};

export const createHistory = (store: MapStore): History => {
  const pending: Diff[] = [];
  let openMarks: OpenMark[] = [];
  const undoStack: Diff[] = [];
  const redoStack: Diff[] = [];
  let applying = false;
  let nextToken = 0;

  const withApplying = <T>(run: () => T): T => {
    applying = true;
    try {
      return run();
    } finally {
      applying = false;
    }
  };

  const record = (step: Diff): void => {
    if (isEmptyDiff(step)) return;
    undoStack.push(step);
    redoStack.length = 0;
  };

  const currentEquals = (change: FieldChange, value: unknown): boolean => {
    const current = store.get(change.id);
    return current !== undefined && fieldsEqual(readField(current, change.field), value);
  };

  const revert = (step: Diff): boolean => {
    const live = step.added.map((r) => r.id).filter((id) => store.get(id)?.deleted === null);
    const reverts = step.changed.filter((c) => currentEquals(c, c.to)).map(invertChange);
    if (live.length > 0) store.remove(live, 'user');
    if (reverts.length > 0) store.setFields(reverts);
    return live.length > 0 || reverts.length > 0;
  };

  const reapply = (step: Diff): boolean => {
    const revive = step.added.filter((r) => store.get(r.id)?.deleted !== null);
    const forwards = step.changed.filter((c) => currentEquals(c, c.from));
    if (revive.length > 0) store.put(revive);
    if (forwards.length > 0) store.setFields(forwards);
    return revive.length > 0 || forwards.length > 0;
  };

  const replay = (from: Diff[], to: Diff[], run: (step: Diff) => boolean): boolean =>
    withApplying(() => {
      for (let step = from.pop(); step; step = from.pop()) {
        if (run(step)) {
          to.push(step);
          return true;
        }
      }
      return false;
    });

  const closeMark = (token: string): Diff[] | null => {
    const position = openMarks.findIndex((open) => open.token === token);
    if (position === -1) return null;
    const { at } = openMarks[position]!;
    openMarks = openMarks.slice(0, position);
    return pending.splice(at);
  };

  const unlisten = store.listen((diff, source) => {
    if (applying || source !== 'local') return;
    if (openMarks.length === 0) record(combineDiffs([diff]));
    else pending.push(diff);
  });

  return {
    mark: () => {
      nextToken += 1;
      const token = `mark-${nextToken}`;
      openMarks = [...openMarks, { token, at: pending.length }];
      return token;
    },
    squashToMark: (token) => {
      const collected = closeMark(token);
      if (!collected) return;
      const step = combineDiffs(collected);
      if (openMarks.length === 0) record(step);
      else if (!isEmptyDiff(step)) pending.push(step);
    },
    bailToMark: (token) => {
      const collected = closeMark(token);
      if (!collected || collected.length === 0) return;
      const created = collected.flatMap((diff) => diff.added.map((r) => r.id));
      const reverts = combineDiffs(collected)
        .changed.filter((c) => currentEquals(c, c.to))
        .map(invertChange);
      withApplying(() => {
        if (created.length > 0) store.discard(created);
        if (reverts.length > 0) store.setFields(reverts);
      });
    },
    undo: () => replay(undoStack, redoStack, revert),
    redo: () => replay(redoStack, undoStack, reapply),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    dispose: () => {
      unlisten();
      pending.length = 0;
      openMarks = [];
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
};
