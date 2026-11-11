import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function LoadingState({ children, className = '' }: { children: ReactNode; className?: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let visible = true;
    const update = () => setPaused(!visible || document.visibilityState === 'hidden');
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      update();
    });
    if (element.current) observer?.observe(element.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <div ref={element} className={`loading-state ${className}`} data-motion-paused={paused} role="status" aria-live="polite">
    <span className="loading-state-mark" aria-hidden="true">
      <img className="loading-brand-gear" src="/favicon.svg" alt="" width="48" height="48" />
    </span>
    <span>{children}</span>
  </div>;
}
