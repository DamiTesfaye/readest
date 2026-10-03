export interface CaretMetrics {
  textWidth: number;
  scrollLeft: number;
  contentWidth: number;
  rtl: boolean;
}

export const computeLookX = ({
  textWidth,
  scrollLeft,
  contentWidth,
  rtl,
}: CaretMetrics): number => {
  const caretOffset = textWidth - Math.abs(scrollLeft);
  const ratio = caretOffset / Math.max(contentWidth, 1);
  const fromStartEdge = Math.min(Math.max(ratio * 2 - 1, -1), 1);
  return rtl ? -fromStartEdge : fromStartEdge;
};
