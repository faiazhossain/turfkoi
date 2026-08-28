"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"

import { askAssistantAction } from "@/features/erp/actions"

const SUGGESTED: { labelKey: string; question: string }[] = [
  { labelKey: "erp.assistant.chipProfit", question: "এই মাসে আমার লাভ কত?" },
  { labelKey: "erp.assistant.chipBestDay", question: "কোন দিনে আমার সবচেয়ে বেশি আয় হয়?" },
  { labelKey: "erp.assistant.chipExpense", question: "কোন খরচ সবচেয়ে বেশি?" },
  { labelKey: "erp.assistant.chipCompare", question: "গত মাসের তুলনায় ব্যবসা কেমন করেছে?" },
  { labelKey: "erp.assistant.chipPeak", question: "কোন সময়ের slot বেশি লাভজনক?" },
  {
    labelKey: "erp.assistant.chipTarget",
    question: "monthly target পূরণ করতে দিনে কত টাকা লাভ করতে হবে?",
  },
]

/**
 * DeshiTurf Business Assistant input. Answers are computed server-side from
 * real ERP data for a fixed set of questions (chips double as the
 * discoverable question set) — never generated numbers.
 */
export function AssistantBox() {
  const { t } = useI18n()
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<{ text: string; period: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function ask(q: string) {
    setError(null)
    setAnswer(null)
    setPending(true)
    try {
      const res = await askAssistantAction({ question: q })
      if (!res.ok) {
        setError(res.error)
      } else {
        setAnswer({ text: res.answer, period: res.period })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (question.trim().length >= 2) void ask(question)
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("erp.assistant.placeholder")}
          aria-label={t("erp.assistant.title")}
          maxLength={300}
        />
        <Button type="submit" loading={pending} disabled={question.trim().length < 2}>
          {t("erp.assistant.ask")}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s.labelKey}
            type="button"
            disabled={pending}
            onClick={() => {
              setQuestion(s.question)
              void ask(s.question)
            }}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {error ? <StatusBadge status="danger">{t(error)}</StatusBadge> : null}
      {answer ? (
        <div className="rounded-xl border border-border bg-card p-4" role="status">
          <p className="text-sm">{answer.text}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("erp.assistant.dataPeriod", { period: answer.period })}
          </p>
        </div>
      ) : null}
    </div>
  )
}
