import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomeView } from './views/HomeView'
import { MatchView } from './views/MatchView'
import { SoloTradingView } from './views/SoloTradingView'
import { TrainTradingView } from './views/TrainTradingView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/solo" element={<SoloTradingView />} />
        <Route path="/train" element={<TrainTradingView />} />
        <Route path="/match/:RoomId" element={<MatchView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
