import type { ReactNode } from 'react';

export default function LinkButtons({ children }: { children: ReactNode }) {
  return (
    <div className="link-button-wrapper">
      <div className="btn-link-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        {children}
      </div>
    </div>
  );
}
