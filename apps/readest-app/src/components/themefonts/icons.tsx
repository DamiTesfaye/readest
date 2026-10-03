const ACCENT = '#1460F7';

interface IconProps {
  className?: string;
}

export const ChevronDownIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 11 7' fill='none' className={className} aria-hidden='true'>
    <path
      d='M8.50591 1.68745L5.65417 4.92328C5.26868 5.36069 4.5862 5.35859 4.20341 4.91882L1.6875 2.02837'
      stroke='currentColor'
      strokeWidth='2.4'
      strokeLinecap='round'
    />
  </svg>
);

export const LineHeightIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 32 30' fill='none' className={className} aria-hidden='true'>
    <path
      d='M11.0918 16.3438H20.5974'
      stroke={ACCENT}
      strokeWidth='2.712'
      strokeMiterlimit='10'
      strokeLinecap='round'
    />
    <path
      d='M7.91797 22.262L14.6844 8.35262C15.0505 7.60521 15.2404 7.22518 15.4845 7.11116C15.7014 7.00982 15.9591 7.00982 16.1896 7.11116C16.4472 7.22518 16.6235 7.60521 16.9896 8.35262L23.7561 22.262'
      stroke={ACCENT}
      strokeWidth='2.712'
      strokeMiterlimit='10'
      strokeLinecap='round'
    />
    <path
      d='M30.1027 28.1758H1.58594M30.1027 1.55078H1.58594'
      stroke='currentColor'
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const LetterSpacingIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 32 28' fill='none' className={className} aria-hidden='true'>
    <path
      d='M11.4404 11.3516H20.946'
      stroke={ACCENT}
      strokeWidth='2.712'
      strokeMiterlimit='10'
      strokeLinecap='round'
    />
    <path
      d='M8.2666 17.6859L15.0331 2.79696C15.3992 1.99692 15.589 1.59012 15.8331 1.46808C16.0501 1.3596 16.3077 1.3596 16.5382 1.46808C16.7959 1.59012 16.9721 1.99692 17.3383 2.79696L24.1047 17.6859'
      stroke={ACCENT}
      strokeWidth='2.712'
      strokeMiterlimit='10'
      strokeLinecap='round'
    />
    <path
      d='M3.93753 26.4497L1.51066 24.3109C1.1826 24.0218 1.18418 23.51 1.51401 23.2229L3.68184 21.3359M27.9091 26.4497L30.3359 24.3109C30.664 24.0218 30.6624 23.51 30.3326 23.2229L28.1647 21.3359M1.61429 23.8671H30.1807'
      stroke='currentColor'
      strokeWidth='2.5312'
      strokeLinecap='round'
    />
  </svg>
);

export const WordSpacingIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 32 26' fill='none' className={className} aria-hidden='true'>
    <path
      d='M19.6775 1.35547H1.35645M29.8732 1.35547H24.2578M10.517 16.7812H1.35645M29.8023 16.7812L14.374 16.7812M6.65992 9.07031L1.35645 9.07031M29.8725 9.07031H23.0518'
      stroke='currentColor'
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <path
      d='M16.3026 24.4961H1.35645M19.6772 9.07031L10.5166 9.07031'
      stroke={ACCENT}
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const MarginIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 30 20' fill='none' className={className} aria-hidden='true'>
    <rect
      x='1.4'
      y='1.4'
      width='27.1'
      height='17'
      rx='1.93'
      stroke='currentColor'
      strokeWidth='2.8'
    />
  </svg>
);

export const MarginTopIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 32 20' fill='none' className={className} aria-hidden='true'>
    <path
      d='M1.83789 1.82422V4.30377V9.26286V19.181H29.8017V9.26286V4.30377V1.82422'
      stroke='currentColor'
      strokeWidth='0.482134'
      strokeDasharray='1.45 1.45'
    />
    <path
      d='M29.8722 1.35547H1.35547'
      stroke='currentColor'
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const MarginBottomIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 32 20' fill='none' className={className} aria-hidden='true'>
    <path
      d='M1.83789 17.5977V15.1181V10.159V0.240826H29.8017V10.159V15.1181V17.5977'
      stroke='currentColor'
      strokeWidth='0.482134'
      strokeDasharray='1.45 1.45'
    />
    <path
      d='M29.8722 18.0625H1.35547'
      stroke='currentColor'
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const MarginLeftIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 30 21' fill='none' className={className} aria-hidden='true'>
    <path
      d='M2.08789 18.418H5.97806H13.7584H29.3191V1.39769H13.7584H5.97806H2.08789'
      stroke='currentColor'
      strokeWidth='0.482134'
      strokeDasharray='1.45 1.45'
    />
    <path
      d='M1.35547 1.35411V18.7109'
      stroke='currentColor'
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const MarginRightIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 30 21' fill='none' className={className} aria-hidden='true'>
    <path
      d='M27.4727 18.418H23.5825H15.8022H0.241491V1.39769H15.8022H23.5825H27.4727'
      stroke='currentColor'
      strokeWidth='0.482134'
      strokeDasharray='1.45 1.45'
    />
    <path
      d='M28.2051 1.35411V18.7109'
      stroke='currentColor'
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const NoOfColumnsIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 25 27' fill='none' className={className} aria-hidden='true'>
    <path
      d='M23.0533 9.07031L12.7363 9.07031M1.35617 8.94922L9.07031 8.94922M23.5353 1.35547H3.91602M23.5356 16.3867H10.9961M23.5336 24.832H1.35547'
      stroke='currentColor'
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <path
      d='M7.33272 16.6641H1.35742'
      stroke={ACCENT}
      strokeWidth='2.712'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

export const GearIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 18 19' fill='none' className={className} aria-hidden='true'>
    <path
      d='M15.5121 9.92594C15.5482 9.63666 15.5753 9.34738 15.5753 9.04002C15.5753 8.73266 15.5482 8.44338 15.5121 8.1541L17.4195 6.66249C17.5913 6.52689 17.6365 6.28281 17.528 6.08393L15.72 2.95609C15.6115 2.75721 15.3674 2.68489 15.1685 2.75721L12.9176 3.66121C12.4475 3.29961 11.9413 3.00129 11.3898 2.77529L11.0463 0.379681C11.0192 0.16272 10.8293 0 10.6033 0H6.98733C6.76133 0 6.57149 0.16272 6.54437 0.379681L6.20085 2.77529C5.64941 3.00129 5.14316 3.30865 4.67308 3.66121L2.42212 2.75721C2.2142 2.67585 1.97916 2.75721 1.87068 2.95609L0.0626758 6.08393C-0.0548444 6.28281 -0.00060416 6.52689 0.171156 6.66249L2.0786 8.1541C2.04244 8.44338 2.01532 8.7417 2.01532 9.04002C2.01532 9.33834 2.04244 9.63666 2.0786 9.92594L0.171156 11.4175C-0.00060416 11.5531 -0.0458043 11.7972 0.0626758 11.9961L1.87068 15.1239C1.97916 15.3228 2.22324 15.3951 2.42212 15.3228L4.67308 14.4188C5.14316 14.7804 5.64941 15.0787 6.20085 15.3047L6.54437 17.7004C6.57149 17.9173 6.76133 18.08 6.98733 18.08H10.6033C10.8293 18.08 11.0192 17.9173 11.0463 17.7004L11.3898 15.3047C11.9413 15.0787 12.4475 14.7714 12.9176 14.4188L15.1685 15.3228C15.3765 15.4042 15.6115 15.3228 15.72 15.1239L17.528 11.9961C17.6365 11.7972 17.5913 11.5531 17.4195 11.4175L15.5121 9.92594ZM8.79533 12.204C7.05061 12.204 5.63133 10.7847 5.63133 9.04002C5.63133 7.29529 7.05061 5.87601 8.79533 5.87601C10.5401 5.87601 11.9593 7.29529 11.9593 9.04002C11.9593 10.7847 10.5401 12.204 8.79533 12.204Z'
      fill='currentColor'
    />
  </svg>
);

export const ColumnGapsIcon = ({ className }: IconProps) => (
  <svg viewBox='0 0 34 28' fill='none' className={className} aria-hidden='true'>
    <path
      d='M1.01712 6.80078L6.80273 6.80078M13.6077 1.01562L2.9375 1.01562M14.0356 12.5859L8.25 12.5859M5.49905 12.5859H1.01758M14.0352 18.3711H1.01758M19.8218 6.80078L25.6074 6.80078M28.3584 6.80078H32.8398M19.8222 1.01562H32.8398M26.8738 12.9492L24.5234 12.9492M22.1697 12.9492L19.8223 12.9492M32.4448 12.9492H29.4258'
      stroke='currentColor'
      strokeWidth='2.034'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <path
      d='M9.55471 6.80078H13.6094M20.2497 18.3711L30.9199 18.3711'
      stroke={ACCENT}
      strokeWidth='2.034'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <path
      d='M11.0332 26.4007L9.81978 25.3313C9.65576 25.1867 9.65654 24.9308 9.82146 24.7872L10.9054 23.8438M23.019 26.4007L24.2324 25.3313C24.3964 25.1867 24.3957 24.9308 24.2307 24.7872L23.1468 23.8438M9.8716 25.1094H24.1548'
      stroke='currentColor'
      strokeWidth='1.2656'
      strokeLinecap='round'
    />
  </svg>
);
