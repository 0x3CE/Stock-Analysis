/**
 * Colonne de droite de la vue d'ensemble : résumé, carte de thèse, watchlist.
 *
 * Aucun chiffre inventé : le prix cible est l'objectif moyen des analystes (Yahoo),
 * la conviction et l'hypothèse sont celles que l'utilisateur écrit, la watchlist
 * affiche ses favoris avec leurs vrais cours.
 */

import { useState } from 'react';
import { Check, ChevronRight, IdCard, Info, Pencil, Star, Trash2, X } from 'lucide-react';
import { CONVICTIONS } from '../../hooks/useTheses';
import styles from './OverviewSidebar.module.css';

const SYMBOLES = { USD: '$', EUR: '€', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'CHF ' };

const prix = (value, symbole = '$') => {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  return symbole === 'p' ? `${n.toFixed(2)}p` : `${symbole}${n.toFixed(2)}`;
};

const variation = (value) => {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
};

const dateFr = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
};

// ---------------------------------------------------------------------------

const Carte = ({ icone: Icone, titre, children }) => (
  <section className={styles.card}>
    <h2 className={styles.title}>
      <Icone size={22} className={styles.titleIcon} aria-hidden="true" />
      {titre}
    </h2>
    {children}
  </section>
);

const ExecutiveSummaryCard = ({ points = [] }) => (
  <Carte icone={Info} titre="Executive Summary">
    <ul className={styles.summaryList}>
      {points.length > 0 ? points.map((point) => (
        <li key={point.text} className={styles.summaryItem}>
          <span className={`${styles.summaryDot} ${point.tone === 'positive' ? styles.dotPositive : styles.dotNeutral}`} />
          <span>{point.text}</span>
        </li>
      )) : (
        <li className={styles.summaryItem}>
          <span className={`${styles.summaryDot} ${styles.dotNeutral}`} />
          <span>Données insuffisantes pour un résumé.</span>
        </li>
      )}
    </ul>
  </Carte>
);

const CLASSE_CONVICTION = { 'Élevée': 'convictionHigh', 'Moyenne': 'convictionMedium', 'Faible': 'convictionLow' };

const ThesisCard = ({ ticker, symbole, currentPrice, targetPrice, analystCount, these, onEnregistrer, onEffacer }) => {
  const [edition, setEdition] = useState(false);
  const [hypothese, setHypothese] = useState('');
  const [conviction, setConviction] = useState('');

  const potentiel = currentPrice != null && targetPrice != null && currentPrice > 0
    ? ((targetPrice - currentPrice) / currentPrice) * 100 : null;

  const ouvrir = () => {
    setHypothese(these?.hypothese || '');
    setConviction(these?.conviction || '');
    setEdition(true);
  };

  const enregistrer = (e) => {
    e.preventDefault();
    onEnregistrer(ticker, { hypothese, conviction: conviction || null });
    setEdition(false);
  };

  return (
    <Carte icone={IdCard} titre="Carte de thèse">
      <div className={styles.thesisGrid}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Prix actuel</span>
          <span className={styles.metricValue}>{prix(currentPrice, symbole)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Prix cible</span>
          <span className={styles.metricValue}>{prix(targetPrice, symbole)}</span>
          <span className={styles.metricSource}>
            {targetPrice != null
              ? `objectif moyen de ${analystCount ?? '?'} analyste${analystCount > 1 ? 's' : ''} (Yahoo)`
              : 'aucun objectif d\'analystes'}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Potentiel</span>
          <span className={`${styles.metricValue} ${potentiel == null ? '' : potentiel >= 0 ? styles.up : styles.down}`}>
            {variation(potentiel)}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Conviction</span>
          {these?.conviction
            ? <span className={`${styles.convictionBadge} ${styles[CLASSE_CONVICTION[these.conviction]]}`}>{these.conviction}</span>
            : <span className={styles.metricValueMuted}>—</span>}
        </div>
      </div>

      {edition ? (
        <form className={styles.form} onSubmit={enregistrer}>
          <label className={styles.field}>
            <span>Hypothèse</span>
            <textarea rows={4} value={hypothese} onChange={(e) => setHypothese(e.target.value)}
              placeholder="Pourquoi cette société, et qu'est-ce qui invaliderait la thèse ?" />
          </label>
          <label className={styles.field}>
            <span>Conviction</span>
            <select value={conviction} onChange={(e) => setConviction(e.target.value)}>
              <option value="">Non précisée</option>
              {CONVICTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.editButton}><Check size={15} /> Enregistrer</button>
            <button type="button" className={styles.ghostButton} onClick={() => setEdition(false)}><X size={15} /> Annuler</button>
            {these && (
              <button type="button" className={styles.dangerButton}
                onClick={() => { onEffacer(ticker); setEdition(false); }}>
                <Trash2 size={15} /> Effacer
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <p className={styles.note}>
            {these?.hypothese
              ? these.hypothese
              : `Aucune thèse écrite pour ${ticker}. Note ici pourquoi tu suivrais cette société.`}
          </p>
          {these?.maj && <p className={styles.noteDate}>Modifiée le {dateFr(these.maj)} · gardée dans ce navigateur</p>}
          <button type="button" className={styles.editButton} onClick={ouvrir}>
            <Pencil size={15} /> {these ? 'Modifier la thèse' : 'Écrire la thèse'}
          </button>
        </>
      )}
    </Carte>
  );
};

const WatchlistCard = ({ tickers = [], cotations = {}, tickerCourant, onSelect }) => (
  <Carte icone={Star} titre="Watchlist">
    {tickers.length === 0 ? (
      <p className={styles.note}>Ajoute une société avec l'étoile, à côté de son nom.</p>
    ) : (
      <ul className={styles.watchlist}>
        {tickers.map((tk) => {
          const c = cotations[tk] || {};
          const sens = c.variation_pct == null ? '' : c.variation_pct >= 0 ? styles.up : styles.down;
          return (
            <li key={tk}>
              <button className={`${styles.watchlistRow} ${tk === tickerCourant ? styles.watchlistActive : ''}`}
                onClick={() => onSelect(tk)}>
                <ChevronRight size={14} className={styles.chevron} aria-hidden="true" />
                <span className={styles.ticker}>{tk}</span>
                <span className={styles.price}>{prix(c.cours, SYMBOLES[c.devise] ?? (c.devise ? `${c.devise} ` : '$'))}</span>
                <span className={`${styles.change} ${sens}`}>{variation(c.variation_pct)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </Carte>
);

export const OverviewSidebar = ({ summaryPoints, these, watchlist }) => (
  <div className={styles.stack}>
    <ExecutiveSummaryCard points={summaryPoints} />
    <ThesisCard {...these} />
    <WatchlistCard {...watchlist} />
  </div>
);
