import styles from './NeonButton.module.css'

export default function NeonButton({
  children,
  onClick,
  variant = 'cyan',
  disabled = false,
  loading = false,
  className = '',
}) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <span className={styles.loader}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
      ) : (
        children
      )}
      <span className={styles.border} />
      <span className={styles.glow} />
    </button>
  )
}
