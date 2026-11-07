export type Level = 'live' | 'interpolated' | 'still' | 'cover' | 'citation';

export const runCascade = async <T>(
  levels: [Level, () => Promise<T>][],
): Promise<{ level: Level; value: T }> => {
  let failure: unknown = new Error('Margins: no replay level');
  for (const [level, attempt] of levels) {
    try {
      return { level, value: await attempt() };
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
};
