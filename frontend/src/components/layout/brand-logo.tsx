import Image from "next/image";

export function BrandLogo({ compact = false }: Readonly<{ compact?: boolean }>) {
    return (
        <Image
            className={`block h-auto object-contain ${compact ? "w-36" : "w-47.5"}`}
            src="/proxiai-logo.png"
            alt="ProxyAi"
            width={360}
            height={90}
            priority
        />
    );
}
