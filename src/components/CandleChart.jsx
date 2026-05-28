import { useEffect, useRef, useState, useMemo } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPrice(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 10000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 100)   return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (value >= 1)     return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (value >= 0.01)  return value.toFixed(6);
  return value.toExponential(3);
}

function CandleChart({ candles, height = 340 }) {
  const containerRef    = useRef(null);
  const dragStateRef    = useRef({ startX: 0, startViewStart: 0 });
  const prevMaxStartRef = useRef(0);

  const [viewStart, setViewStart]                         = useState(0);
  const [isDragging, setIsDragging]                       = useState(false);
  const [requestedVisibleCount, setRequestedVisibleCount] = useState(120);

  const width        = 1000;
  const paddingLeft  = 12;
  const paddingRight = 72;
  const paddingY     = 18;

  const minVisibleCandles = 10;
  const maxVisibleCandles = 500;

  const safeCandles         = Array.isArray(candles) ? candles : [];
  const canRender           = safeCandles.length >= 2;
  const availableMaxVisible = Math.min(maxVisibleCandles, safeCandles.length);
  const visibleCount        = clamp(
    requestedVisibleCount,
    minVisibleCandles,
    Math.max(minVisibleCandles, availableMaxVisible),
  );
  const maxStart = Math.max(0, safeCandles.length - visibleCount);

  // ── All hooks must come before any early return ─────────────────────────────

  useEffect(() => {
    if (!canRender) return;
    setRequestedVisibleCount((c) =>
      clamp(c, minVisibleCandles, Math.max(minVisibleCandles, availableMaxVisible)),
    );
  }, [availableMaxVisible, canRender]);

  useEffect(() => {
    if (!canRender) {
      prevMaxStartRef.current = 0;
      setViewStart(0);
      return;
    }
    setViewStart((current) => {
      if (current === prevMaxStartRef.current) return maxStart;
      return clamp(current, 0, maxStart);
    });
    prevMaxStartRef.current = maxStart;
  }, [canRender, maxStart]);

  const visibleCandles = useMemo(() => {
    if (!canRender) return [];
    const start = clamp(viewStart, 0, maxStart);
    return safeCandles.slice(start, start + visibleCount);
  }, [canRender, maxStart, safeCandles, viewStart, visibleCount]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const handleWheel = (event) => {
      if (!canRender) return;
      event.preventDefault();

      const rect        = element.getBoundingClientRect();
      const ratio       = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0.5;
      const anchorIndex = viewStart + ratio * visibleCount;

      const zoomOut     = event.deltaY > 0;
      const factor      = zoomOut ? 1.15 : 0.87;
      const nextVisible = clamp(
        Math.round(visibleCount * factor),
        minVisibleCandles,
        Math.max(minVisibleCandles, availableMaxVisible),
      );
      const nextMaxStart = Math.max(0, safeCandles.length - nextVisible);
      const nextStart    = clamp(Math.round(anchorIndex - ratio * nextVisible), 0, nextMaxStart);

      setRequestedVisibleCount(nextVisible);
      setViewStart(nextStart);
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [availableMaxVisible, canRender, safeCandles.length, viewStart, visibleCount]);

  // ── Early return AFTER all hooks ────────────────────────────────────────────
  if (!canRender || visibleCandles.length < 2) {
    return <div className="empty-state">Collecting chart data…</div>;
  }

  // ── Derived layout values (not hooks, safe after early return) ──────────────
  const lows     = visibleCandles.map((c) => Number(c.low)).filter(Number.isFinite);
  const highs    = visibleCandles.map((c) => Number(c.high)).filter(Number.isFinite);
  const minValue = Math.min(...lows);
  const maxValue = Math.max(...highs);
  const range    = maxValue - minValue || 1;

  const dispMin   = minValue - range * 0.04;
  const dispMax   = maxValue + range * 0.04;
  const dispRange = dispMax - dispMin || 1;

  const plotWidth  = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingY * 2;
  const candleSlot = plotWidth / visibleCandles.length;
  const bodyWidth  = clamp(candleSlot * 0.62, 1.5, 16);

  const scaleY = (value) => {
    const progress = (dispMax - clamp(value, dispMin, dispMax)) / dispRange;
    return paddingY + progress * plotHeight;
  };

  // Price axis labels — plain computation, no useMemo needed (cheap)
  const priceAxisLabels = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const price = dispMin + (dispRange * i) / tickCount;
    priceAxisLabels.push({ price, y: scaleY(price) });
  }

  return (
    <div
      ref={containerRef}
      className="chart-shell"
      style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !containerRef.current) return;
        dragStateRef.current = { startX: e.clientX, startViewStart: viewStart };
        containerRef.current.setPointerCapture(e.pointerId);
        setIsDragging(true);
      }}
      onPointerMove={(e) => {
        if (!isDragging || !containerRef.current) return;
        const { startX, startViewStart } = dragStateRef.current;
        const pxPerCandle = Math.max(1, containerRef.current.clientWidth / visibleCount);
        const shift       = Math.round((e.clientX - startX) / pxPerCandle);
        setViewStart(clamp(startViewStart - shift, 0, maxStart));
      }}
      onPointerUp={()     => setIsDragging(false)}
      onPointerCancel={() => setIsDragging(false)}
    >
      <svg
        className="candle-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {/* Grid lines + price axis */}
        {priceAxisLabels.map(({ price, y }, i) => (
          <g key={i}>
            <line
              x1={paddingLeft} x2={width - paddingRight}
              y1={y} y2={y}
              stroke="rgba(148,163,184,0.1)"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={width - paddingRight + 6}
              y={y + 4}
              fontSize={10}
              fill="rgba(148,163,184,0.65)"
              fontFamily="monospace"
              textAnchor="start"
            >
              {formatPrice(price)}
            </text>
          </g>
        ))}

        {/* Candles */}
        {visibleCandles.map((candle, idx) => {
          const open  = Number(candle.open);
          const close = Number(candle.close);
          const high  = Number(candle.high);
          const low   = Number(candle.low);
          if (![open, close, high, low].every(Number.isFinite)) return null;

          const isUp    = close >= open;
          const centerX = paddingLeft + idx * candleSlot + candleSlot / 2;
          const yOpen   = scaleY(open);
          const yClose  = scaleY(close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH   = Math.max(1.5, Math.abs(yOpen - yClose));

          return (
            <g key={candle.t ?? idx} className={isUp ? 'candle candle--up' : 'candle candle--down'}>
              <line x1={centerX} x2={centerX} y1={scaleY(high)} y2={scaleY(low)} />
              <rect
                x={centerX - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyH}
                rx={1.5}
              />
            </g>
          );
        })}
      </svg>

      {/* Scroll position indicator */}
      {safeCandles.length > visibleCount && (
        <div className="chart-scrollbar">
          <div
            className="chart-scrollbar-thumb"
            style={{
              left:  `${(viewStart / safeCandles.length) * 100}%`,
              width: `${(visibleCount / safeCandles.length) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default CandleChart;