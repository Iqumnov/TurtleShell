import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: any) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  style = {},
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => String(opt.value) === String(value)) || options[0];

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const approxMenuHeight = Math.min(224, options.length * 30 + 8);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < approxMenuHeight && rect.top > approxMenuHeight;
      const top = openUpward
        ? Math.max(8, rect.top - approxMenuHeight - 2)
        : Math.min(window.innerHeight - 48, rect.bottom + 2);
      const maxWidth = Math.min(380, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 8));
      setCoords({
        top,
        left,
        width: Math.min(rect.width, maxWidth),
      });
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updateCoords();
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown on click outside, outer scroll, resize, or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = (e: Event) => {
      if (
        e.type === 'scroll' &&
        menuRef.current &&
        e.target instanceof Node &&
        menuRef.current.contains(e.target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className={`inline-block font-mono text-xs select-none ${className}`} style={{ ...style }}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        title={selectedOption ? selectedOption.label : String(value)}
        className={`w-full flex items-center justify-between gap-2 px-2 py-1 bg-[var(--bg-color)] text-[var(--text-main)] border border-[var(--border-color)] cursor-pointer hover:border-[var(--border-bright)] focus:outline-none transition-colors duration-150 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : value}</span>
        <svg
          width="8"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M1 1L5 5L9 1" />
        </svg>
      </button>

      {/* Portal Menu: Mounted at Document Root to bypass ALL container overflow:hidden restrictions */}
      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            className="fixed bg-[var(--panel-bg)] border border-[var(--border-bright)] shadow-2xl max-h-56 overflow-y-auto font-mono text-xs"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.width}px`,
              maxWidth: 'min(380px, calc(100vw - 16px))',
              zIndex: 999999,
              animation: 'dropdownSlideDown 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            {options.map((option) => {
              const isSelected = String(option.value) === String(value);
              return (
                <div
                  key={String(option.value)}
                  onClick={() => handleSelect(option.value)}
                  title={option.label}
                  className={`px-2.5 py-1.5 cursor-pointer text-xs transition-colors duration-100 hover:bg-[var(--border-color)] text-[var(--text-main)] flex items-center justify-between gap-2 ${
                    isSelected ? 'font-bold bg-[var(--inset-bg)] text-[var(--text-main)] border-l-2 border-[var(--border-bright)]' : ''
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <span className="text-[10px] ml-1 flex-shrink-0">✓</span>}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
