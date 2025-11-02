import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Award } from 'lucide-react';
import { LineChart,Line,BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';


// Configuration de l'URL de l'API backend
//const API_BASE_URL = 'http://localhost:8000';
const API_URL = process.env.REACT_APP_API_URL;

const StockDashboard = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);


  // Récupération des suggestions
  const fetchSuggestions = async (query) => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const resp = await fetch(`${API_URL}/search/${encodeURIComponent(query)}`);
      if (!resp.ok) {
        // si 404 -> pas de suggestions
        if (resp.status === 404) {
          setSuggestions([]);
          setSuggestionsLoading(false);
          return;
        }
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.detail || 'Erreur recherche');
      }
      const data = await resp.json();
      setSuggestions(data.results || []);
    } catch (err) {
      console.error("Erreur de recherche :", err);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const fetchAnalysis = async (symbol) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/analyze/${encodeURIComponent(symbol)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Erreur lors de la récupération des données');
      }

      const data = await response.json();
      setAnalysis(data);
      setSuggestions([]);

    } catch (err) {
      setError(err.message);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  // Chargement initial
  useEffect(() => {
    fetchAnalysis(ticker);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = () => {
    if (ticker.trim()) {
      fetchAnalysis(ticker.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  const getScoreColor = (score) => {
    if (score >= 7) return 'text-green-400';
    if (score >= 4) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score) => {
    if (score >= 7) return 'EXCELLENT';
    if (score >= 4) return 'MOYEN';
    return 'FAIBLE';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="text-white text-2xl mb-4">Analyse en cours...</div>
          <div className="animate-pulse text-blue-400">Récupération des données depuis l'API Python</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="bg-red-900 border border-red-500 rounded-lg p-8 max-w-md">
          <div className="text-red-400 text-xl font-bold mb-2">Erreur</div>
          <div className="text-red-300">{error}</div>
          <button
            onClick={() => setError(null)}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const { kpis, historical_data, piotroski_score, name } = analysis;
  const lastMonthData = historical_data.slice(-30);
  console.log("Données des dividendes dans le composant :", analysis?.dividend_history);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">

        <div className="search-container mb-8 relative">
          <div className="flex gap-4">
            <div className="relative w-full">
              <input
                type="text"
                value={ticker}
                onChange={(e) => {
                  const value = e.target.value;
                  setTicker(value);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => fetchSuggestions(value), 350);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Nom ou Ticker (ex: Apple ou AAPL)"
                className="px-4 py-2 w-full bg-slate-800 text-white border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-lg"
              />
              {/* Suggestions */}
              { (suggestions.length > 0 || suggestionsLoading) && (
                <div className="absolute z-50 bg-slate-800 border border-slate-700 rounded-lg mt-1 w-full max-h-56 overflow-y-auto shadow-lg">
                  {suggestionsLoading && (
                    <div className="px-4 py-2 text-slate-300">Chargement...</div>
                  )}
                  {suggestions.map((s, idx) => (
                    <div
                      key={idx}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        setTicker(s.symbol);
                        setSuggestions([]);
                        fetchAnalysis(s.symbol);
                      }}
                      className="px-4 py-2 cursor-pointer hover:bg-slate-700 text-white transition-colors"
                    >
                      <span className="font-semibold text-blue-400">{s.symbol}</span>
                      <span className="text-slate-300"> — {s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleAnalyze}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Analyser
            </button>
          </div>
        </div>
        {/* En-tête avec nom et prix */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{name}</h1>
          <div className="flex items-center gap-4">
            <span className="text-5xl font-bold text-white">${kpis.current_price}</span>
            <span className={`text-2xl font-semibold flex items-center gap-2 ${parseFloat(kpis.price_change) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(kpis.price_change) >= 0 ? <TrendingUp /> : <TrendingDown />}
              {kpis.price_change}%
            </span>
          </div>
        </div>

        {/* Grille de KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Market Cap</span>
              <DollarSign className="text-blue-400" size={20} />
            </div>
            <div className="text-2xl font-bold text-white">${kpis.market_cap}B</div>
          </div>


          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">P/E Ratio</span>
              <BarChart3 className="text-purple-400" size={20} />
            </div>
            <div className="text-2xl font-bold text-white">{kpis.pe_ratio || 'N/A'}</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Dividend Yield</span>
              <Activity className="text-green-400" size={20} />
            </div>
            <div className="text-2xl font-bold text-white">{kpis.dividend_yield ? `${kpis.dividend_yield}%` : 'N/A'}</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Volume (M)</span>
              <Activity className="text-orange-400" size={20} />
            </div>
            <div className="text-2xl font-bold text-white">{kpis.volume}M</div>
          </div>
        </div>

        {/* Graphique et métriques */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          
          {/* Graphique d'évolution du prix */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Évolution du Prix (30j)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lastMonthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" tick={{fontSize: 12}} />
                <YAxis 
                  stroke="#9CA3AF" 
                  tick={{ fontSize: 14 }} 
                  domain={['dataMin - 5', 'dataMax + 5']}
                  tickFormatter={(value) => `$${value.toFixed(2)}`} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#1e293b', border: '1px solid #475569'}}
                  labelStyle={{color: '#fff'}}
                  formatter={(value) => [`$${value}`, "Price"]}
                />
                <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Évolution des Dividendes (5 ans)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={[...analysis.dividend_history].sort((a, b) => a.year.localeCompare(b.year))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="year"
                  stroke="#9CA3AF"
                  tick={{ fontSize: 12 }} 
                />
                <YAxis
                  stroke="#9CA3AF"
                  tick={{ fontSize: 14 }}
                  domain={[
                    (dataMin) => Math.max(0, dataMin - 0.05),  // Début légèrement en dessous de la valeur minimale
                    (dataMax) => dataMax + 0.05               // Fin légèrement au-dessus de la valeur maximale
                  ]}
                  tickFormatter={(value) => `$${value.toFixed(2)}`}  // Affiche 2 décimales
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value) => [`$${value}`, "Dividende"]}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  dot={{
                    r: 3,  // Réduit le rayon des points (3px au lieu de 4px ou 6px)
                    fill: "#fff",  // Centre des points en blanc pour plus de visibilité
                    stroke: "#10b981",  // Bordure des points en vert
                    strokeWidth: 1.5  // Épaisseur de la bordure des points
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Évolution du Bénéfice Net (5 ans)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={[...analysis.profit_margin_history].sort((a, b) => a.year.localeCompare(b.year))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                <YAxis
                  stroke="#9CA3AF"
                  tick={{ fontSize: 14 }}
                  tickFormatter={(v) => `$${v}B`}
                  domain={['dataMin - 2', 'dataMax + 2']}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value) => [`$${value}B`, "Bénéfice net"]}
                />
                <Line
                  type="monotone"
                  dataKey="net_income"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  dot={{ r: 3, fill: "#fff", stroke: "#f97316", strokeWidth: 1.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Marge Nette (5 ans)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={[...analysis.profit_margin_history].sort((a, b) => a.year.localeCompare(b.year))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="year" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
              <YAxis
                stroke="#9CA3AF"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
                domain={[
                  1,
                  0
                ]}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value) => [`${value}%`, "Marge nette"]}
              />
              <Line
                type="monotone"
                dataKey="margin"
                stroke="#22c55e"
                strokeWidth={1.5}
                dot={{ r: 3, fill: "#fff", stroke: "#22c55e", strokeWidth: 1.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6 mb-8">
        {/* Métriques financières détaillées */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Métriques Financières</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">52W High : </span>
                <span className="text-white font-semibold">&nbsp;${kpis.high_52w || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">52W Low : </span>
                <span className="text-white font-semibold">&nbsp;${kpis.low_52w || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Beta : </span>
                <span className="text-white font-semibold">&nbsp;{kpis.beta || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">EPS : </span>
                <span className="text-white font-semibold">&nbsp;${kpis.eps || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ROE : </span>
                <span className="text-white font-semibold">&nbsp;{kpis.roe ? `${kpis.roe}%` : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Debt/Equity : </span>
                <span className="text-white font-semibold">&nbsp;{kpis.debt_to_equity || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Ratio : </span>
                <span className="text-white font-semibold">&nbsp;{kpis.current_ratio || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Profit Margin : </span>
                <span className="text-white font-semibold">{kpis.profit_margin ? `${kpis.profit_margin}%` : 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Section Piotroski F-Score */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-lg p-8 border-2 border-blue-500">
          
          {/* En-tête avec score total */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Award className="text-yellow-400" size={32} />
              <h2 className="text-2xl font-bold text-white">Analyse Piotroski F-Score</h2>
            </div>
            <div className="text-right">
              <div className={`text-8xl font-bold ${getScoreColor(piotroski_score.total_score)}`}>
                &nbsp; {piotroski_score.total_score}/9 {getScoreLabel(piotroski_score.total_score)}
              </div>
            </div>
          </div>

          {/* Grille des 3 catégories de critères */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Rentabilité */}
            <div>
              <h3 className="text-lg font-bold text-blue-400 mb-4">Rentabilité</h3>
              <div className="space-y-3">
                {piotroski_score.profitability.map((item, idx) => (
                  <div key={idx} className="bg-slate-900 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-sm">{item.criterion}</span>
                      <span className={`font-bold ${item.score === 1 ? 'text-green-400' : 'text-red-400'}`}>
                        &nbsp; : {item.score}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Levier / Liquidité */}
            <div>
              <h3 className="text-lg font-bold text-purple-400 mb-4">Levier / Liquidité</h3>
              <div className="space-y-3">
                {piotroski_score.leverage.map((item, idx) => (
                  <div key={idx} className="bg-slate-900 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-sm">{item.criterion}</span>
                      <span className={`font-bold ${item.score === 1 ? 'text-green-400' : 'text-red-400'}`}>
                        &nbsp; : {item.score}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Efficacité Opérationnelle */}
            <div>
              <h3 className="text-lg font-bold text-green-400 mb-4">Efficacité Opérationnelle</h3>
              <div className="space-y-3">
                {piotroski_score.operating.map((item, idx) => (
                  <div key={idx} className="bg-slate-900 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-sm">{item.criterion}</span>
                      <span className={`font-bold ${item.score === 1 ? 'text-green-400' : 'text-red-400'}`}>
                        &nbsp; : {item.score}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Interprétation du score */}
          <div className="mt-6 p-4 bg-slate-900 rounded-lg">
            <h4 className="text-white font-semibold mb-2">Interprétation :</h4>
            <p className="text-slate-300 text-sm">{piotroski_score.interpretation}</p>
          </div>
        </div>

        {/* Footer avec info API */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          Données fournies par l'API Python Backend (FastAPI + yfinance)
        </div>
      </div>
    </div>
  );
};

export default StockDashboard;