/**
 * CribleView — Le Crible des marchés dans le site.
 *
 * Environ 1 300 sociétés (États-Unis, Europe, Suisse, Asie) évaluées selon quatre
 * profils : défensif, offensif, rendement et valeur. Le moteur (moteur.js) est le
 * même que celui du script Python pour le profil défensif. Chaque verdict se lit
 * critère par critère : ce n'est jamais un conseil d'achat (règle 5 du CLAUDE.md).
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Filter, Search } from 'lucide-react';

import Moteur from './moteur';
import { DEVISES, capiDans, formatMontant, montantComptableDans } from './devises';
import { REGIONS, RECO_FR, SEUILS_LIBELLES, paysFr, secteurFr } from './libelles';
import styles from './CribleView.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PAS = 100;
const { PROFILS, SEUILS_DEFAUT, fmt, fmtF, signe } = Moteur;

const VERDICTS = [
  ['RETENU', 'Retenues'], ['À VÉRIFIER', 'À vérifier'], ['EXCLU', 'Exclues'], ['', 'Toutes'],
];
const CLASSE_VERDICT = { 'RETENU': 'retenu', 'À VÉRIFIER': 'verif', 'EXCLU': 'exclu' };
const MARQUE = { 'OK': ['ok', '✓', 'passe'], 'ÉCHEC': ['ko', '✕', 'échoue'], 'INCONNU': ['inc', '?', 'inconnu'] };

const pct = (v) => (v == null ? '—' : `${fmt(v, 1)} %`);
const pctS = (v) => (v == null ? '—' : `${signe(v, 1)} %`);
const fois = (v) => (v == null ? '—' : `${fmtF(v, 1)}×`);

const extractionFr = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` à ${m[4]} UTC` : ''}` : (s || '—');
};
const dateFr = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

// ---------------------------------------------------------------------------
// Petits éléments
// ---------------------------------------------------------------------------

const Pastille = ({ verdict }) => (
  <span className={`${styles.pill} ${styles[`pill_${CLASSE_VERDICT[verdict] || 'exclu'}`]}`}>
    {verdict === 'RETENU' ? 'Retenue' : verdict === 'À VÉRIFIER' ? 'À vérifier' : 'Exclue'}
  </span>
);

const Badges = ({ p }) => (
  <span className={styles.badges}>
    {PROFILS.map((pr) => {
      const e = p[pr.cle];
      return (
        <span key={pr.cle} className={`${styles.bd} ${styles[`bd_${CLASSE_VERDICT[e.verdict]}`]}`}
          title={`${pr.nom} : ${e.verdict} (${e.ok}/${e.total})`}>
          {pr.lettre}
        </span>
      );
    })}
  </span>
);

const Marque = ({ statut }) => {
  const [cls, sym, lib] = MARQUE[statut] || MARQUE.INCONNU;
  return <span className={`${styles.m} ${styles[`m_${cls}`]}`} role="img" aria-label={lib} title={lib}>{sym}</span>;
};

// ---------------------------------------------------------------------------
// Fiche d'une société
// ---------------------------------------------------------------------------

const Groupe = ({ titre, lignes }) => (
  <div className={styles.groupe}>
    <h4>{titre}</h4>
    <dl>
      {lignes.map(([k, v]) => (
        <div key={k} className={styles.dlLigne}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  </div>
);

const Fiche = ({ item, devise, taux, dateExtraction, onFermer, onAnalyser }) => {
  const { l, p } = item;
  const m = (cle) => formatMontant(montantComptableDans(l, cle, devise, taux), devise);
  const cours = l.cours == null ? '—' : `${fmtF(l.cours, l.cours >= 1000 ? 0 : 2)} ${l.devise || ''}`;

  return (
    <section className={styles.fiche} aria-label={`Fiche ${l.nom || l.ticker}`}>
      <div className={styles.ficheTete}>
        <button className={styles.lienRetour} onClick={onFermer}><ArrowLeft size={14} /> Retour à la liste</button>
        <h3>{l.nom || l.ticker} <span className={styles.tk}>{l.ticker}</span></h3>
        <p className={styles.meta}>
          {paysFr(l.pays)} · {secteurFr(l.secteur)}{l.industrie ? ` · ${l.industrie}` : ''} · {l.bourse || '—'}
          {l.pea_possible ? ' · siège dans l\'EEE (PEA à confirmer auprès du courtier)' : ''}
        </p>
        <button className={styles.btn} onClick={() => onAnalyser(l.ticker)}>
          Analyse complète <ArrowRight size={14} />
        </button>
      </div>

      <div className={styles.chiffres}>
        <Groupe titre="Valorisation" lignes={[
          ['Cours', cours], ['Capitalisation', formatMontant(capiDans(l, devise, taux), devise)],
          ['PER passé', fmt(l.per_passe, 1)], ['PER prévisionnel', fmt(l.per_prev, 1)],
          ['VE / EBITDA', fois(l.ve_ebitda)], ['Cours / valeur comptable', fois(l.cours_vc)],
          ['Rendement du cash-flow libre', pct(l.rendement_fcf_pct)],
        ]} />
        <Groupe titre="Rentabilité (12 mois)" lignes={[
          ['Marge brute', pct(l.marge_brute_ttm_pct)], ['Marge opérationnelle', pct(l.marge_op_ttm_pct)],
          ['Marge nette', pct(l.marge_nette_ttm_pct)], ['ROE', pct(l.roe_pct)],
          ['Cash-flow libre', m('fcf_ttm')],
        ]} />
        <Groupe titre="Croissance attendue" lignes={[
          ['CA, exercice en cours', pctS(l.croissance_ca_0y_pct)], ['CA, exercice suivant', pctS(l.croissance_ca_1y_pct)],
          ['BPA, exercice en cours', pctS(l.croissance_bpa_0y_pct)], ['BPA, exercice suivant', pctS(l.croissance_bpa_1y_pct)],
          ['CA, moyenne passée', pctS(l.tcac_ca_pct)],
        ]} />
        <Groupe titre="Bilan" lignes={[
          ['Dette nette', l.tresorerie_nette ? 'trésorerie nette' : m('dette_nette_ttm')],
          ['Dette nette / EBITDA', fois(l.levier_ttm)], ['EBITDA (12 mois)', m('ebitda_ttm')],
          ['Chiffre d\'affaires (exercice)', m('ca')], ['Bêta', fmtF(l.beta, 2)],
        ]} />
        <Groupe titre="Dividende" lignes={[
          ['Rendement (12 mois)', pct(l.rendement_div_pct)], ['Taux de distribution', pct(l.taux_distribution_pct)],
          ['Années sans interruption', l.div_annees == null ? '—' : `${l.div_annees}`],
          ['Baisses sur la période', l.div_baisses == null ? '—' : `${l.div_baisses}`],
          ['Croissance annuelle', pctS(l.croissance_div_pct)],
        ]} />
        <Groupe titre="Analystes et dates" lignes={[
          ['Recommandation', l.reco ? (RECO_FR[l.reco] || l.reco) : '—'],
          ['Nombre d\'analystes', l.nb_analystes == null ? '—' : fmt(l.nb_analystes, 0)],
          ['Potentiel vers l\'objectif moyen', pctS(l.potentiel_pct)],
          ['Dernier trimestre publié', dateFr(l.trimestre)], ['Dernier exercice', dateFr(l.exercice)],
        ]} />
      </div>

      <p className={styles.avis}>
        Chiffres Yahoo Finance extraits le {extractionFr(dateExtraction)}. Montants des comptes en {l.devise_comptable || '—'}
        {l.devise_comptable !== devise ? `, convertis en ${devise}` : ''}. À recouper avec les publications de la
        société avant toute décision. Les verdicts se lisent critère par critère : ce ne sont pas des conseils.
      </p>

      {PROFILS.map((pr) => {
        const e = p[pr.cle];
        return (
          <details key={pr.cle} className={styles.profil} open={e.verdict !== 'EXCLU' || pr.cle === 'defensif'}>
            <summary>
              <span>Profil {pr.nom.toLowerCase()}</span>
              <Pastille verdict={e.verdict} />
              <span className={styles.mut}>{e.ok}/{e.total} critères remplis{e.inconnus ? `, ${e.inconnus} inconnu${e.inconnus > 1 ? 's' : ''}` : ''}</span>
            </summary>
            <div className={styles.critGrid}>
              {Object.keys(e.res).map((k, i) => {
                const r = e.res[k];
                const def = pr.criteres.find((c) => c.cle === k);
                return (
                  <div key={k} className={styles.crit}>
                    <header>
                      <span className={styles.num}>{i + 1}</span>
                      <h5>{def ? def.nom : k}</h5>
                      <Marque statut={r.statut} />
                    </header>
                    {r.valeur && <div className={styles.val}>{r.valeur}</div>}
                    <p>{r.texte}</p>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Vue principale
// ---------------------------------------------------------------------------

const TRIS = {
  capi: { lib: 'Capitalisation', val: (it) => it.l.capi_usd },
  per: { lib: 'PER prévisionnel', val: (it) => (it.l.per_prev > 0 ? it.l.per_prev : null), sens: 1 },
  rdt: { lib: 'Rendement du dividende', val: (it) => it.l.rendement_div_pct },
  score: { lib: 'Critères remplis', val: (it, profil) => it.p[profil].ok },
};

const CribleView = ({ onAnalyser, devise = 'EUR', onDevise = () => {} }) => {
  const [etat, setEtat] = useState({ chargement: true, erreur: null, meta: null, lignes: [] });
  const [profil, setProfil] = useState('defensif');
  const [verdict, setVerdict] = useState('RETENU');
  const [region, setRegion] = useState('');
  const [secteur, setSecteur] = useState('');
  const [q, setQ] = useState('');
  const [tri, setTri] = useState('capi');
  const [n, setN] = useState(PAS);
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/crible`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.detail || `Erreur ${r.status}`);
        if (actif) setEtat({ chargement: false, erreur: null, meta: j.meta, lignes: j.lignes || [] });
      } catch (e) {
        if (actif) setEtat({ chargement: false, erreur: e.message, meta: null, lignes: [] });
      }
    })();
    return () => { actif = false; };
  }, []);

  // Évaluation des quatre profils, une fois par chargement
  const items = useMemo(() => etat.lignes.map((brut) => {
    const l = { ...brut, ...Moteur.normaliserLigne(brut) };
    const p = {};
    PROFILS.forEach((pr) => { p[pr.cle] = Moteur.evaluerProfil(pr.cle, l, SEUILS_DEFAUT); });
    return { id: l.ticker, l, p };
  }).filter((it) => it.l.statut === 'OK'), [etat.lignes]);

  const secteurs = useMemo(() => {
    const s = {};
    items.forEach((it) => { if (it.l.secteur) s[it.l.secteur] = (s[it.l.secteur] || 0) + 1; });
    return Object.keys(s).sort((a, b) => secteurFr(a).localeCompare(secteurFr(b), 'fr'));
  }, [items]);

  const filtresSansVerdict = useMemo(() => {
    const recherche = q.trim().toLowerCase();
    return items.filter((it) =>
      (!region || it.l.region === region) &&
      (!secteur || it.l.secteur === secteur) &&
      (!recherche || (it.l.nom || '').toLowerCase().includes(recherche) || it.l.ticker.toLowerCase().includes(recherche)));
  }, [items, region, secteur, q]);

  const compte = useMemo(() => {
    const c = { 'RETENU': 0, 'À VÉRIFIER': 0, 'EXCLU': 0, '': filtresSansVerdict.length };
    filtresSansVerdict.forEach((it) => { c[it.p[profil].verdict] += 1; });
    return c;
  }, [filtresSansVerdict, profil]);

  const liste = useMemo(() => {
    const t = TRIS[tri];
    const sens = t.sens || -1;
    return filtresSansVerdict
      .filter((it) => !verdict || it.p[profil].verdict === verdict)
      .sort((a, b) => {
        const va = t.val(a, profil), vb = t.val(b, profil);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;   // inconnus en fin de liste, quel que soit le sens
        if (vb == null) return -1;
        return sens * (va - vb);
      });
  }, [filtresSansVerdict, verdict, profil, tri]);

  const taux = etat.meta?.taux_usd || {};
  const profilCourant = PROFILS.find((pr) => pr.cle === profil);

  if (etat.chargement) return <div className={styles.vide}>Chargement du crible…</div>;
  if (etat.erreur) return (
    <div className={styles.vide}>
      <b>Crible indisponible.</b> {etat.erreur}
    </div>
  );

  if (selection) {
    const it = items.find((x) => x.id === selection);
    if (it) return (
      <Fiche item={it} devise={devise} taux={taux} dateExtraction={etat.meta?.date_extraction}
        onFermer={() => setSelection(null)} onAnalyser={onAnalyser} />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.entete}>
        <div>
          <p className={styles.sur}>États-Unis · Europe · Suisse · Asie</p>
          <h2 className={styles.titre}>Crible des marchés</h2>
          <p className={styles.fraicheur}>
            Yahoo Finance, extrait le <b>{extractionFr(etat.meta?.date_extraction)}</b> · <b>{fmt(items.length, 0)}</b> sociétés.
            Verdicts critère par critère, pas des conseils d'achat.
          </p>
        </div>
        <label className={styles.devise}>
          <span>Devise</span>
          <select value={devise} onChange={(e) => onDevise(e.target.value)} aria-label="Devise d'affichage">
            {DEVISES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.profils} role="tablist" aria-label="Profils">
        {PROFILS.map((pr) => (
          <button key={pr.cle} role="tab" aria-selected={profil === pr.cle}
            className={profil === pr.cle ? styles.profilActif : styles.profilBtn}
            onClick={() => { setProfil(pr.cle); setN(PAS); }}>
            {pr.nom}
          </button>
        ))}
      </div>
      <p className={styles.desc}>{profilCourant.desc}</p>

      <details className={styles.seuils}>
        <summary>Seuils du profil {profilCourant.nom.toLowerCase()}</summary>
        <ul>
          {(SEUILS_LIBELLES[profil] || []).map(([k, lib, unite]) => (
            <li key={k}>{lib} : <b>{fmt(SEUILS_DEFAUT[k], 2)}</b>{unite ? ` ${unite}` : ''}</li>
          ))}
        </ul>
      </details>

      <div className={styles.filtres}>
        <label className={styles.recherche}>
          <Search size={14} />
          <input type="search" value={q} placeholder="Société ou ticker" aria-label="Rechercher une société"
            onChange={(e) => { setQ(e.target.value); setN(PAS); }} />
        </label>
        <Filter size={14} className={styles.mut} />
        <select value={region} onChange={(e) => { setRegion(e.target.value); setN(PAS); }} aria-label="Région">
          <option value="">Toutes les régions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={secteur} onChange={(e) => { setSecteur(e.target.value); setN(PAS); }} aria-label="Secteur">
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => <option key={s} value={s}>{secteurFr(s)}</option>)}
        </select>
        <select value={tri} onChange={(e) => setTri(e.target.value)} aria-label="Trier par">
          {Object.entries(TRIS).map(([k, t]) => <option key={k} value={k}>Trier : {t.lib}</option>)}
        </select>
      </div>

      <div className={styles.chips}>
        {VERDICTS.map(([v, lib]) => (
          <button key={v || 'tous'} aria-pressed={verdict === v} className={verdict === v ? styles.chipActif : styles.chip}
            onClick={() => { setVerdict(v); setN(PAS); }}>
            {lib} <span className={styles.c}>{fmt(compte[v], 0)}</span>
          </button>
        ))}
      </div>

      {liste.length === 0 ? (
        <div className={styles.vide}>Aucune société pour ces filtres.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.tab}>
            <thead>
              <tr>
                <th>Société</th>
                <th>Secteur</th>
                <th className={styles.n}>Capitalisation</th>
                <th className={styles.n}>PER prév.</th>
                <th className={styles.n}>Rendement</th>
                <th>Profil {profilCourant.nom.toLowerCase()}</th>
                <th title="Défensif, Offensif, Rendement, Valeur">Profils</th>
              </tr>
            </thead>
            <tbody>
              {liste.slice(0, n).map((it) => {
                const e = it.p[profil];
                return (
                  <tr key={it.id} className={styles.lien} tabIndex={0}
                    onClick={() => setSelection(it.id)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') setSelection(it.id); }}>
                    <td className={styles.ent}>
                      <span className={styles.nom}>{it.l.nom || it.l.ticker}</span>
                      <span className={styles.tk}>{it.l.ticker} · {paysFr(it.l.pays)}</span>
                    </td>
                    <td className={styles.mut}>{secteurFr(it.l.secteur)}</td>
                    <td className={styles.n}>{formatMontant(capiDans(it.l, devise, taux), devise)}</td>
                    <td className={styles.n}>{it.l.per_prev > 0 ? fmt(it.l.per_prev, 1) : '—'}</td>
                    <td className={styles.n}>{pct(it.l.rendement_div_pct)}</td>
                    <td><Pastille verdict={e.verdict} /> <span className={styles.mut}>{e.ok}/{e.total}</span></td>
                    <td><Badges p={it.p} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {liste.length > n && (
        <button className={styles.plus} onClick={() => setN(n + PAS)}>
          Afficher {Math.min(PAS, liste.length - n)} de plus ({fmt(liste.length - n, 0)} restantes)
        </button>
      )}
      <p className={styles.legende}>
        D, O, R, V : profils défensif, offensif, rendement et valeur. Plein : retenue ; contour : à vérifier
        (au moins une donnée manquante) ; pâle : exclue. Nestlé est exclue du crible.
      </p>
    </div>
  );
};

export default CribleView;
