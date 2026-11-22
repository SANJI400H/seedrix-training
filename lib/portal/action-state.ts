/** Shared return shape of portal server actions. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Warnings the user must explicitly confirm before the action goes through. */
  confirm?: string[];
  message?: string;
};

export const initialState: ActionState = {};
