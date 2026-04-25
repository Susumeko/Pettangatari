import { Skeleton } from 'boneyard-js/react';
import type { ReactNode } from 'react';

interface MenuSkeletonProps {
  loading: boolean;
  children: ReactNode;
}

function FallbackMenuSkeleton() {
  return (
    <div className="menu-skeleton" aria-hidden="true">
      <div className="skeleton-line long" />
      <div className="skeleton-line medium" />
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
      <div className="skeleton-line short" />
    </div>
  );
}

export function MenuSkeleton({ loading, children }: MenuSkeletonProps) {
  return (
    <Skeleton name="main-menu" loading={loading} fallback={<FallbackMenuSkeleton />}>
      {children}
    </Skeleton>
  );
}
