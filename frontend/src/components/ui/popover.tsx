import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const Popover = ({
  children,
  open: controlledOpen,
  onOpenChange,
  className,
}: PopoverProps) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (value: boolean) => {
      if (isControlled) {
        onOpenChange?.(value);
      } else {
        setInternalOpen(value);
      }
    },
    [isControlled, onOpenChange]
  );
  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className={cn('relative inline-block', className)}>{children}</div>
    </PopoverContext.Provider>
  );
};

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, onClick, ...props }, ref) => {
  const ctx = React.useContext(PopoverContext);
  const setRefs = React.useCallback(
    (el: HTMLButtonElement | null) => {
      (ctx?.triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
    },
    [ctx?.triggerRef, ref]
  );
  return (
    <button
      ref={setRefs}
      type="button"
      onClick={(e) => {
        ctx?.setOpen(!ctx.open);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
PopoverTrigger.displayName = 'PopoverTrigger';

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end'; portal?: boolean }
>(({ className, align = 'end', portal = false, children, ...props }, _forwardedRef) => {
  const ctx = React.useContext(PopoverContext);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest('button')
      ) {
        ctx?.setOpen(false);
      }
    };
    if (ctx?.open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [ctx?.open, ctx?.setOpen]);

  if (!ctx?.open) return null;

  const content = (
    <div
      ref={(el) => {
        (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className={cn(
        portal ? 'z-[10000]' : 'absolute z-50',
        'min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        portal ? '' : 'mt-1',
        className
      )}
      style={
        portal && ctx.triggerRef?.current
          ? (() => {
              const rect = ctx.triggerRef.current!.getBoundingClientRect();
              return {
                position: 'fixed' as const,
                top: rect.bottom + 4,
                left: align === 'start' ? rect.left : undefined,
                right: align === 'end' ? window.innerWidth - rect.right : undefined,
              };
            })()
          : undefined
      }
      {...props}
    >
      {children}
    </div>
  );

  if (portal) {
    return createPortal(content, document.body);
  }

  return content;
});
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent };
