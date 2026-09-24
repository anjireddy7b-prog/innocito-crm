import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-150 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-glass-sm hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-glass-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background/60 shadow-glass-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-glass-sm hover:bg-secondary/80',
        ghost: 'rounded-full hover:bg-secondary/70 hover:text-foreground',
        link: 'rounded-none text-primary underline-offset-4 hover:underline',
        success: 'bg-success text-success-foreground shadow-glass-sm hover:bg-success/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    // When asChild is true, Comp is Radix's Slot, which requires its `children` to be exactly
    // one valid React element (the thing being "slotted onto", e.g. a react-router <Link>) — see
    // https://github.com/radix-ui/primitives Slot implementation. Passing the loading spinner as
    // a sibling of {children} (even though `loading && <Loader2/>` is almost always falsy) still
    // makes JSX build an array of two items for `children`, which Slot rejects with "Slot failed
    // to slot onto its children. Expected a single React element child or `Slottable`." — a
    // synchronous render crash with no visible error boundary in this app, i.e. a blank page.
    // asChild buttons in this codebase never pass `loading` (they wrap a Link, not an async
    // action), so it's safe to just skip the spinner slot entirely in that case.
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
