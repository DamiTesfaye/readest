import { IconBaseProps } from 'react-icons';
import { GenIcon } from 'react-icons/lib';

export function ShareIcon(props: IconBaseProps) {
  return GenIcon({
    tag: 'svg',
    attr: {
      viewBox: '0 0 18 18',
      fill: 'none',
    },
    child: [
      {
        tag: 'path',
        attr: {
          d: 'M12.375 10.6875L15.75 7.3125L12.375 3.9375',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        child: [],
      },
      {
        tag: 'path',
        attr: {
          d: 'M13.5 15.1875H2.8125C2.66332 15.1875 2.52024 15.1282 2.41475 15.0227C2.30926 14.9173 2.25 14.7742 2.25 14.625V6.1875',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        child: [],
      },
      {
        tag: 'path',
        attr: {
          d: 'M5.2749 12.375C5.64953 10.926 6.49489 9.64256 7.67818 8.72623C8.86147 7.8099 10.3156 7.31261 11.8122 7.3125H15.7497',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        child: [],
      },
    ],
  })(props);
}
