"use client";

/**
 * Undo/redo for a single piece of state, with gesture coalescing.
 *
 * Markup is the only thing on this chart that can be destroyed by one
 * keystroke, so it is the only thing that keeps a history. The model is the
 * usual three-part one — everything before now, now, everything undone — and
 * every mutation goes through `commit`, which is a drop-in for a `useState`
 * setter so the call sites read the same as they did before.
 *
 * The one addition is `coalesceKey`. A drag reports a new shape on every
 * pointer move, and a hundred history entries for one gesture would make Cmd+Z
 * useless: consecutive commits carrying the same key overwrite the present
 * instead of pushing onto the stack, so the whole drag undoes in one press.
 * The key must be unique per gesture — include a timestamp — or a second drag
 * of the same shape would merge into the first.
 */

import { useCallback, useRef, useState } from "react";

/** How far back Cmd+Z can reach. Deep enough for a session, bounded enough
 *  that a long replay does not retain every shape it ever held. */
const LIMIT = 200;

type Snapshot<T> = { past: T[]; present: T; future: T[] };

export type Commit<T> = (next: T | ((current: T) => T), coalesceKey?: string) => void;

export type History<T> = {
  value: T;
  commit: Commit<T>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function useHistory<T>(initial: T): History<T> {
  const [state, setState] = useState<Snapshot<T>>({ past: [], present: initial, future: [] });
  /** The key the present entry was written under, or null when it is closed. */
  const openKey = useRef<string | null>(null);

  const commit = useCallback<Commit<T>>((next, coalesceKey) => {
    setState((current) => {
      const value =
        typeof next === "function" ? (next as (c: T) => T)(current.present) : next;
      // A setter that returns what it was given is not a change, and should not
      // cost an undo step.
      if (Object.is(value, current.present)) return current;

      const merge = coalesceKey !== undefined && coalesceKey === openKey.current;
      openKey.current = coalesceKey ?? null;

      // Anything new closes the redo branch: the future only exists as long as
      // it is the thing that was undone.
      if (merge) return { past: current.past, present: value, future: [] };
      return {
        past: [...current.past, current.present].slice(-LIMIT),
        present: value,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    openKey.current = null;
    setState((current) => {
      if (current.past.length === 0) return current;
      return {
        past: current.past.slice(0, -1),
        present: current.past[current.past.length - 1],
        future: [current.present, ...current.future].slice(0, LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    openKey.current = null;
    setState((current) => {
      if (current.future.length === 0) return current;
      return {
        past: [...current.past, current.present].slice(-LIMIT),
        present: current.future[0],
        future: current.future.slice(1),
      };
    });
  }, []);

  return {
    value: state.present,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
