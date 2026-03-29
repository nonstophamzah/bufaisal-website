'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type Lang = 'en' | 'ar';

interface LangContextType {
  lang: Lang;
  toggle: () => void;
  t: (en: string, ar: string) => string;
  isAr: boolean;
}

const LangContext = createContext<LangContextType>({
  lang: 'en',
  toggle: () => {},
  t: (en) => en,
  isAr: false,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  const toggle = useCallback(() => {
    setLang((l) => (l === 'en' ? 'ar' : 'en'));
  }, []);

  const t = useCallback(
    (en: string, ar: string) => (lang === 'ar' ? ar : en),
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, toggle, t, isAr: lang === 'ar' }}>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>{children}</div>
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
