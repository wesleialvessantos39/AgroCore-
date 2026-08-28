import type { ReactNode } from 'react';

interface MainContentProps {
  children?: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 w-full bg-[#F8FAF9] text-[#0F172A] p-4 sm:p-6 lg:p-8 outline-none overflow-y-auto"
      style={{
        paddingBottom: 'calc(2rem + var(--sab, 0px))',
        paddingLeft: 'max(1rem, var(--sal, 0px))',
        paddingRight: 'max(1rem, var(--sar, 0px))',
      }}
    >
      <div className="max-w-7xl mx-auto w-full">
        {children}
      </div>
    </main>
  );
}
