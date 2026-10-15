import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/** The document is the shared scroll surface for every workspace view. */
export const BackToTop: React.FC = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > Math.max(400, window.innerHeight));
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!visible) return null;
  return (
    <button
      type="button"
      className="workspace-back-to-top workspace-button workspace-button-secondary"
      onClick={() => window.scrollTo({ top: 0, left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}
      aria-label="Back to top"
      title="Back to top"
    >
      <ArrowUp className="w-4 h-4" aria-hidden="true" />
      <span>Back to top</span>
    </button>
  );
};
