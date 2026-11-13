/**
 * moteur.js — Moteur du Crible des marchés : profils défensif, offensif, rendement et valeur.
 *
 * Repris tel quel de la page claude.ai « Crible des marchés » (version du 12/11/2026).
 * Le profil défensif est la copie exacte de evaluer() dans crible/screener_qualite.py :
 * crible/test_concordance.py compare les deux sur des milliers de cas. Toute modification
 * de la logique se reporte des deux côtés (règle 7 du CLAUDE.md : rien ne change en silence).
 */

const _racine = {};

(function (root) {
  "use strict";
  const OK = "OK", ECHEC = "ÉCHEC", INCONNU = "INCONNU";

  const SEUILS_DEFAUT = {
    capex_min_pct_ca: 2.0,
    marge_brute_ecart_type_max: 3.0,
    marge_op_min_pct: 12.0,
    croissance_min_pct: 5.0,
    croissance_max_pct: 12.0,
    per_max: 25.0,
    dette_nette_ebitda_max: 2.5,
    hausse_dette_nette_max_pct: 10.0,
    beta_max: 1.0,
  };

  const CRITERES = [
    { cle: "capex", num: 1, nom: "Capex productif", court: "Capex" },
    { cle: "prix", num: 2, nom: "Pouvoir de fixer ses prix", court: "Prix" },
    { cle: "cash", num: 3, nom: "Retours payés par le cash", court: "Cash" },
    { cle: "croissance", num: 4, nom: "Croissance du CA", court: "Croiss." },
    { cle: "per", num: 5, nom: "PER prévisionnel", court: "PER" },
    { cle: "levier", num: 6, nom: "Dette nette / EBITDA", court: "Levier" },
    { cle: "beta", num: 7, nom: "Bêta", court: "Bêta" },
  ];

  const EXCLUSIONS = {
    "NESN.SW": "Nestlé — boycott, exclue à vie",
    "NSRGY": "Nestlé (ADR) — boycott, exclue à vie",
    "NSRGF": "Nestlé (OTC) — boycott, exclue à vie",
  };

  function exclusion(ticker, nom) {
    const t = String(ticker || "").toUpperCase().trim();
    if (EXCLUSIONS[t]) return EXCLUSIONS[t];
    if (/nestl[eé]/i.test(String(nom || ""))) return "Nestlé — boycott, exclue à vie";
    return null;
  }

  // ---------- format ----------
  const nfCache = {};
  function nf(d) {
    return (nfCache[d] = nfCache[d] || new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  }
  function fmt(v, d) {
    d = d == null ? 1 : d;
    if (v == null) return "—";
    if (Array.isArray(v)) return fmt(v[0], d) + " – " + fmt(v[1], d);
    return nf(d).format(v);
  }
  // Nombre de décimales fixe (0,70× plutôt que 0,7×)
  function fmtF(v, d) {
    if (v == null) return "—";
    if (Array.isArray(v)) return fmtF(v[0], d) + " – " + fmtF(v[1], d);
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  }
  function signe(v, d) {
    if (Array.isArray(v)) return signe(v[0], d) + " à " + signe(v[1], d);
    return (v > 0 ? "+" : "") + fmt(v, d);
  }
  function ouiNon(b) { return b == null ? "inconnu" : b ? "oui" : "non"; }

  // ---------- comparaisons à trois valeurs : true (passe), false (échoue), null (inconnu) ----------
  function auMoins(v, min) {
    if (v == null) return null;
    if (Array.isArray(v)) return v[0] >= min ? true : v[1] < min ? false : null;
    return v >= min;
  }
  function auPlus(v, max) {
    if (v == null) return null;
    if (Array.isArray(v)) return v[1] <= max ? true : v[0] > max ? false : null;
    return v <= max;
  }
  function entre(v, a, b) {
    const x = auMoins(v, a), y = auPlus(v, b);
    if (x === false || y === false) return false;
    if (x === null || y === null) return null;
    return true;
  }
  // Un échec avéré l'emporte ; sinon un seul inconnu donne INCONNU.
  function statut() {
    const t = Array.prototype.slice.call(arguments);
    if (t.some((x) => x === false)) return ECHEC;
    if (t.some((x) => x === null || x === undefined)) return INCONNU;
    return OK;
  }
  function chevauche(t) { return t === null ? " Les sources encadrent le seuil : impossible de trancher." : ""; }

  // ---------- évaluation ----------
  function evaluer(x, s) {
    s = s || SEUILS_DEFAUT;
    const r = {};

    // 1. Capex
    {
      const pct = x.capex_pct_ca, cv = x.capex_couvert;
      if (pct == null && cv == null) {
        r.capex = { statut: INCONNU, valeur: null, texte: "Capex, chiffre d'affaires ou cash-flow opérationnel manquant." };
      } else {
        const t = pct == null ? null : auMoins(pct, s.capex_min_pct_ca);
        r.capex = {
          statut: statut(t, cv == null ? null : cv),
          valeur: pct == null ? null : fmt(pct) + " %",
          texte: (pct == null ? "Capex en % du CA inconnu." : "Capex = " + fmt(pct) + " % du CA (seuil ≥ " + fmt(s.capex_min_pct_ca) + " %)." + chevauche(t)) +
            " Financé par le cash opérationnel : " + ouiNon(cv) + ".",
        };
      }
    }

    // 2. Pouvoir de fixer ses prix (proxy)
    {
      const mop = x.marge_op_pct, ec = x.marge_brute_ecart_type;
      if (mop == null && ec == null) {
        r.prix = { statut: INCONNU, valeur: null, texte: "Marges non disponibles (il faut 3 ans de marge brute et la marge opérationnelle)." };
      } else {
        r.prix = {
          statut: statut(mop == null ? null : auMoins(mop, s.marge_op_min_pct), ec == null ? null : auPlus(ec, s.marge_brute_ecart_type_max)),
          valeur: mop == null ? null : fmt(mop) + " %",
          texte: (mop == null ? "Marge opérationnelle inconnue." : "Marge opérationnelle " + fmt(mop) + " % (seuil ≥ " + fmt(s.marge_op_min_pct) + " %).") +
            " " + (ec == null ? "Stabilité de la marge brute inconnue." :
              "Écart-type de la marge brute " + fmt(ec) + " pts" + (x.marge_brute_nb_annees ? " sur " + x.marge_brute_nb_annees + " ans" : "") +
              " (seuil ≤ " + fmt(s.marge_brute_ecart_type_max) + ")."),
        };
      }
    }

    // 3. Dividendes + rachats couverts par le cash-flow libre, dette nette sous contrôle
    {
      const max = s.hausse_dette_nette_max_pct;
      let ratio = null, couvert = null;
      if (x.retours_sur_fcf != null) {
        ratio = x.retours_sur_fcf;
        couvert = auPlus(ratio, 1);
      } else if (x.fcf != null && x.retours != null) {
        couvert = x.retours <= x.fcf;
        ratio = x.fcf > 0 ? x.retours / x.fcf : null;
      }
      let h = null, hOk = null, hTxt = "Évolution de la dette nette inconnue.";
      const dn = x.dette_nette, dnp = x.dette_nette_prec;
      if (x.hausse_dette_pct != null) {
        h = x.hausse_dette_pct;
        hOk = auPlus(h, max);
        hTxt = "Dette nette " + signe(h) + " % par an (seuil ≤ +" + fmt(max) + " %)." + chevauche(hOk);
      } else if (dn != null && dnp != null) {
        if (dnp <= 0) {
          hOk = dn <= 0 || dn <= Math.abs(dnp) * max / 100;
          hTxt = "Trésorerie nette l'année précédente ; dette nette " + (hOk ? "toujours maîtrisée." : "devenue significative.");
        } else {
          h = 100 * (dn - dnp) / dnp;
          hOk = h <= max;
          hTxt = "Dette nette " + signe(h) + " % sur un an (seuil ≤ +" + fmt(max) + " %).";
        }
      }
      let cTxt;
      if (ratio != null) cTxt = "Dividendes + rachats = " + fmt(ratio, 2) + " fois le cash-flow libre (seuil ≤ 1).";
      else if (couvert === true) cTxt = "Dividendes + rachats couverts par le cash-flow libre.";
      else if (couvert === false) cTxt = "Dividendes + rachats supérieurs au cash-flow libre.";
      else cTxt = "Couverture des dividendes et rachats par le cash-flow libre inconnue.";
      const notes = [];
      if (x.rachats_absents) notes.push("Pas de ligne rachats dans les données (comptés 0).");
      if (x.dividendes_absents) notes.push("Pas de ligne dividendes dans les données (comptés 0).");
      r.cash = {
        statut: statut(couvert, hOk),
        valeur: ratio != null ? fmtF(ratio, 2) + "×" : h != null ? "dette " + signe(h, 1) + " %/an" : null,
        texte: [cTxt, hTxt].concat(notes).join(" "),
      };
    }

    // 4. Croissance du chiffre d'affaires
    {
      const g = x.croissance_pct, a = s.croissance_min_pct, b = s.croissance_max_pct;
      const src = x.croissance_source ? " (" + x.croissance_source + ")" : "";
      if (g == null) {
        r.croissance = { statut: INCONNU, valeur: null, texte: "Croissance du chiffre d'affaires inconnue." };
      } else {
        const t = entre(g, a, b);
        r.croissance = {
          statut: statut(t),
          valeur: fmt(g) + " %",
          texte: "Croissance " + fmt(g) + " %" + src + ". " +
            (t === true ? "Dans ta fourchette de " + fmt(a) + " à " + fmt(b) + " %." :
              t === false ? "Hors de ta fourchette de " + fmt(a) + " à " + fmt(b) + " %." :
                "La fourchette chevauche ta borne (" + fmt(a) + " à " + fmt(b) + " %) : impossible de trancher."),
        };
      }
    }

    // 5. PER prévisionnel
    {
      const p = x.per_prev, m = s.per_max;
      if (p == null || (!Array.isArray(p) && p <= 0)) {
        r.per = { statut: INCONNU, valeur: null, texte: "PER prévisionnel absent ou négatif." };
      } else {
        const t = auPlus(p, m);
        r.per = { statut: statut(t), valeur: fmt(p), texte: "PER " + fmt(p) + " (seuil ≤ " + fmt(m) + ")." + chevauche(t) };
      }
    }

    // 6. Levier
    {
      const m = s.dette_nette_ebitda_max, dn = x.dette_nette, e = x.ebitda;
      if (x.levier != null) {
        const t = auPlus(x.levier, m);
        r.levier = { statut: statut(t), valeur: fmtF(x.levier, 1) + "×", texte: "Dette nette = " + fmt(x.levier, 2) + " fois l'EBITDA (seuil ≤ " + fmt(m) + ")." + chevauche(t) };
      } else if (dn == null) {
        r.levier = { statut: INCONNU, valeur: null, texte: "Dette nette manquante." };
      } else if (dn <= 0) {
        r.levier = { statut: OK, valeur: "trésorerie nette", texte: "Trésorerie nette : pas de dette nette." };
      } else if (e == null) {
        r.levier = { statut: INCONNU, valeur: null, texte: "EBITDA manquant." };
      } else if (e <= 0) {
        r.levier = { statut: ECHEC, valeur: null, texte: "EBITDA négatif ou nul avec une dette nette positive." };
      } else {
        const lev = dn / e;
        r.levier = { statut: lev <= m ? OK : ECHEC, valeur: fmtF(lev, 1) + "×", texte: "Dette nette = " + fmt(lev, 2) + " fois l'EBITDA (seuil ≤ " + fmt(m) + ")." };
      }
    }

    // 7. Bêta
    {
      const bt = x.beta, m = s.beta_max;
      if (bt == null) r.beta = { statut: INCONNU, valeur: null, texte: "Bêta manquant." };
      else {
        const t = auPlus(bt, m);
        r.beta = { statut: statut(t), valeur: fmtF(bt, 2), texte: "Bêta " + fmt(bt, 2) + " (seuil ≤ " + fmt(m, 2) + ")." + chevauche(t) };
      }
    }
    return r;
  }

  function verdict(res) {
    const st = Object.keys(res).map((k) => res[k].statut);
    if (st.indexOf(ECHEC) >= 0) return "EXCLU";
    if (st.indexOf(INCONNU) >= 0) return "À VÉRIFIER";
    return "RETENU";
  }

  // ---------- autres profils (offensif, rendement, valeur) ----------
  Object.assign(SEUILS_DEFAUT, {
    of_ca_min: 15, of_bpa_min: 15, of_mb_min: 40, of_mo_min: 15, of_peg_max: 2, of_lev_max: 2,
    rd_rdt_min: 3, rd_payout_max: 75, rd_annees_min: 5, rd_lev_max: 3, rd_beta_max: 1,
    va_per_max: 15, va_ve_max: 10, va_fcf_min: 5, va_pb_max: 2, va_ca_min: 0, va_lev_max: 2.5,
  });

  const pct = (v, d) => (v == null ? "—" : fmt(v, d == null ? 1 : d) + " %");
  const pctS = (v) => (v == null ? "—" : signe(v, 1) + " %");
  function premier(l, champs) {
    for (let i = 0; i < champs.length; i++) {
      const v = l[champs[i][0]];
      if (v != null) return { v: v, src: champs[i][1] };
    }
    return { v: null, src: null };
  }
  const CA_REF = [["croissance_ca_1y_pct", "prévision des analystes pour l'exercice suivant"], ["croissance_ca_0y_pct", "prévision pour l'exercice en cours"], ["croissance_ca_trim_pct", "dernier trimestre sur un an"]];
  const BPA_REF = [["croissance_bpa_1y_pct", "prévision des analystes pour l'exercice suivant"], ["croissance_bpa_0y_pct", "prévision pour l'exercice en cours"], ["croissance_bpa_trim_pct", "dernier trimestre sur un an"]];

  function levierMesure(l) {
    if (l.tresorerie_nette === true) return { v: 0, src: "trésorerie nette" };
    return { v: l.levier_ttm != null ? l.levier_ttm : null, src: "12 derniers mois" };
  }
  function critSeuil(cle, nom, k, sens, mesure, unite, aide) {
    // sens : "min" (≥ seuil) ou "max" (≤ seuil)
    return {
      cle: cle, nom: nom, seuils: [k], aide: aide,
      eval: function (l, s) {
        const m = mesure(l), seuil = s[k];
        if (m.v == null) return { statut: INCONNU, valeur: null, texte: nom + " : donnée absente." };
        const t = sens === "min" ? auMoins(m.v, seuil) : auPlus(m.v, seuil);
        const fv = unite === "%" ? pct(m.v) : unite === "×" ? fmtF(m.v, 1) + "×" : fmt(m.v, 1);
        const fs = unite === "%" ? pct(seuil) : unite === "×" ? fmt(seuil, 1) + "×" : fmt(seuil, 1);
        return { statut: statut(t), valeur: fv, texte: nom + " " + fv + (m.src ? " (" + m.src + ")" : "") + ", seuil " + (sens === "min" ? "≥ " : "≤ ") + fs + "." + chevauche(t) };
      },
    };
  }

  const PROFILS = [
    { cle: "defensif", nom: "Défensif", lettre: "D", desc: "Croissance modérée, avantage concurrentiel, solidité : tes 7 critères du volet défensif.", criteres: CRITERES },
    {
      cle: "offensif", nom: "Offensif", lettre: "O", desc: "Forte croissance rentable, payée par le cash, à un prix encore raisonnable rapporté à la croissance.",
      criteres: [
        critSeuil("ca", "Croissance du CA", "of_ca_min", "min", (l) => premier(l, CA_REF), "%"),
        critSeuil("bpa", "Croissance du BPA", "of_bpa_min", "min", (l) => premier(l, BPA_REF), "%"),
        critSeuil("mb", "Marge brute", "of_mb_min", "min", (l) => ({ v: l.marge_brute_ttm_pct, src: "12 derniers mois" }), "%"),
        critSeuil("mo", "Marge opérationnelle", "of_mo_min", "min", (l) => ({ v: l.marge_op_ttm_pct, src: "12 derniers mois" }), "%"),
        {
          cle: "peg", nom: "PEG (PER / croissance du BPA)", seuils: ["of_peg_max"],
          eval: function (l, s) {
            const g = premier(l, BPA_REF.slice(0, 2)), per = l.per_prev;
            if (per == null || per <= 0) return { statut: INCONNU, valeur: null, texte: "PER prévisionnel absent ou négatif : PEG incalculable." };
            if (g.v == null) return { statut: INCONNU, valeur: null, texte: "Pas de prévision de croissance du BPA : PEG incalculable." };
            if (g.v <= 0) return { statut: ECHEC, valeur: "n.s.", texte: "BPA attendu en baisse (" + pctS(g.v) + ") : le PEG n'a pas de sens, critère non rempli." };
            const peg = per / g.v;
            return { statut: peg <= s.of_peg_max ? OK : ECHEC, valeur: fmtF(peg, 2), texte: "PEG " + fmtF(peg, 2) + " = PER " + fmt(per) + " / croissance du BPA " + fmt(g.v) + " % (" + g.src + "), seuil ≤ " + fmt(s.of_peg_max) + "." };
          },
        },
        {
          cle: "fcf", nom: "Cash-flow libre positif", seuils: [],
          eval: function (l) {
            const v = l.fcf_ttm != null ? l.fcf_ttm : l.fcf;
            if (v == null) return { statut: INCONNU, valeur: null, texte: "Cash-flow libre absent." };
            return { statut: v > 0 ? OK : ECHEC, valeur: v > 0 ? "positif" : "négatif", texte: "Cash-flow libre " + (v > 0 ? "positif" : "négatif ou nul") + (l.fcf_ttm != null ? " sur 12 mois." : " sur le dernier exercice.") };
          },
        },
        critSeuil("lev", "Dette nette / EBITDA", "of_lev_max", "max", levierMesure, "×"),
      ],
    },
    {
      cle: "rendement", nom: "Rendement", lettre: "R", desc: "Un dividende élevé, couvert par le cash, sans baisse depuis 5 ans, porté par un bilan solide et une action peu volatile.",
      criteres: [
        critSeuil("rdt", "Rendement du dividende", "rd_rdt_min", "min", (l) => ({ v: l.rendement_div_pct, src: "12 derniers mois" }), "%"),
        critSeuil("payout", "Taux de distribution", "rd_payout_max", "max", (l) => ({ v: l.taux_distribution_pct, src: "part du bénéfice versée" }), "%"),
        {
          cle: "couv", nom: "Dividendes couverts par le cash-flow libre", seuils: [],
          eval: function (l) {
            const d = l.dividendes_verses, f = l.fcf;
            if (d == null || f == null) return { statut: INCONNU, valeur: null, texte: "Dividendes versés ou cash-flow libre du dernier exercice absents." };
            if (d === 0) return { statut: ECHEC, valeur: "aucun", texte: "Aucun dividende versé sur le dernier exercice." };
            const r = f > 0 ? d / f : null;
            return { statut: d <= f ? OK : ECHEC, valeur: r != null ? fmtF(r, 2) + "×" : "FCF ≤ 0", texte: r != null ? "Dividendes = " + fmtF(r, 2) + " fois le cash-flow libre du dernier exercice (seuil ≤ 1)." : "Cash-flow libre négatif : le dividende n'est pas couvert." };
          },
        },
        {
          cle: "hist", nom: "Pas de baisse du dividende", seuils: ["rd_annees_min"],
          eval: function (l, s) {
            if (l.div_annees == null) return { statut: INCONNU, valeur: null, texte: "Historique des dividendes absent." };
            if (l.div_annees < s.rd_annees_min) return { statut: ECHEC, valeur: l.div_annees + " an" + (l.div_annees > 1 ? "s" : ""), texte: "Seulement " + l.div_annees + " année(s) de dividendes connues, seuil " + s.rd_annees_min + "." };
            const ok = (l.div_baisses || 0) === 0;
            return {
              statut: ok ? OK : ECHEC, valeur: ok ? "aucune baisse" : l.div_baisses + " baisse" + (l.div_baisses > 1 ? "s" : ""),
              texte: (ok ? "Aucune baisse" : l.div_baisses + " baisse(s)") + " du dividende par action sur " + l.div_annees + " ans" + (l.croissance_div_pct != null ? ", croissance annuelle moyenne " + pctS(l.croissance_div_pct) : "") + ". Un dividende exceptionnel ou un effet de change peut créer une fausse baisse.",
            };
          },
        },
        critSeuil("lev", "Dette nette / EBITDA", "rd_lev_max", "max", levierMesure, "×"),
        critSeuil("beta", "Bêta", "rd_beta_max", "max", (l) => ({ v: l.beta, src: null }), ""),
      ],
    },
    {
      cle: "valeur", nom: "Valeur", lettre: "V", desc: "Des entreprises bon marché sur plusieurs mesures, qui ne déclinent pas et ne sont pas surendettées.",
      criteres: [
        critSeuil("per", "PER prévisionnel", "va_per_max", "max", (l) => ({ v: l.per_prev != null && l.per_prev > 0 ? l.per_prev : null, src: null }), ""),
        critSeuil("ve", "VE / EBITDA", "va_ve_max", "max", (l) => ({ v: l.ve_ebitda != null && l.ve_ebitda > 0 ? l.ve_ebitda : null, src: null }), "×"),
        critSeuil("fcf", "Rendement du cash-flow libre", "va_fcf_min", "min", (l) => ({ v: l.rendement_fcf_pct, src: "cash-flow libre / capitalisation" }), "%"),
        critSeuil("pb", "Cours / valeur comptable", "va_pb_max", "max", (l) => ({ v: l.cours_vc != null && l.cours_vc > 0 ? l.cours_vc : null, src: null }), "×"),
        critSeuil("ca", "Croissance du CA", "va_ca_min", "min", (l) => premier(l, CA_REF.concat([["tcac_ca_pct", "moyenne annuelle des derniers exercices"]])), "%"),
        critSeuil("lev", "Dette nette / EBITDA", "va_lev_max", "max", levierMesure, "×"),
      ],
    },
  ];

  function evaluerProfil(cle, l, s) {
    s = s || SEUILS_DEFAUT;
    let res;
    if (cle === "defensif") res = evaluer(l, s);
    else {
      const p = PROFILS.filter((x) => x.cle === cle)[0];
      res = {};
      p.criteres.forEach((c) => { res[c.cle] = c.eval(l, s); });
    }
    let ok = 0, inc = 0;
    Object.keys(res).forEach((k) => { if (res[k].statut === OK) ok++; else if (res[k].statut === INCONNU) inc++; });
    return { res: res, verdict: verdict(res), ok: ok, inconnus: inc, total: Object.keys(res).length };
  }

  // ---------- import des résultats du script ----------
  function n(v) {
    if (v == null) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const t = String(v).trim();
    if (t === "" || /^(none|nan|null)$/i.test(t)) return null;
    const x = Number(t.replace(/[\s  ]/g, "").replace(",", "."));
    return isFinite(x) ? x : null;
  }
  function b(v) {
    if (v == null) return null;
    if (typeof v === "boolean") return v;
    const t = String(v).trim().toLowerCase();
    if (["true", "oui", "1", "vrai"].indexOf(t) >= 0) return true;
    if (["false", "non", "0", "faux"].indexOf(t) >= 0) return false;
    return null;
  }
  function str(v) {
    if (v == null) return null;
    const t = String(v).trim();
    return t === "" || /^none$/i.test(t) ? null : t;
  }

  const SCHEMA = {
    str: ["ticker", "nom", "pays", "bourse", "secteur", "industrie", "devise", "devise_comptable", "reco", "trimestre", "exercice",
      "region", "liste", "statut", "motif", "date_extraction", "source", "croissance_source"],
    bool: ["tresorerie_nette", "pea_possible", "capex_couvert", "rachats_absents", "dividendes_absents"],
    num: ["cours", "capi", "capi_usd", "per_passe", "per_prev", "ve_ebitda", "cours_vc", "rendement_div_pct", "taux_distribution_pct",
      "roe_pct", "marge_brute_ttm_pct", "marge_op_ttm_pct", "marge_nette_ttm_pct", "croissance_ca_trim_pct", "croissance_bpa_trim_pct",
      "dette_totale", "tresorerie", "ebitda_ttm", "fcf_ttm", "perf_52s_pct", "plus_haut_52s", "objectif_moyen", "nb_analystes",
      "dette_nette_ttm", "levier_ttm", "rendement_fcf_pct", "potentiel_pct", "ecart_plus_haut_pct",
      "croissance_ca_0y_pct", "croissance_ca_1y_pct", "croissance_bpa_0y_pct", "croissance_bpa_1y_pct",
      "ca", "dividendes_verses", "tcac_ca_pct", "div_annees", "div_baisses", "croissance_div_pct",
      "capex_pct_ca", "marge_op_pct", "marge_brute_ecart_type", "marge_brute_nb_annees", "fcf", "retours",
      "dette_nette", "dette_nette_prec", "ebitda", "croissance_pct", "beta"],
  };

  function normaliserLigne(row) {
    const o = {};
    SCHEMA.str.forEach((k) => { o[k] = str(row[k]); });
    SCHEMA.bool.forEach((k) => { o[k] = b(row[k]); });
    SCHEMA.num.forEach((k) => { o[k] = n(row[k]); });
    if (!o.statut) {
      // fichier de screener_qualite.py (version 1) : statut déduit du verdict
      const v = str(row.verdict);
      o.statut = v === "ERREUR" ? "ERREUR" : v === "EXCLU" && o.motif && !str(row.capex_statut) ? "EXCLU" : "OK";
    }
    const ex = exclusion(o.ticker, o.nom);
    if (ex) { o.statut = "EXCLU"; o.motif = ex; }
    return o;
  }

  function lireFichier(nomFichier, texte) {
    let brut, meta = null;
    if (/\.json$/i.test(nomFichier) || /^\s*[\[{]/.test(texte)) {
      const j = JSON.parse(texte);
      if (Array.isArray(j)) brut = j;
      else if (j && Array.isArray(j.lignes)) { brut = j.lignes; meta = j.meta || null; }
      else throw new Error("JSON non reconnu : il faut le fichier produit par crible_marches.py ou screener_qualite.py.");
    } else {
      brut = parseCSV(texte);
    }
    if (!brut.length) throw new Error("Le fichier ne contient aucune ligne.");
    if (!Object.prototype.hasOwnProperty.call(brut[0], "ticker")) throw new Error("Colonne « ticker » introuvable : ce n'est pas un fichier du script.");
    return { meta: meta, lignes: brut.map(normaliserLigne) };
  }

  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    const first = text.split(/\r?\n/, 1)[0] || "";
    const delim = first.split(";").length >= first.split(",").length ? ";" : ",";
    const rows = [];
    let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.trim());
    return rows.filter((r) => r.some((x) => x !== "")).map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = r[i] == null ? "" : r[i]; });
      return o;
    });
  }

  root.Moteur = {
    OK: OK, ECHEC: ECHEC, INCONNU: INCONNU, SEUILS_DEFAUT: SEUILS_DEFAUT, CRITERES: CRITERES, EXCLUSIONS: EXCLUSIONS, PROFILS: PROFILS,
    exclusion: exclusion, fmt: fmt, fmtF: fmtF, signe: signe, evaluer: evaluer, verdict: verdict, evaluerProfil: evaluerProfil,
    lireFichier: lireFichier, parseCSV: parseCSV, normaliserLigne: normaliserLigne,
  };
})(_racine);



export const Moteur = _racine.Moteur;
export default Moteur;
