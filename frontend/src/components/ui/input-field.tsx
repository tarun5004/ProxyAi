import type { ComponentType, InputHTMLAttributes } from "react";

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    icon: ComponentType<{ size?: number; weight?: "regular" }>;
}

export function InputField({ label, icon: Icon, id, ...props }: InputFieldProps) {
    return (
        <label className="grid gap-2" htmlFor={id}>
            <span className="text-[13px] font-semibold text-text-primary">{label}</span>
            <span className="flex min-h-11.5 items-center gap-2.5 rounded-[10px] border border-border-strong bg-surface px-[13px] text-text-soft transition-[border,box-shadow] duration-150 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(11_143_56_/_10%)]">
                <Icon size={18} weight="regular" />
                <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-0 placeholder:text-text-faint"
                    id={id}
                    {...props}
                />
            </span>
        </label>
    );
}
