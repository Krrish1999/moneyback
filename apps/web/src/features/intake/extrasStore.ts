import type { IntakeExtras } from "../../api/types";

/**
 * TEMPORARY: intake answers the API does not accept yet (see IntakeExtras). Kept in memory on the device,
 * keyed by case id, so they are not silently thrown away. Remove once CreateCaseInput carries them.
 */
const extras = new Map<string, IntakeExtras>();

export const intakeExtrasStore = {
  set: (caseId: string, value: IntakeExtras) => void extras.set(caseId, value),
  get: (caseId: string): IntakeExtras | undefined => extras.get(caseId),
};
