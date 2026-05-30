import { useEffect, useRef, useState, useMemo } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPrice(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 10000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 100)   return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (value >= 1)     return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (value >= 0.01)  return value.toFixed(4);
  return value.toFixed(6);
}

function formatTime(timestamp, showDate, showYear) {
  if (!timestamp || !Number.isFinite(Number(timestamp))) return '';
  const date = new Date(Number(timestamp));
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  if (showYear) return `${month}/${date.getFullYear()}`;
  if (showDate) return `${month}/${day} ${hours}:${minutes}`;
  return `${hours}:${minutes}`;
}

//TECHNICAL INDICATORS COMPUTATION
function calculateSMA(candles, period) {
  const sma = new Array(candles.length).fill(null);
  if (candles.length < period) return sma;
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += Number(candles[i - j].close);
    sma[i] = sum / period;
  }
  return sma;
}

function calculateEMA(candles, period) {
  const ema = new Array(candles.length).fill(null);
  if (candles.length === 0) return ema;
  const k = 2 / (period + 1);
  let sum = 0;
  const seedPeriod = Math.min(period, candles.length);
  for (let i = 0; i < seedPeriod; i++) sum += Number(candles[i].close);
  let currentEma = sum / seedPeriod;
  ema[seedPeriod - 1] = currentEma;

  for (let i = seedPeriod; i < candles.length; i++) {
    currentEma = Number(candles[i].close) * k + currentEma * (1 - k);
    ema[i] = currentEma;
  }
  return ema;
}

function calculateBollingerBands(candles, period, stdDevMultiplier) {
  const upperBand = new Array(candles.length).fill(null);
  const lowerBand = new Array(candles.length).fill(null);
  const middleBand = calculateSMA(candles, period);
  if (candles.length < period) return { upper: upperBand, middle: middleBand, lower: lowerBand };

  for (let i = period - 1; i < candles.length; i++) {
    const avg = middleBand[i];
    if (avg === null) continue;
    let varianceSum = 0;
    for (let j = 0; j < period; j++) varianceSum += Math.pow(Number(candles[i - j].close) - avg, 2);
    const stdDev = Math.sqrt(varianceSum / period);
    upperBand[i] = avg + stdDevMultiplier * stdDev;
    lowerBand[i] = avg - stdDevMultiplier * stdDev;
  }
  return { upper: upperBand, middle: middleBand, lower: lowerBand };
}

function calculateRSI(candles, period = 14) {
  const rsi = new Array(candles.length).fill(null);
  if (candles.length <= period) return rsi;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = Number(candles[i].close) - Number(candles[i - 1].close);
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < candles.length; i++) {
    const diff = Number(candles[i].close) - Number(candles[i - 1].close);
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function calculateMACD(candles, fast = 12, slow = 26, signal = 9) {
  const macdLine = new Array(candles.length).fill(null);
  const signalLine = new Array(candles.length).fill(null);
  const histogram = new Array(candles.length).fill(null);

  const emaFast = calculateEMA(candles, fast);
  const emaSlow = calculateEMA(candles, slow);

  for (let i = 0; i < candles.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  const k = 2 / (signal + 1);
  let firstValidIdx = macdLine.findIndex(v => v !== null);
  if (firstValidIdx === -1) return { macd: macdLine, signal: signalLine, hist: histogram };

  let sum = 0, count = 0;
  for (let i = firstValidIdx; i < Math.min(firstValidIdx + signal, candles.length); i++) {
    if (macdLine[i] !== null) { sum += macdLine[i]; count++; }
  }
  let currentSignal = sum / (count || 1);
  const signalSeedEnd = firstValidIdx + (count || 1) - 1;
  if (signalSeedEnd < candles.length) signalLine[signalSeedEnd] = currentSignal;

  for (let i = signalSeedEnd + 1; i < candles.length; i++) {
    if (macdLine[i] !== null) {
      currentSignal = macdLine[i] * k + currentSignal * (1 - k);
      signalLine[i] = currentSignal;
      histogram[i] = macdLine[i] - currentSignal;
    }
  }

  return { macd: macdLine, signal: signalLine, hist: histogram };
}

function CandleChart({ candles, height = 340, activeIndicators = [] }) {
  const containerRef    = useRef(null);
  const dragStateRef    = useRef({ startX: 0, startViewStart: 0 });
  const prevMaxStartRef = useRef(0);

  const [viewStart, setViewStart]                         = useState(0);
  const [isDragging, setIsDragging]                       = useState(false);
  const [requestedVisibleCount, setRequestedVisibleCount] = useState(120);

  //CROSSHAIR 
  const [crosshair, setCrosshair] = useState(null);

  const paddingLeft  = 12;
  const paddingRight = 72;
  const paddingTop   = 18;
  const paddingBottom = 24; 

  const minVisibleCandles = 10;
  const maxVisibleCandles = 500;

  const safeCandles         = Array.isArray(candles) ? candles : [];
  const canRender           = safeCandles.length >= 2;
  const availableMaxVisible = Math.min(maxVisibleCandles, safeCandles.length);
  const visibleCount        = clamp(requestedVisibleCount, minVisibleCandles, Math.max(minVisibleCandles, availableMaxVisible));
  const maxStart = Math.max(0, safeCandles.length - visibleCount);

  const rsiConfig = useMemo(() => activeIndicators.find(i => i.type === 'rsi'), [activeIndicators]);
  const macdConfig = useMemo(() => activeIndicators.find(i => i.type === 'macd'), [activeIndicators]);

  const mainChartHeight = 300;
  const rsiPanelHeight = rsiConfig ? 90 : 0;
  const macdPanelHeight = macdConfig ? 90 : 0;
  const totalSvgHeight = mainChartHeight + rsiPanelHeight + macdPanelHeight + paddingBottom;

  const width = 1000;

  const indicatorsData = useMemo(() => {
    if (!canRender) return { overlays: [], rsi: null, macd: null };
    
    const overlays = activeIndicators.map((ind) => {
      if (ind.type === 'ma') return { id: ind.id, type: 'ma', color: ind.color || '#eab308', data: calculateSMA(safeCandles, ind.period || 20) };
      if (ind.type === 'bb') return { id: ind.id, type: 'bb', color: ind.color || '#ec4899', data: calculateBollingerBands(safeCandles, ind.period || 20, ind.stdDev || 2) };
      return null;
    }).filter(Boolean);

    return {
      overlays,
      rsi: rsiConfig ? calculateRSI(safeCandles, rsiConfig.period || 14) : null,
      macd: macdConfig ? calculateMACD(safeCandles, macdConfig.fast || 12, macdConfig.slow || 26, macdConfig.signal || 9) : null
    };
  }, [safeCandles, activeIndicators, canRender, rsiConfig, macdConfig]);

  useEffect(() => {
    if (!canRender) return;
    setRequestedVisibleCount((c) => clamp(c, minVisibleCandles, Math.max(minVisibleCandles, availableMaxVisible)));
  }, [availableMaxVisible, canRender]);

  useEffect(() => {
    if (!canRender) { prevMaxStartRef.current = 0; setViewStart(0); return; }
    setViewStart((current) => current === prevMaxStartRef.current ? maxStart : clamp(current, 0, maxStart));
    prevMaxStartRef.current = maxStart;
  }, [canRender, maxStart]);

  const currentStartIndex = clamp(viewStart, 0, maxStart);

  const visibleCandles = useMemo(() => {
    if (!canRender) return [];
    return safeCandles.slice(currentStartIndex, currentStartIndex + visibleCount);
  }, [canRender, safeCandles, currentStartIndex, visibleCount]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const handleWheel = (event) => {
      if (!canRender) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const ratio = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0.5;
      const anchorIndex = viewStart + ratio * visibleCount;
      const zoomOut = event.deltaY > 0;
      const factor = zoomOut ? 1.15 : 0.87;
      const nextVisible = clamp(Math.round(visibleCount * factor), minVisibleCandles, Math.max(minVisibleCandles, availableMaxVisible));
      setRequestedVisibleCount(nextVisible);
      setViewStart(clamp(Math.round(anchorIndex - ratio * nextVisible), 0, Math.max(0, safeCandles.length - nextVisible)));
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [availableMaxVisible, canRender, safeCandles.length, viewStart, visibleCount]);

  if (!canRender || visibleCandles.length < 2) {
    return <div className="empty-state">Collecting chart data…</div>;
  }

  const lows = visibleCandles.map((c) => Number(c.low)).filter(Number.isFinite);
  const highs = visibleCandles.map((c) => Number(c.high)).filter(Number.isFinite);
  const minValue = Math.min(...lows);
  const maxValue = Math.max(...highs);
  const range = maxValue - minValue || 1;
  const dispMin = minValue - range * 0.04;
  const dispMax = maxValue + range * 0.04;
  const dispRange = dispMax - dispMin || 1;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotMainHeight = mainChartHeight - paddingTop;
  const candleSlot = plotWidth / visibleCandles.length;
  const bodyWidth = clamp(candleSlot * 0.62, 1.5, 16);

  const scaleY = (value) => {
    const progress = (dispMax - clamp(value, dispMin, dispMax)) / dispRange;
    return paddingTop + progress * plotMainHeight;
  };

  const scaleYInverse = (pixelY) => {
    const progress = (pixelY - paddingTop) / plotMainHeight;
    return dispMax - progress * dispRange;
  };

  const rsiYTop = mainChartHeight;
  const scaleRsiY = (val) => {
    const innerH = rsiPanelHeight - 16;
    const progress = (100 - clamp(val, 0, 100)) / 100;
    return rsiYTop + 8 + progress * innerH;
  };

  const macdYTop = mainChartHeight + rsiPanelHeight;
  const visibleMacdData = useMemo(() => {
    if (!indicatorsData.macd) return { max: 1, min: -1 };
    const slice = [];
    for (let i = 0; i < visibleCandles.length; i++) {
      const idx = currentStartIndex + i;
      if (indicatorsData.macd.macd[idx] !== null) slice.push(indicatorsData.macd.macd[idx]);
      if (indicatorsData.macd.signal[idx] !== null) slice.push(indicatorsData.macd.signal[idx]);
      if (indicatorsData.macd.hist[idx] !== null) slice.push(indicatorsData.macd.hist[idx]);
    }
    if (slice.length === 0) return { max: 1, min: -1 };
    const max = Math.max(...slice), min = Math.min(...slice);
    const extreme = Math.max(Math.abs(max), Math.abs(min)) || 1;
    return { max: extreme, min: -extreme };
  }, [indicatorsData.macd, visibleCandles.length, currentStartIndex]);

  const scaleMacdY = (val) => {
    const innerH = macdPanelHeight - 16;
    const range = visibleMacdData.max - visibleMacdData.min || 1;
    const progress = (visibleMacdData.max - val) / range;
    return macdYTop + 8 + progress * innerH;
  };

  const priceAxisLabels = [];
  for (let i = 0; i <= 4; i++) {
    const price = dispMin + (dispRange * i) / 4;
    priceAxisLabels.push({ price, y: scaleY(price) });
  }

  const timelineTicks = useMemo(() => {
    const ticks = [];
    const maxLabels = 6;
    const stride = Math.max(1, Math.ceil(visibleCandles.length / maxLabels));
    const firstCandle = visibleCandles[0], lastCandle = visibleCandles[visibleCandles.length - 1];
    let showDate = false, showYear = false;
    if (firstCandle?.t && lastCandle?.t) {
      const firstDate = new Date(firstCandle.t), lastDate = new Date(lastCandle.t);
      if (firstDate.getFullYear() !== lastDate.getFullYear()) showYear = true;
      else if (firstDate.getDate() !== lastDate.getDate() || firstDate.getMonth() !== lastDate.getMonth()) showDate = true;
    }
    for (let i = 0; i < visibleCandles.length; i += stride) {
      const candle = visibleCandles[i];
      if (candle && candle.t) {
        ticks.push({ timestamp: candle.t, label: formatTime(candle.t, showDate, showYear), x: paddingLeft + i * candleSlot + candleSlot / 2 });
      }
    }
    return { ticks, showDate, showYear };
  }, [visibleCandles, candleSlot]);

  const renderLinePath = (dataArray, scaleFn) => {
    const points = [];
    for (let i = 0; i < visibleCandles.length; i++) {
      const val = dataArray[currentStartIndex + i];
      if (val !== null && val !== undefined && !isNaN(val)) {
        points.push(`${paddingLeft + i * candleSlot + candleSlot / 2},${scaleFn(val)}`);
      }
    }
    return points.length >= 2 ? points.join(' ') : null;
  };

  //HOVER
  const handlePointerMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    
    const svgX = (rawX / rect.width) * width;
    const svgY = (rawY / rect.height) * totalSvgHeight;

    if (svgX < paddingLeft || svgX > width - paddingRight) {
      setCrosshair(null);
      return;
    }

    const candleIdx = clamp(Math.floor((svgX - paddingLeft) / candleSlot), 0, visibleCandles.length - 1);
    const globalIdx = currentStartIndex + candleIdx;
    
    const snappedX = paddingLeft + candleIdx * candleSlot + candleSlot / 2;

    setCrosshair({ x: snappedX, y: svgY, candleIndex: candleIdx, globalIndex: globalIdx });
  };

  return (
    <div ref={containerRef} className="chart-shell">
      <svg 
        className="candle-chart" 
        viewBox={`0 0 ${width} ${totalSvgHeight}`} 
        preserveAspectRatio="none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none', display: 'block', width: '100%' }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !containerRef.current) return;
          dragStateRef.current = { startX: e.clientX, startViewStart: viewStart };
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsDragging(true);
        }}
        onPointerMove={(e) => {
          if (isDragging) {
            const shift = Math.round((e.clientX - dragStateRef.current.startX) / Math.max(1, containerRef.current.clientWidth / visibleCount));
            setViewStart(clamp(dragStateRef.current.startViewStart - shift, 0, maxStart));
            setCrosshair(null);
          } else {
            handlePointerMove(e);
          }
        }}
        onPointerUp={(e) => { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(_) {} setIsDragging(false); }}
        onPointerCancel={(e) => { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(_) {} setIsDragging(false); }}
        onPointerLeave={() => setCrosshair(null)}
      >
        {/* Main Panel grid boundaries */}
        {priceAxisLabels.map(({ price, y }, i) => (
          <g key={`p-${i}`}>
            <line x1={paddingLeft} x2={width - paddingRight} y1={y} y2={y} stroke="rgba(148,163,184,0.08)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <text x={width - paddingRight + 6} y={y + 4} fontSize={10} fill="rgba(148,163,184,0.65)" fontFamily="monospace">{formatPrice(price)}</text>
          </g>
        ))}

        {/* RSI Oscillator view segments */}
        {rsiConfig && indicatorsData.rsi && (
          <g key="rsi-panel">
            <line x1={paddingLeft} x2={width - paddingRight} y1={rsiYTop} y2={rsiYTop} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={paddingLeft} x2={width - paddingRight} y1={scaleRsiY(70)} y2={scaleRsiY(70)} stroke="rgba(239, 68, 68, 0.25)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <line x1={paddingLeft} x2={width - paddingRight} y1={scaleRsiY(30)} y2={scaleRsiY(30)} stroke="rgba(16, 185, 129, 0.25)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <text x={width - paddingRight + 6} y={scaleRsiY(70) + 3} fontSize={9} fill="rgba(239, 68, 68, 0.5)" fontFamily="monospace">70</text>
            <text x={width - paddingRight + 6} y={scaleRsiY(30) + 3} fontSize={9} fill="rgba(16, 185, 129, 0.5)" fontFamily="monospace">30</text>
            <text x={paddingLeft + 6} y={rsiYTop + 14} fontSize={10} fontWeight="bold" fill="#a855f7">RSI ({rsiConfig.period || 14})</text>
            
            {(() => {
              const path = renderLinePath(indicatorsData.rsi, scaleRsiY);
              return path ? <polyline fill="none" stroke="#a855f7" strokeWidth={1.5} points={path} vectorEffect="non-scaling-stroke" /> : null;
            })()}
          </g>
        )}

        {macdConfig && indicatorsData.macd && (
          <g key="macd-panel">
            <line x1={paddingLeft} x2={width - paddingRight} y1={macdYTop} y2={macdYTop} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={paddingLeft} x2={width - paddingRight} y1={scaleMacdY(0)} y2={scaleMacdY(0)} stroke="rgba(148,163,184,0.15)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={paddingLeft + 6} y={macdYTop + 14} fontSize={10} fontWeight="bold" fill="#06b6d4">MACD ({macdConfig.fast},{macdConfig.slow},{macdConfig.signal})</text>
            
            {visibleCandles.map((_, i) => {
              const idx = currentStartIndex + i;
              const hVal = indicatorsData.macd.hist[idx];
              if (hVal === null || isNaN(hVal)) return null;
              const x = paddingLeft + i * candleSlot + candleSlot / 2;
              return (
                <line key={`h-${i}`} x1={x} x2={x} y1={scaleMacdY(0)} y2={scaleMacdY(hVal)} stroke={hVal >= 0 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'} strokeWidth={Math.max(1, bodyWidth - 1)} vectorEffect="non-scaling-stroke" />
              );
            })}

            {(() => {
              const mPath = renderLinePath(indicatorsData.macd.macd, scaleMacdY);
              const sPath = renderLinePath(indicatorsData.macd.signal, scaleMacdY);
              return (
                <>
                  {mPath && <polyline fill="none" stroke="#06b6d4" strokeWidth={1.5} points={mPath} vectorEffect="non-scaling-stroke" />}
                  {sPath && <polyline fill="none" stroke="#eab308" strokeWidth={1.5} points={sPath} vectorEffect="non-scaling-stroke" />}
                </>
              );
            })()}
          </g>
        )}

        {indicatorsData.overlays.map((ind) => {
          if (ind.type === 'ma') {
            const p = renderLinePath(ind.data, scaleY);
            return p ? <polyline key={ind.id} fill="none" stroke={ind.color} strokeWidth={1.5} points={p} vectorEffect="non-scaling-stroke" /> : null;
          }
          if (ind.type === 'bb') {
            const u = renderLinePath(ind.data.upper, scaleY);
            const m = renderLinePath(ind.data.middle, scaleY);
            const l = renderLinePath(ind.data.lower, scaleY);
            return (
              <g key={ind.id}>
                {u && <polyline fill="none" stroke={ind.color} strokeWidth={1.25} strokeDasharray="2 2" points={u} vectorEffect="non-scaling-stroke" />}
                {m && <polyline fill="none" stroke={ind.color} strokeWidth={1.25} strokeDasharray="4 4" points={m} vectorEffect="non-scaling-stroke" />}
                {l && <polyline fill="none" stroke={ind.color} strokeWidth={1.25} strokeDasharray="2 2" points={l} vectorEffect="non-scaling-stroke" />}
              </g>
            );
          }
          return null;
        })}

        {/* Candles */}
        {visibleCandles.map((candle, idx) => {
          const open = Number(candle.open), close = Number(candle.close), high = Number(candle.high), low = Number(candle.low);
          if (![open, close, high, low].every(Number.isFinite)) return null;
          const isUp = close >= open;
          const centerX = paddingLeft + idx * candleSlot + candleSlot / 2;
          const bodyTop = Math.min(scaleY(open), scaleY(close));
          const bodyH = Math.max(1.5, Math.abs(scaleY(open) - scaleY(close)));

          return (
            <g key={candle.t ?? idx} className={isUp ? 'candle candle--up' : 'candle candle--down'}>
              <line x1={centerX} x2={centerX} y1={scaleY(high)} y2={scaleY(low)} vectorEffect="non-scaling-stroke" />
              <rect x={centerX - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyH} rx={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}

        {/* Timeline bottom X-axis lines */}
        {timelineTicks.ticks.map((tick, i) => (
          <g key={`time-${i}`}>
            <line x1={tick.x} x2={tick.x} y1={paddingTop} y2={totalSvgHeight - paddingBottom} stroke="rgba(148,163,184,0.03)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={tick.x} y={totalSvgHeight - paddingBottom + 14} fontSize={10} fill="rgba(148,163,184,0.5)" fontFamily="monospace" textAnchor="middle">{tick.label}</text>
          </g>
        ))}

        {/*LIVE CROSSHAIR*/}
        {crosshair && visibleCandles[crosshair.candleIndex] && (
          <g key="crosshair-hud-layer" style={{ pointerEvents: 'none' }}>
            <line 
              x1={crosshair.x} x2={crosshair.x} 
              y1={paddingTop} y2={totalSvgHeight - paddingBottom} 
              stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke" 
            />

            {crosshair.y <= mainChartHeight && (
              <>
                <line 
                  x1={paddingLeft} x2={width - paddingRight} 
                  y1={crosshair.y} y2={crosshair.y} 
                  stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke" 
                />
                <g transform={`translate(${width - paddingRight}, ${crosshair.y - 8})`}>
                  <rect width={68} height={16} rx={2} fill="#1e293b" stroke="var(--border)" strokeWidth={1} />
                  <text x={4} y={11} fontSize={9} fill="#f8fafc" fontFamily="monospace">
                    {formatPrice(scaleYInverse(crosshair.y))}
                  </text>
                </g>
              </>
            )}

            {rsiConfig && indicatorsData.rsi && (
              (() => {
                const rsiVal = indicatorsData.rsi[crosshair.globalIndex];
                if (rsiVal === null || isNaN(rsiVal)) return null;
                const rsiPixelY = scaleRsiY(rsiVal);
                return (
                  <g>
                    <circle cx={crosshair.x} cy={rsiPixelY} r={3.5} fill="#a855f7" />
                    <g transform={`translate(${width - paddingRight}, ${rsiPixelY - 8})`}>
                      <rect width={40} height={16} rx={2} fill="#a855f7" />
                      <text x={4} y={11} fontSize={9} fontWeight="bold" fill="#07111f" fontFamily="monospace">
                        {rsiVal.toFixed(1)}
                      </text>
                    </g>
                  </g>
                );
              })()
            )}

            {macdConfig && indicatorsData.macd && (
              (() => {
                const mLineVal = indicatorsData.macd.macd[crosshair.globalIndex];
                if (mLineVal === null || isNaN(mLineVal)) return null;
                const macdPixelY = scaleMacdY(mLineVal);
                return (
                  <g>
                    <circle cx={crosshair.x} cy={macdPixelY} r={3.5} fill="#06b6d4" />
                    <g transform={`translate(${width - paddingRight}, ${macdPixelY - 8})`}>
                      <rect width={48} height={16} rx={2} fill="#06b6d4" />
                      <text x={4} y={11} fontSize={9} fontWeight="bold" fill="#07111f" fontFamily="monospace">
                        {mLineVal.toFixed(2)}
                      </text>
                    </g>
                  </g>
                );
              })()
            )}

            {(() => {
              const candle = visibleCandles[crosshair.candleIndex];
              return candle?.t ? (
                <g transform={`translate(${crosshair.x - 45}, ${totalSvgHeight - paddingBottom})`}>
                  <rect width={90} height={16} rx={2} fill="#64748b" />
                  <text x={45} y={11} fontSize={9} fontWeight="bold" fill="#07111f" fontFamily="monospace" textAnchor="middle">
                    {formatTime(candle.t, timelineTicks.showDate, timelineTicks.showYear)}
                  </text>
                </g>
              ) : null;
            })()}
          </g>
        )}
      </svg>

      {safeCandles.length > visibleCount && (
        <div className="chart-scrollbar" style={{ bottom: '26px' }}>
          <div className="chart-scrollbar-thumb" style={{ left: `${(viewStart / safeCandles.length) * 100}%`, width: `${(visibleCount / safeCandles.length) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export default CandleChart;