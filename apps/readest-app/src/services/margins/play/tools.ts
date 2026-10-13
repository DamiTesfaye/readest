import type { ToolId } from '../compose/controller';
import type { PlayTools, PlayToolsState } from './session';

export interface PlayTool {
  id: ToolId;
  label: string;
  group: 'play';
  enabled(state: PlayToolsState): boolean;
  active?(state: PlayToolsState): boolean;
  run(play: PlayTools): void | Promise<void>;
}

export const playTools = (_: (key: string) => string): readonly PlayTool[] => [
  {
    id: 'play.circle',
    label: _('Circle'),
    group: 'play',
    enabled: (s) => s.active,
    run: (p) => void p.addShape('circle'),
  },
  {
    id: 'play.polygon',
    label: _('Triangle'),
    group: 'play',
    enabled: (s) => s.active,
    run: (p) => void p.addShape('polygon'),
  },
  {
    id: 'play.drift',
    label: _('Drift'),
    group: 'play',
    enabled: (s) => s.active,
    active: (s) => s.shapeMotion === 'drift',
    run: (p) => p.setShapeMotion(p.state.shapeMotion === 'drift' ? 'none' : 'drift'),
  },
  {
    id: 'play.detach',
    label: _('Knock words loose'),
    group: 'play',
    enabled: (s) => s.active,
    active: (s) => s.unit !== null,
    run: (p) => p.detachMode(p.state.unit ? null : 'glyph'),
  },
  {
    id: 'play.detachNext',
    label: _('Detach next word'),
    group: 'play',
    enabled: (s) => s.active,
    run: (p) => p.detachNext(),
  },
  {
    id: 'play.shake',
    label: _('Shake loose the last sentence'),
    group: 'play',
    enabled: (s) => s.active,
    run: (p) => p.shake(),
  },
  {
    id: 'play.undo',
    label: _('Undo'),
    group: 'play',
    enabled: (s) => s.active && s.canUndo,
    run: (p) => p.undo(),
  },
  {
    id: 'play.keep',
    label: _('Keep'),
    group: 'play',
    enabled: (s) => s.active,
    run: () => undefined,
  },
  {
    id: 'play.exit',
    label: _('Exit play'),
    group: 'play',
    enabled: () => true,
    run: (p) => p.exit(),
  },
];
