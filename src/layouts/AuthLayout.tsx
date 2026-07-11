import type { ReactNode } from 'react';
import LoginButton from '../components/LoginButton';

interface AuthLayoutProps {
  children?: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#1E40AF] px-4">
      <div className="flex flex-col items-center gap-6 motion-safe:animate-fade-in-up">
        <h1 className="text-5xl font-bold text-white tracking-tight">
          Karta
        </h1>
        <p className="text-blue-200 text-lg text-center max-w-sm">
          Mapas mentales colaborativos
        </p>

        {children ?? <LoginButton />}
      </div>

      <footer className="absolute bottom-6 text-blue-300 text-xs text-center">
        <p>v0.1.0 — © 2025 Iuval HQ</p>
      </footer>
    </div>
  );
}
