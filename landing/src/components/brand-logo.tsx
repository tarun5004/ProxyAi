import Image from "next/image";

export function BrandLogo() {
    return (
        <Image
            className="block h-auto w-36 object-contain sm:w-40"
            src="/proxiai-logo.png"
            alt="ProxyAi"
            width={360}
            height={90}
            priority
        />
    );
}
