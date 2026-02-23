import type { CSSProperties } from 'react';
import type { Locale } from '../../lib/i18n';
import { FONT_MAIN } from '../../lib/fonts';

interface LanguageToggleProps {
  locale: Locale;
  onToggle: () => void;
  style?: CSSProperties;
}

export function LanguageToggle({ locale, onToggle, style }: LanguageToggleProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        fontSize: 14,
        letterSpacing: '.2em',
        color: 'rgba(255,255,255,.5)',
        background: 'none',
        border: '1px solid rgba(255,255,255,.15)',
        borderRadius: 3,
        padding: '5px 12px',
        cursor: 'pointer',
        fontFamily: FONT_MAIN,
        ...style,
      }}
    >
      {locale === 'en' ? '中文 ZH-CN' : 'ENGLISH EN'}
    </button>
  );
}
