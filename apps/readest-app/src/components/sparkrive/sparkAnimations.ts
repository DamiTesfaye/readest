export interface SparkAnimation {
  src: string;
  stateMachine: string;
  nativeHover?: boolean;
  hoverProperty?: string;
  openTriggers?: string[];
  openHoverMs?: number;
  inset?: string;
}

const RIVE_DIR = '/rive/spark';

const SPARK_ANIMATIONS: Record<string, SparkAnimation> = {
  'mood-modes': {
    src: `${RIVE_DIR}/mood-n-mode-new.riv`,
    stateMachine: 'Faces',
    nativeHover: true,
    openTriggers: ['yellowTap', 'blueTap', 'purpleTap', 'redTap', 'greenTap'],
  },
  summarise: {
    src: `${RIVE_DIR}/summarize.riv`,
    stateMachine: 'Summarise',
    hoverProperty: 'hover',
    openHoverMs: 1800,
    inset: '-3.61% -3.7%',
  },
  discuss: {
    src: `${RIVE_DIR}/tim-n-fini.riv`,
    stateMachine: 'Hosts',
    hoverProperty: 'hover',
    openTriggers: ['laugh'],
  },
  margins: {
    src: `${RIVE_DIR}/margins.riv`,
    stateMachine: 'Margins',
  },
};

export const getSparkAnimation = (icon: string): SparkAnimation | null =>
  SPARK_ANIMATIONS[icon] ?? null;

export const canHover = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
