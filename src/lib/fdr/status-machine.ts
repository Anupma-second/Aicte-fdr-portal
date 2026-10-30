import type { FdrStatus, Role } from "@prisma/client";
import { ApiError } from "@/lib/errors";

export type FdrActor = Role | "SYSTEM";

type Transition = { to: FdrStatus; actors: FdrActor[] };

const OFFICER: FdrActor = "SCRUTINY_OFFICER";
const AUTHORITY: FdrActor = "COMPETENT_AUTHORITY";
const INSTITUTION: FdrActor = "INSTITUTION";
const SYSTEM: FdrActor = "SYSTEM";

const CAN_CONCLUDE: Transition[] = [
  { to: "RENEWED", actors: [OFFICER] },
  { to: "REPLACED", actors: [OFFICER] },
  { to: "RELEASE_REQUESTED", actors: [INSTITUTION] },
];

const TRANSITIONS: Record<FdrStatus, Transition[]> = {
  SUBMITTED: [{ to: "UNDER_SCRUTINY", actors: [OFFICER, SYSTEM] }],
  UNDER_SCRUTINY: [
    { to: "DISCREPANCY_RAISED", actors: [OFFICER, SYSTEM] },
    { to: "VERIFIED", actors: [OFFICER] },
  ],
  // The institution's response sends the case back for another look.
  DISCREPANCY_RAISED: [{ to: "UNDER_SCRUTINY", actors: [OFFICER, INSTITUTION] }],
  VERIFIED: [{ to: "ACTIVE", actors: [OFFICER, SYSTEM] }],
  ACTIVE: [{ to: "EXPIRING", actors: [SYSTEM] }, { to: "MATURED", actors: [SYSTEM] }, ...CAN_CONCLUDE],
  EXPIRING: [{ to: "MATURED", actors: [SYSTEM] }, ...CAN_CONCLUDE],
  MATURED: CAN_CONCLUDE,
  RENEWED: [{ to: "CLOSED", actors: [OFFICER, SYSTEM] }],
  REPLACED: [{ to: "CLOSED", actors: [OFFICER, SYSTEM] }],
  RELEASE_REQUESTED: [
    { to: "RELEASED", actors: [AUTHORITY] },
    // A rejected release returns the FDR to where its dates put it.
    { to: "ACTIVE", actors: [AUTHORITY] },
    { to: "EXPIRING", actors: [AUTHORITY] },
    { to: "MATURED", actors: [AUTHORITY] },
  ],
  RELEASED: [{ to: "CLOSED", actors: [OFFICER, AUTHORITY] }],
  CLOSED: [],
};

export function canTransition(from: FdrStatus, to: FdrStatus, actor: FdrActor): boolean {
  return TRANSITIONS[from].some((transition) => transition.to === to && transition.actors.includes(actor));
}

export function allowedTransitions(from: FdrStatus, actor: FdrActor): FdrStatus[] {
  return TRANSITIONS[from].filter((transition) => transition.actors.includes(actor)).map((transition) => transition.to);
}

/** Separates "this move doesn't exist" (409) from "not your move to make" (403). */
export function assertTransition(from: FdrStatus, to: FdrStatus, actor: FdrActor): void {
  if (canTransition(from, to, actor)) return;
  if (TRANSITIONS[from].some((transition) => transition.to === to)) {
    throw new ApiError(403, "TRANSITION_FORBIDDEN", `${actor} cannot move an FDR from ${from} to ${to}`);
  }
  throw new ApiError(409, "ILLEGAL_TRANSITION", `An FDR cannot move from ${from} to ${to}`);
}
