import type { NoticeProps } from "@/lib/page-data";

export function SetupNotice({ title, message, steps, action }: NoticeProps) {
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <div className="animate-rise rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-white/[0.03]">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M12 7.5v5M12 16.3v.1"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </span>

        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1.5 break-words text-theme-sm text-gray-500 dark:text-gray-400">
          {message}
        </p>

        <ol className="mt-6 space-y-3">
          {steps.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 text-theme-sm text-gray-700 dark:text-gray-300"
            >
              <span className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gray-100 text-theme-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {action ? (
          <a
            href={action.href}
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            {action.label}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 5h10v10M19 5L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : null}
      </div>
    </div>
  );
}
