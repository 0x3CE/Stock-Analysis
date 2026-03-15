import { Award } from 'lucide-react';
import { PiotroskiGauge } from '../components/ui/PiotroskiGauge';
import { getPiotroskiColor } from '../utils/Formatters';
import styles from './PiotroskiTab.module.css';

const CriterionCard = ({ criterion, score, detail }) => (
  <div className={`${styles.criterion} ${score === 1 ? styles.criterionPass : styles.criterionFail}`}>
    <div className={styles.criterionRow}>
      <span className={styles.criterionName}>{criterion}</span>
      <span className={`${styles.criterionBadge} ${score === 1 ? styles.criterionBadgePass : styles.criterionBadgeFail}`}>
        {score === 1 ? '✓ OUI' : '✗ NON'}
      </span>
    </div>
    <div className={styles.criterionDetail}>{detail}</div>
  </div>
);

const PiotroskiTab = ({ piotroski_score }) => {
  const pioColors = getPiotroskiColor(piotroski_score.total_score);

  const categories = [
    { title: 'Rentabilité',               color: '#3b82f6', items: piotroski_score.profitability, delay: 0.1  },
    { title: 'Levier / Liquidité',        color: '#8b5cf6', items: piotroski_score.leverage,      delay: 0.15 },
    { title: 'Efficacité Opérationnelle', color: '#22c55e', items: piotroski_score.operating,     delay: 0.2  },
  ];

  return (
    <div>
      {/* En-tête score global */}
      <div
        className={styles.headerCard}
        style={{ borderColor: `${pioColors.text}30`, animation: 'cardIn 0.4s ease 0.05s forwards' }}
      >
        <div className={styles.headerInner}>
          <PiotroskiGauge score={piotroski_score.total_score} />

          <div className={styles.headerMeta}>
            <div className={styles.headerTitleRow}>
              <Award size={20} style={{ color: '#f59e0b' }} />
              <h2 className={styles.headerTitle}>Piotroski F-Score</h2>
            </div>

            <p className={styles.interpretation}>{piotroski_score.interpretation}</p>

            <div className={styles.miniSummary}>
              {categories.map(({ title, items }) => (
                <span key={title} className={styles.miniTag}>
                  {title.split(' ')[0]} {items.filter(c => c.score === 1).length}/{items.length}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Détail des 3 catégories */}
      <div className={styles.categoriesGrid}>
        {categories.map(({ title, color, items, delay }) => (
          <div
            key={title}
            className={styles.categoryCard}
            style={{ animation: `cardIn 0.4s ease ${delay}s forwards` }}
          >
            <h3 className={styles.categoryTitle} style={{ color }}>{title}</h3>
            <div className={styles.criteriaList}>
              {items.map((item, idx) => (
                <CriterionCard key={idx} {...item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PiotroskiTab;
