export function SvgIcon({ d, size, viewBox }) {
  const s = size || 15;
  return (
    <svg
      width={s}
      height={s}
      viewBox={viewBox || '0 0 24 24'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}
