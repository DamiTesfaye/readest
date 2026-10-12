type Rgb = readonly [number, number, number];

export interface SparkPalette {
  colored: Record<string, Rgb>;
  muted: Record<string, Rgb>;
}

export interface SparkAnimation {
  src: string;
  stateMachine: string;
  nativeHover?: boolean;
  hoverProperty?: string;
  openTriggers?: string[];
  openHoverMs?: number;
  inset?: string;
  palette?: SparkPalette;
  mutedGrayscale?: boolean;
  stillUntilHovered?: boolean;
}

const RIVE_DIR = '/rive/spark';

const SPARK_ANIMATIONS: Record<string, SparkAnimation> = {
  'mood-modes': {
    src: `${RIVE_DIR}/mood-n-mode-new.riv`,
    stateMachine: 'Faces',
    nativeHover: true,
    stillUntilHovered: true,
    palette: {
      colored: {
        yellow: [0xf4, 0xb0, 0x08],
        blue: [0x00, 0xa3, 0xfe],
        purple: [0x8a, 0x2d, 0xfc],
        red: [0xd3, 0x2f, 0x2f],
        green: [0x98, 0xd9, 0x37],
        greenLid: [0x5e, 0x88, 0x1f],
        moustache: [0x31, 0x49, 0x0c],
      },
      muted: {
        yellow: [0xcc, 0xcc, 0xcc],
        blue: [0xb1, 0xb9, 0xc0],
        purple: [0x99, 0x99, 0x99],
        red: [0x47, 0x4a, 0x57],
        green: [0x97, 0xa9, 0xad],
        greenLid: [0x6b, 0x77, 0x79],
        moustache: [0x3a, 0x40, 0x42],
      },
    },
  },
  summarise: {
    src: `${RIVE_DIR}/summarize.riv`,
    stateMachine: 'Summarise',
    hoverProperty: 'hover',
    openHoverMs: 1800,
    inset: '-3.61% -3.7%',
    palette: {
      colored: {
        paper: [0xe1, 0xb3, 0x96],
        tape: [0xfe, 0xc8, 0x82],
        shadow: [0xca, 0xb8, 0xae],
        ink: [0x83, 0x52, 0x3f],
      },
      muted: {
        paper: [0xd9, 0xd9, 0xd9],
        tape: [0xcc, 0xcc, 0xcc],
        shadow: [0x99, 0x99, 0x99],
        ink: [0x47, 0x4a, 0x57],
      },
    },
  },
  discuss: {
    src: `${RIVE_DIR}/tim-n-fini.riv`,
    stateMachine: 'Hosts',
    hoverProperty: 'hover',
    openTriggers: ['laugh'],
    palette: {
      colored: { pill: [0xf0, 0x93, 0x6b] },
      muted: { pill: [0xd9, 0xd9, 0xd9] },
    },
  },
  margins: {
    src: `${RIVE_DIR}/margins.riv`,
    stateMachine: 'Margins',
    mutedGrayscale: true,
  },
};

export const getSparkAnimation = (icon: string): SparkAnimation | null =>
  SPARK_ANIMATIONS[icon] ?? null;

export const canHover = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
