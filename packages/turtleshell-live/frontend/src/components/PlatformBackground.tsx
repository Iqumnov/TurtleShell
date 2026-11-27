import React, { useState, useEffect } from 'react';
import { useSimStore } from '../store/useSimStore';

const PLATFORM_IMAGES: Record<string, string> = {
  trapped_ion_paul_trap: '/TrappedIonPaulTrap.PNG',
  sr_optical_lattice: '/SrOpticalLattice.PNG',
  eagle: '/IBMEagle.PNG',
  heron: '/IBMHeron.PNG',
};

export const PlatformBackground: React.FC = () => {
  const qpuType = useSimStore((state) => state.qpuType);
  const theme = useSimStore((state) => state.theme);
  const currentImg = PLATFORM_IMAGES[qpuType] || '/TrappedIonPaulTrap.PNG';

  const [displayImg, setDisplayImg] = useState<string>(currentImg);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (currentImg !== displayImg) {
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayImg(currentImg);
        setVisible(true);
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [currentImg, displayImg]);

  const isLight = theme === 'light';

  return (
    /*
     * Stacking order:
     *   body background-image grid  (background-attachment:fixed — never scrolls)
     *   z-index 1  → THIS image (above grid, below panels)
     *   z-index 9998 → body::after vignette (fixed)
     *   z-index 9999 → body::before grain (fixed)
     *   z-index 200  → .hud-panel::after per-panel grain (scrolls with block)
     *
     * Position: vertically centred, 80px bleed off left edge.
     * Height: 85vh / max 760px — large but never exactly touching top or bottom.
     * Dual-axis mask: right → transparent + top 6% / bottom 6% soft fade.
     */
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '-80px',
        transform: 'translateY(-50%)',
        width: 'min(680px, 95vw)',
        height: '85vh',
        maxHeight: '760px',
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 1,
        maskImage:
          'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 55%, rgba(0,0,0,0) 100%), ' +
          'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 6%, rgba(0,0,0,1) 94%, rgba(0,0,0,0) 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 55%, rgba(0,0,0,0) 100%), ' +
          'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 6%, rgba(0,0,0,1) 94%, rgba(0,0,0,0) 100%)',
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      }}
    >
      {/* Background lattice obscuring layer: ensures platform image sits ABOVE the body grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 35% 50%, var(--bg-color) 25%, transparent 75%)',
          opacity: 0.9,
          pointerEvents: 'none',
        }}
      />

      <img
        src={displayImg}
        alt=""
        decoding="async"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'left center',
          opacity: visible ? (isLight ? 0.22 : 0.32) : 0,
          filter: isLight
            ? 'invert(1) hue-rotate(180deg) contrast(1.15)'
            : 'contrast(1.15) saturate(0.5)',
          transition: 'opacity 380ms ease',
        }}
      />
    </div>
  );
};
