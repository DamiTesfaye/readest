import { useSyncExternalStore } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { ComposeController } from '@/services/margins/compose/controller';

export function PlainToolbar({ controller }: { controller: ComposeController }) {
  const _ = useTranslation();
  const state = useSyncExternalStore(
    controller.subscribe,
    () => controller.state,
    () => controller.state,
  );
  return (
    <div role='toolbar' aria-label={_('Margin tools')} className='flex flex-wrap gap-1'>
      {controller.tools().map((tool) => (
        <button
          key={tool.id}
          type='button'
          className='btn btn-xs'
          aria-pressed={tool.active ? tool.active(state) : undefined}
          disabled={!tool.enabled(state)}
          onClick={() => void tool.run(controller)}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}

export default PlainToolbar;
