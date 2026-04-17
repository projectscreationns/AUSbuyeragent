import { Link, Route, Routes } from 'react-router-dom';
import RestaurantGrid from './pages/RestaurantGrid';
import MenuPage from './pages/MenuPage';
import RecipePage from './pages/RecipePage';

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-white/10 px-6 py-4">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          🛒 Restaurant → Cart
        </Link>
        <p className="text-xs text-white/50 mt-1">
          Pick a restaurant. Pick a dish. Send every ingredient to Instacart in one click.
        </p>
      </header>
      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">
        <Routes>
          <Route path="/" element={<RestaurantGrid />} />
          <Route path="/r/:restaurant" element={<MenuPage />} />
          <Route path="/r/:restaurant/:item" element={<RecipePage />} />
        </Routes>
      </main>
      <footer className="border-t border-white/10 px-6 py-3 text-[11px] text-white/40 text-center">
        All recipes are fan approximations. Not affiliated with any restaurant.
      </footer>
    </div>
  );
}
