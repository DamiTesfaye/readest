import React, { CSSProperties } from 'react';

export type ArtShape = readonly [fill: string, d: string, opacity?: number];

export interface ArtSegment<Part extends string> {
  part?: Part;
  shapes: readonly ArtShape[];
}

const renderShapes = (shapes: readonly ArtShape[]) =>
  shapes.map(([fill, d, opacity]) => (
    <path key={`${fill}${d}${opacity ?? ''}`} d={d} fill={fill} opacity={opacity} />
  ));

export const renderSegments = <Part extends string>(
  segments: readonly ArtSegment<Part>[],
  partStyle: (part: Part) => CSSProperties | undefined,
) =>
  segments.map(({ part, shapes }) =>
    part ? (
      <g key={`${part}${shapes[0]?.[1]}`} data-part={part} style={partStyle(part)}>
        {renderShapes(shapes)}
      </g>
    ) : (
      <React.Fragment key={shapes[0]?.[1]}>{renderShapes(shapes)}</React.Fragment>
    ),
  );
