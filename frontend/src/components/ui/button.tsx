import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    loading?: boolean;
}

export function Button({ children, loading = false, disabled, ...props }: ButtonProps) {
    return (
        <button
            className="inline-flex min-h-11.5 cursor-pointer items-center justify-center rounded-[10px] bg-brand text-sm font-semibold text-white transition-[background,transform,box-shadow] duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:bg-brand-dark hover:not-disabled:shadow-[0_8px_18px_rgb(11_143_56_/_18%)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || loading}
            {...props}
        >
            {loading ? "Please wait…" : children}
        </button>
    );
}
