'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const applyTheme = (t: Theme) => {
      setTheme(t);
      if (t === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const getSystemTheme = (): Theme =>
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    // Load theme: manual override in localStorage, else system preference
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const hasManualOverride = savedTheme === 'light' || savedTheme === 'dark';

    if (hasManualOverride) {
      applyTheme(savedTheme!);
    } else {
      applyTheme(getSystemTheme());

      // Listen for system preference changes when no manual override
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        if (!localStorage.getItem('theme')) {
          applyTheme(getSystemTheme());
        }
      };
      mq.addEventListener('change', handler);
      setMounted(true);
      return () => mq.removeEventListener('change', handler);
    }

    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    try {
      localStorage.setItem('theme', newTheme);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to save theme to localStorage:', error);
      }
    }
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
