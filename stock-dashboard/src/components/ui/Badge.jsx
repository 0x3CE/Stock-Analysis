import styles from './Badge.module.css';

/**
 * Badge — Étiquette colorée pour secteur, marché ou devise.
 * La couleur est entièrement dynamique, fournie via prop.
 */
export const Badge = ({ label, color = '#3b82f6' }) => (
  <span
    className={styles.badge}
    style={{
      color,
      backgroundColor: `${color}18`,
      borderColor: `${color}35`,
    }}
  >
    {label}
  </span>
);
