import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Award } from 'lucide-react';

// Configuration de l'URL de l'API backend
const API_BASE_URL = 'http://localhost:8000';

const StockDashboard = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  // Fonction de récupération des données depuis l'API Python
  const fetchAnalysis = async (symbol) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/analyze/${symbol}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la récupération des données');
      }
      
      const data = await response.json();
      setAnalysis(data);
      
    } catch (err) {
      setError(err.message);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  // Chargement initial au montage du composant
  useEffect(() => {
    fetchAnalysis(ticker);
  }, []);

  // Handler pour le bouton d'analyse
  const handleAnalyze = () => {
    if (ticker.trim()) {
      fetchAnalysis(ticker.trim().toUpperCase());
    }
  };

  // Handler pour la touche Entrée dans l'input
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  // Utilitaire pour déterminer la couleur selon le score et test de push
  const getScoreColor = (score) => {
    if (score >= 7) return 'text-green-400';
    if (score >= 4) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Utilitaire pour le label du score
  const getScoreLabel = (score) => {
    if (score >= 7) return 'EXCELLENT';
    if (score >= 4) return 'MOYEN';
    return 'FAIBLE';
  };

  // Affichage pendant le chargement
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

  // Affichage en cas d'erreur
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

  // Affichage si aucune donnée n'est chargée
  if (!analysis) return null;

  const { kpis, historical_data, piotroski_score, name } = analysis;
  const lastMonthData = historical_data.slice(-30);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Barre de recherche */}
        <div className="mb-8">
          <div className="flex gap-4 items-center">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="Ticker (ex: AAPL)"
              className="px-4 py-2 bg-slate-800 text-white border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-lg"
            />
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
                <YAxis stroke="#9CA3AF" domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#1e293b', border: '1px solid #475569'}}
                  labelStyle={{color: '#fff'}}
                />
                <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Métriques financières détaillées */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Métriques Financières</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">52W High</span>
                <span className="text-white font-semibold">${kpis.high_52w || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">52W Low</span>
                <span className="text-white font-semibold">${kpis.low_52w || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Beta</span>
                <span className="text-white font-semibold">{kpis.beta || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">EPS</span>
                <span className="text-white font-semibold">${kpis.eps || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ROE</span>
                <span className="text-white font-semibold">{kpis.roe ? `${kpis.roe}%` : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Debt/Equity</span>
                <span className="text-white font-semibold">{kpis.debt_to_equity || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Ratio</span>
                <span className="text-white font-semibold">{kpis.current_ratio || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Profit Margin</span>
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
              <div className={`text-6xl font-bold ${getScoreColor(piotroski_score.total_score)}`}>
                {piotroski_score.total_score}/9
              </div>
              <div className={`text-xl font-semibold ${getScoreColor(piotroski_score.total_score)}`}>
                {getScoreLabel(piotroski_score.total_score)}
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
                        {item.score}
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
                        {item.score}
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
                        {item.score}
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