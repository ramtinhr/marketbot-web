import type { UseMutationResult } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';

import { renderMessage, useI18n, type Message } from '../../../i18n';
import { Notice, Panel } from '../../../shared/ui';

/**
 * Validate locally, then run the mutation. The error shown is the local
 * problem if there is one, otherwise what the API answered.
 */
export function useValidatedSubmit<V>(mutation: UseMutationResult<void, Error, V>, { validate, variables, onSuccess }: {
    validate: () => Message | null;
    variables: () => V;
    onSuccess: () => void;
}) {
    useI18n();
    const [problem, setProblem] = useState<Message | null>(null);

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const found = validate();
        setProblem(found);
        if (found) return;
        mutation.mutate(variables(), { onSuccess });
    }

    const error = problem ? renderMessage(problem) : mutation.error?.message ?? null;
    return { onSubmit, error, busy: mutation.isPending };
}

/** A panel holding one admin form, its error line and its buttons. */
export function FormPanel({ title, hint, onSubmit, error, children, actions, autoComplete }: {
    title: ReactNode;
    hint: ReactNode;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    error: string | null;
    children: ReactNode;
    actions: ReactNode;
    autoComplete?: 'off';
}) {
    return (
        <Panel title={title} hint={hint}>
            <form className="mt-form admins-form" onSubmit={onSubmit} noValidate autoComplete={autoComplete}>
                {children}
                {error && <Notice tone="red">{error}</Notice>}
                <div className="mt-row">{actions}</div>
            </form>
        </Panel>
    );
}
