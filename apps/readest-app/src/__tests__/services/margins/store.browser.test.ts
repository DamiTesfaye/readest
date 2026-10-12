import { describe, expect, it } from 'vitest';
import { WebDatabaseService } from '@/services/database/webDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { MarginsStore } from '@/services/margins/store';

describe('margins store on web', () => {
  it('keeps a queued op across close and reopen', async () => {
    const name = `margins-persist-test-${Date.now()}`;
    const first = await WebDatabaseService.open(name);
    await migrate(first, getMigrations('margins'));
    await MarginsStore.from(first).enqueue({
      opId: 'op1',
      layerId: 'lyr_1',
      method: 'POST',
      body: { kind: 'note' },
      nextAt: 0,
      createdAt: 1,
    });
    await first.close();

    const second = await WebDatabaseService.open(name);
    await migrate(second, getMigrations('margins'));
    expect((await MarginsStore.from(second).dueOps(10)).map((o) => o.opId)).toEqual(['op1']);
    await second.close();
  });
});
