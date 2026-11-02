import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-cyan-500/90 text-slate-950 hover:bg-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.4),0_8px_24px_-8px_rgba(34,211,238,0.6)]',
        secondary: 'bg-white/[0.06] text-slate-200 hover:bg-white/[0.1] border border-white/[0.08]',
        ghost: 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
        outline: 'border border-white/10 text-slate-200 hover:bg-white/[0.06]',
        danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30',
      },
      size: { default: 'h-9 px-3.5', sm: 'h-7 px-2.5 text-xs rounded-md', icon: 'size-9', iconSm: 'size-7 rounded-md' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
