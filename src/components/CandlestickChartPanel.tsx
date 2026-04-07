import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts'
import { useEffect, useMemo, useRef } from 'react'

/** Logical bars in the viewport — width stays stable; tail scrolls as new data arrives. */
const VisibleBarCount = 50
/** Default bar width in pixels (user can still zoom with wheel / gestures). */
const DefaultBarSpacing = 8

type ChartPoint = CandlestickData | { time: CandlestickData['time'] }

/**
 * Until there are enough real candles, prepend whitespace so the time scale always
 * spans `VisibleBarCount` slots. Otherwise 1–2 candles stretch full-width and look
 * "fat", then shrink as more bars arrive.
 */
function PadCandlesForViewport(Bars: CandlestickData[], Target: number): ChartPoint[] {
  if (Bars.length === 0) return []
  if (Bars.length >= Target) return Bars
  const First = Bars[0]
  const T0 = typeof First.time === 'number' ? First.time : 0
  const Pad = Target - Bars.length
  const Leading: { time: CandlestickData['time'] }[] = []
  for (let K = Pad; K >= 1; K--) {
    Leading.push({ time: (T0 - K) as CandlestickData['time'] })
  }
  return [...Leading, ...Bars]
}

type CandlestickChartPanelProps = {
  Bars: CandlestickData[]
  GhostBars?: CandlestickData[]
  IsDark: boolean
}

function ApplyTailWindow(Chart: IChartApi, DisplayPointCount: number) {
  if (DisplayPointCount === 0) return
  const Last = DisplayPointCount - 1
  const From = Math.max(0, Last - (VisibleBarCount - 1))
  Chart.timeScale().applyOptions({
    barSpacing: DefaultBarSpacing,
    minBarSpacing: 0.5,
    maxBarSpacing: 0,
    fixLeftEdge: false,
    fixRightEdge: false,
    lockVisibleTimeRangeOnResize: true,
  })
  Chart.timeScale().setVisibleLogicalRange({ from: From, to: Last })
}

export function CandlestickChartPanel({
  Bars,
  GhostBars,
  IsDark,
}: CandlestickChartPanelProps) {
  const ContainerRef = useRef<HTMLDivElement>(null)
  const ChartRef = useRef<IChartApi | null>(null)
  const SeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const GhostSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  /** User panned/zoomed — do not snap back to the tail on each tick. */
  const UserAdjustedViewRef = useRef(false)
  /** Ignore range changes caused by our own `ApplyTailWindow`. */
  const ProgrammaticScrollRef = useRef(false)

  const DisplayBars = useMemo(
    () => PadCandlesForViewport(Bars, VisibleBarCount),
    [Bars],
  )
  const DisplayBarsRef = useRef(DisplayBars)
  DisplayBarsRef.current = DisplayBars

  const ApplyTailIfFollowing = (Chart: IChartApi, DisplayPointCount: number) => {
    if (UserAdjustedViewRef.current) return
    ProgrammaticScrollRef.current = true
    try {
      ApplyTailWindow(Chart, DisplayPointCount)
    } finally {
      queueMicrotask(() => {
        ProgrammaticScrollRef.current = false
      })
    }
  }

  useEffect(() => {
    const El = ContainerRef.current
    if (!El) return

    const Bg = IsDark ? '#131722' : '#ffffff'
    const Text = IsDark ? '#d1d4dc' : '#131722'
    const Grid = IsDark ? '#363a45' : '#e0e3eb'

    const Chart = createChart(El, {
      layout: {
        background: { type: ColorType.Solid, color: Bg },
        textColor: Text,
      },
      grid: {
        vertLines: { color: Grid },
        horzLines: { color: Grid },
      },
      rightPriceScale: { borderColor: Grid },
      timeScale: {
        borderColor: Grid,
        timeVisible: true,
        secondsVisible: true,
        barSpacing: DefaultBarSpacing,
        minBarSpacing: 0.5,
        maxBarSpacing: 0,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: {
        vertLine: { labelBackgroundColor: '#2962ff' },
        horzLine: { labelBackgroundColor: '#2962ff' },
      },
      autoSize: true,
    })

    const Series = Chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    const GhostUp = IsDark ? 'rgba(140, 150, 175, 0.42)' : 'rgba(100, 108, 128, 0.4)'
    const GhostDown = IsDark ? 'rgba(140, 150, 175, 0.42)' : 'rgba(100, 108, 128, 0.4)'
    const GhostWick = IsDark ? 'rgba(160, 168, 190, 0.5)' : 'rgba(90, 96, 118, 0.45)'

    const GhostSeries = Chart.addSeries(CandlestickSeries, {
      upColor: GhostUp,
      downColor: GhostDown,
      borderVisible: false,
      wickUpColor: GhostWick,
      wickDownColor: GhostWick,
    })

    ChartRef.current = Chart
    SeriesRef.current = Series
    GhostSeriesRef.current = GhostSeries

    const Ts = Chart.timeScale()
    const OnVisibleLogicalRangeChange = (
      Range: { from: number; to: number } | null,
    ) => {
      if (ProgrammaticScrollRef.current) return
      if (Range === null) return
      UserAdjustedViewRef.current = true
    }
    Ts.subscribeVisibleLogicalRangeChange(OnVisibleLogicalRangeChange)

    const Initial = DisplayBarsRef.current
    if (Initial.length > 0) {
      Series.setData(Initial)
      ApplyTailIfFollowing(Chart, Initial.length)
    }

    const GhostInitial = GhostBars ?? []
    if (GhostInitial.length > 0) {
      GhostSeries.setData(GhostInitial)
    }

    const Ro = new ResizeObserver(() => {
      const C = ChartRef.current
      const L = DisplayBarsRef.current.length
      if (C && L > 0) ApplyTailIfFollowing(C, L)
    })
    Ro.observe(El)

    return () => {
      Ts.unsubscribeVisibleLogicalRangeChange(OnVisibleLogicalRangeChange)
      Ro.disconnect()
      Chart.remove()
      ChartRef.current = null
      SeriesRef.current = null
      GhostSeriesRef.current = null
    }
  }, [IsDark])

  useEffect(() => {
    const Series = SeriesRef.current
    const Chart = ChartRef.current
    if (!Series || !Chart) return
    if (DisplayBars.length === 0) {
      Series.setData([])
      return
    }
    Series.setData(DisplayBars)
    ApplyTailIfFollowing(Chart, DisplayBars.length)
  }, [DisplayBars])

  useEffect(() => {
    const GhostSeries = GhostSeriesRef.current
    if (!GhostSeries) return
    const Data = GhostBars ?? []
    GhostSeries.setData(Data)
    const Chart = ChartRef.current
    const L = DisplayBarsRef.current.length
    if (Chart && L > 0) ApplyTailIfFollowing(Chart, L)
  }, [GhostBars])

  return <div className="ChartHost" ref={ContainerRef} />
}
