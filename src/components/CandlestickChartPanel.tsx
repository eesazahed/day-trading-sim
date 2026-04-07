import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'

type CandlestickChartPanelProps = {
  Bars: CandlestickData[]
  IsDark: boolean
}

export function CandlestickChartPanel({
  Bars,
  IsDark,
}: CandlestickChartPanelProps) {
  const ContainerRef = useRef<HTMLDivElement>(null)
  const ChartRef = useRef<IChartApi | null>(null)
  const SeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const BarsRef = useRef(Bars)
  BarsRef.current = Bars

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

    ChartRef.current = Chart
    SeriesRef.current = Series
    const Initial = BarsRef.current
    if (Initial.length > 0) {
      Series.setData(Initial)
      Chart.timeScale().fitContent()
    }

    const Ro = new ResizeObserver(() => {
      Chart.timeScale().fitContent()
    })
    Ro.observe(El)

    return () => {
      Ro.disconnect()
      Chart.remove()
      ChartRef.current = null
      SeriesRef.current = null
    }
  }, [IsDark])

  useEffect(() => {
    const Series = SeriesRef.current
    if (!Series || Bars.length === 0) return
    Series.setData(Bars)
    ChartRef.current?.timeScale().scrollToRealTime()
  }, [Bars])

  return <div className="ChartHost" ref={ContainerRef} />
}
