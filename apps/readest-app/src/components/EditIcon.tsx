import { IconBaseProps } from 'react-icons';
import { GenIcon } from 'react-icons/lib';

export function EditIcon(props: IconBaseProps) {
  return GenIcon({
    tag: 'svg',
    attr: {
      viewBox: '0 0 14 14',
      fill: 'none',
    },
    child: [
      {
        tag: 'path',
        attr: {
          d: 'M2.8426 9.32702C2.94765 9.14868 3.07487 8.98436 3.22124 8.83799L10.2566 1.80259C10.6393 1.41997 11.2596 1.41997 11.6423 1.80259C12.0249 2.18522 12.0249 2.80557 11.6423 3.1882L4.60684 10.2236C4.46048 10.37 4.29617 10.4972 4.11783 10.6022L2.10429 11.7882C1.81345 11.9595 1.4853 11.6314 1.65661 11.3405L2.8426 9.32702Z',
          stroke: 'currentColor',
          strokeWidth: '1',
        },
        child: [],
      },
      {
        tag: 'path',
        attr: {
          d: 'M6.1875 11.8911L7.14139 11.2702C7.80372 10.8391 8.67216 10.9024 9.26505 11.4249C9.88945 11.9751 10.8139 12.0128 11.481 11.5151L12.2344 10.9531',
          stroke: 'currentColor',
          strokeWidth: '0.703125',
          strokeLinecap: 'round',
        },
        child: [],
      },
    ],
  })(props);
}
