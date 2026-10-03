import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { BoundsRect } from '@/services/mindmap/records/geometry';
import type { CanvasController } from '@/services/mindmap/tools/controller';

const IME_PROCESS_KEY_CODE = 229;

interface LabelEditorProps {
  controller: CanvasController;
  id: string;
  initial: string;
  rect: BoundsRect;
}

const LabelEditor: React.FC<LabelEditorProps> = ({ controller, id, initial, rect }) => {
  const _ = useTranslation();
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  const commit = (): void => {
    if (done.current) return;
    done.current = true;
    controller.commitEdit(id, value);
  };

  const cancel = (): void => {
    done.current = true;
    controller.editing.set(null);
  };

  return (
    <textarea
      ref={ref}
      data-testid='mm-label-editor'
      aria-label={_('Edit label')}
      className='nodrag nowheel bg-base-100 text-base-content pointer-events-auto absolute resize-none rounded-md p-1 text-sm outline-none ring-2 ring-[var(--mm-select)]'
      style={{
        left: rect.x,
        top: rect.y,
        width: Math.max(rect.w, 120),
        height: Math.max(rect.h, 32),
      }}
      value={value}
      autoFocus
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE) return;
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
};

export default LabelEditor;
