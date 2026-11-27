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
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 224,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => String(opt.value) === String(value)) || options[0];

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const approxMenuHeight = Math.min(224, options.length * 30 + 8);
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUpward = spaceBelow < approxMenuHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(224, openUpward ? spaceAbove - 2 : spaceBelow - 2));
      const actualHeight = Math.min(approxMenuHeight, maxHeight);
      const top = openUpward
        ? Math.max(8, rect.top - actualHeight - 2)
        : Math.min(window.innerHeight - actualHeight - 8, rect.bottom + 2);
      const maxWidth = Math.min(380, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 8));
      setCoords({
        top,
        left,
        width: Math.min(rect.width, maxWidth),
        maxHeight,
      });
    }
  };

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    const currentIdx = Math.max(
      0,
      options.findIndex((opt) => String(opt.value) === String(value))
    );
    setActiveIndex(currentIdx);
    updateCoords();
    setIsOpen(true);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      openMenu();
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        openMenu();
      } else {
        setActiveIndex((prev) => (prev + 1) % options.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openMenu();
      } else {
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
      }
    } else if (e.key === 'Home' && isOpen) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End' && isOpen) {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && isOpen) {
      e.preventDefault();
      const targetOpt = options[activeIndex];
      if (targetOpt) handleSelect(targetOpt.value);
    }
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
        triggerRef.current?.focus();
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

  return (
    <div className={`inline-block font-mono text-xs select-none ${className}`} style={{ ...style }}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selectedOption ? selectedOption.label : String(value)}
        title={selectedOption ? selectedOption.label : String(value)}
        className={`w-full flex items-center justify-between gap-2 px-2 py-1 bg-[var(--bg-color)] text-[var(--text-main)] border border-[var(--border-color)] cursor-pointer hover:border-[var(--border-bright)] focus:outline-none focus-visible:border-[var(--border-bright)] transition-colors duration-150 ${
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
          aria-hidden="true"
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
            role="listbox"
            className="fixed bg-[var(--panel-bg)] border border-[var(--border-bright)] shadow-2xl overflow-y-auto font-mono text-xs"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.width}px`,
              maxWidth: 'min(380px, calc(100vw - 16px))',
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 999999,
              animation: 'dropdownSlideDown 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            {options.map((option, idx) => {
              const isSelected = String(option.value) === String(value);
              const isHighlighted = idx === activeIndex;
              return (
                <div
                  key={String(option.value)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  title={option.label}
                  className={`px-2.5 py-1.5 cursor-pointer text-xs transition-colors duration-100 hover:bg-[var(--border-color)] text-[var(--text-main)] flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'font-bold bg-[var(--inset-bg)] text-[var(--text-main)] border-l-2 border-[var(--border-bright)]'
                      : isHighlighted
                      ? 'bg-[var(--border-color)]'
                      : ''
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
