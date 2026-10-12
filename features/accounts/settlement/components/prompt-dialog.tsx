"use client";

/**
 * Qt `AppMessage::askText(title, question, …, required, suggestions)` — one
 * line of text, required, with the usual answers one click away. Enter answers
 * (when there is text), Esc backs out.
 */
import { useState } from "react";
import { SettlementDialog } from "./settlement-dialog";
import styles from "../page.module.scss";

export type PromptRequest = {
  title: string;
  question: string;
  placeholder: string;
  suggestions: readonly string[];
  maxLength: number;
  confirmLabel: string;
  onAnswer: (answer: string) => void;
};

export function PromptDialog({ request, onClose }: { request: PromptRequest; onClose: () => void }) {
  const [answer, setAnswer] = useState("");
  const ready = answer.trim() !== "";

  const submit = () => {
    if (!ready) return;
    onClose();
    request.onAnswer(answer.trim());
  };

  return (
    <SettlementDialog
      title={request.title}
      size="narrow"
      onClose={onClose}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.button} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="settlement-prompt" className={styles.primaryButton} disabled={!ready}>
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <form
        id="settlement-prompt"
        className={styles.formGrid}
        style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className={styles.hint} style={{ whiteSpace: "pre-line" }}>
          {request.question}
        </p>
        <input
          className={styles.input}
          value={answer}
          maxLength={request.maxLength}
          placeholder={request.placeholder}
          aria-label={request.placeholder}
          autoFocus
          onChange={(event) => setAnswer(event.target.value)}
        />
        {request.suggestions.length > 0 ? (
          <div className={styles.suggestions}>
            {request.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={styles.chip}
                onClick={() => setAnswer(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </SettlementDialog>
  );
}
