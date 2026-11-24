'use client';

import styles from './typing-practice.module.css';

export interface PillSwitchProps {
  checked: boolean;
  onChange: (nextChecked: boolean) => void;
  label: string;
  shortLabel?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  preserveFocus?: boolean;
}

export function PillSwitch({
  checked,
  onChange,
  label,
  shortLabel,
  ariaLabel,
  title,
  disabled = false,
  preserveFocus = true,
}: PillSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      title={title ?? ariaLabel ?? label}
      disabled={disabled}
      className={`${styles.pillSwitch}${checked ? ` ${styles.pillSwitchOn}` : ''}`}
      onPointerDown={
        preserveFocus ? (event) => event.preventDefault() : undefined
      }
      onClick={() => onChange(!checked)}
    >
      <span className={styles.pillSwitchText}>{label}</span>
      {shortLabel && (
        <span className={styles.pillSwitchShortText} aria-hidden="true">
          {shortLabel}
        </span>
      )}
      <span className={styles.pillSwitchTrack} aria-hidden="true">
        <span className={styles.pillSwitchThumb} />
      </span>
    </button>
  );
}
