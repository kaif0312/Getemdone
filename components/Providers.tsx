'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { BiometricProvider } from '@/contexts/BiometricContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BiometricProvider>
          {children}
        </BiometricProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
