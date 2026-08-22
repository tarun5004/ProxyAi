"use client";

import { ArrowLeft, Buildings, EnvelopeSimple, LockKey, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";

import { useAuth } from "./auth-provider";
import type { PublicDemoLoginDefaults } from "./public-demo";

const GENERIC_LOGIN_ERROR =
    "We couldn't sign you in. Check your details and try again.";

interface LoginScreenProps {
    readonly initialValues?: PublicDemoLoginDefaults;
}

export function LoginScreen({ initialValues }: LoginScreenProps) {
    const auth = useAuth();
    const router = useRouter();
    const [organisationSlug, setOrganisationSlug] = useState(
        initialValues?.organisationSlug ?? "",
    );
    const [email, setEmail] = useState(initialValues?.email ?? "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string>();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (auth.status === "authenticated") {
            router.replace("/chat");
        }
    }, [auth.status, router]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError(undefined);

        try {
            await auth.login({ organisationSlug, email, password });
            router.replace("/chat");
        } catch {
            setError(GENERIC_LOGIN_ERROR);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="grid min-h-dvh place-items-center bg-app-bg px-5 py-8 max-[520px]:items-start max-[520px]:pt-[10vh]">
            <section
                className="grid w-full max-w-[430px] justify-items-center gap-[30px] rounded-[18px] border border-border-default bg-surface px-10 pt-12 pb-11 shadow-soft max-[520px]:border-0 max-[520px]:px-2 max-[520px]:py-6 max-[520px]:shadow-none"
                aria-labelledby="login-title"
            >
                <Link
                    className="rounded focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand/25"
                    href="/"
                    aria-label="Back to ProxiAI home"
                >
                    <BrandLogo />
                </Link>
                <div className="grid gap-2 text-center">
                    <h1
                        className="m-0 text-[clamp(25px,3vw,31px)] font-bold tracking-[-0.035em]"
                        id="login-title"
                    >
                        Welcome back
                    </h1>
                    <p className="m-0 text-sm text-text-soft">
                        Sign in to your organisation workspace
                    </p>
                    {initialValues ? (
                        <p className="m-0 text-xs leading-5 text-text-muted">
                            Public demo identifiers are prefilled. Enter the separately provided rotating password.
                        </p>
                    ) : null}
                </div>

                <form className="grid w-full gap-[18px]" onSubmit={handleSubmit}>
                    <InputField
                        id="organisationSlug"
                        label="Organisation slug"
                        icon={Buildings}
                        autoComplete="organization"
                        placeholder="acme-corp"
                        value={organisationSlug}
                        onChange={(event) => setOrganisationSlug(event.target.value)}
                        required
                    />
                    <InputField
                        id="email"
                        label="Email"
                        icon={EnvelopeSimple}
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                    <InputField
                        id="password"
                        label="Password"
                        icon={LockKey}
                        type="password"
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        maxLength={256}
                        required
                    />

                    {error ? (
                        <div
                            className="flex items-start gap-2 rounded-[10px] bg-danger-soft px-[13px] py-3 text-[13px] leading-[1.45] text-danger"
                            role="alert"
                        >
                            <WarningCircle className="mt-px shrink-0" size={19} weight="fill" />
                            <span>{error}</span>
                        </div>
                    ) : null}

                    <Button type="submit" loading={submitting}>
                        Sign in
                    </Button>
                </form>
                <Link
                    className="inline-flex items-center gap-2 text-sm font-medium text-text-soft hover:text-text-primary focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand/25"
                    href="/"
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back to home
                </Link>
            </section>
        </main>
    );
}
