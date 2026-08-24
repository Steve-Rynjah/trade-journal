/**
 * The shape a server action reports back with.
 *
 * Deliberately its own module: `app/actions.ts` carries "use server", and such
 * a file may only export async functions — a plain object like
 * `EMPTY_FORM_STATE` living there is a runtime error the moment the module is
 * evaluated.
 */
export type FormState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Field-level errors, keyed by input name. */
  fieldErrors?: Record<string, string>;
};

export const EMPTY_FORM_STATE: FormState = { status: "idle", message: "" };
