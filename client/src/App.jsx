import { NavLink, Route, Routes } from "react-router-dom";
import ExplorePage from "./pages/ExplorePage.jsx";
import PersonBoardPage from "./pages/PersonBoardPage.jsx";
import NetworkPage from "./pages/NetworkPage.jsx";

export default function App() {
  return (
    <div className="app-shell">
      <header className="board-header">
        <div>
          <div className="brand">
            <span className="pin-dot" aria-hidden="true" />
            Swap<span>Board</span>
          </div>
          <div className="tagline">// trade skills, not money</div>
        </div>
        <nav className="board-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Explore
          </NavLink>
          <NavLink to="/network" className={({ isActive }) => (isActive ? "active" : "")}>
            Network
          </NavLink>
        </nav>
      </header>
      <main className="board-main">
        <Routes>
          <Route path="/" element={<ExplorePage />} />
          <Route path="/people/:id" element={<PersonBoardPage />} />
          <Route path="/network" element={<NetworkPage />} />
        </Routes>
      </main>
    </div>
  );
}
